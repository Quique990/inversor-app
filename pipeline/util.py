"""Utilidades comunes: rutas, configuración, HTTP con reintentos y registro de salud de fuentes."""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import requests
import yaml

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "config"
WEB_DATA = RAIZ / "web" / "data"

UA = "Mozilla/5.0 (compatible; InversorApp/1.0; +https://github.com)"

log = logging.getLogger("inversor")


def configurar_log() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def cargar_yaml(nombre: str) -> dict:
    with open(CONFIG / nombre, encoding="utf-8") as f:
        return yaml.safe_load(f)


def hoy_iso() -> str:
    return date.today().isoformat()


def ahora_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class Salud:
    """Registro de qué fuentes han funcionado hoy. Se publica en web/data/salud_fuentes.json."""
    ok: dict[str, str] = field(default_factory=dict)
    fallos: dict[str, str] = field(default_factory=dict)

    def bien(self, fuente: str, detalle: str = "ok") -> None:
        self.ok[fuente] = detalle

    def mal(self, fuente: str, error: str) -> None:
        self.fallos[fuente] = error[:300]
        log.warning("Fuente %s falló: %s", fuente, error[:300])

    def a_dict(self) -> dict:
        return {"fecha": ahora_iso(), "ok": self.ok, "fallos": self.fallos,
                "total_ok": len(self.ok), "total_fallos": len(self.fallos)}


def http_get(url: str, *, params: dict | None = None, timeout: float = 20, intentos: int = 3,
             headers: dict | None = None) -> requests.Response:
    """GET con reintentos exponenciales. Lanza la última excepción si todos fallan."""
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    ultimo: Exception | None = None
    for i in range(intentos):
        try:
            r = requests.get(url, params=params, headers=h, timeout=timeout)
            if r.status_code == 429:
                raise requests.HTTPError(f"429 Too Many Requests en {url}")
            r.raise_for_status()
            return r
        except Exception as e:  # noqa: BLE001 - queremos reintentar cualquier fallo de red
            ultimo = e
            time.sleep(1.5 * (2 ** i))
    assert ultimo is not None
    raise ultimo


def escribir_json(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, default=str)
    tmp.replace(ruta)


def leer_json(ruta: Path, defecto: Any = None) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return defecto
