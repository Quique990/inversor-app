"""Lectura de noticias: RSS/Atom, Google News RSS y GDELT DOC 2.0.

Sin dependencias externas para el parseo (xml.etree), para que el pipeline sea robusto.
"""
from __future__ import annotations

import hashlib
import time
import html
import re
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

from .util import Salud, http_get, log


@dataclass
class Titular:
    titulo: str
    fuente: str
    fuente_id: str
    url: str
    fecha: str | None
    tipo: str
    idioma: str
    peso: int
    resumen: str = ""

    @property
    def clave(self) -> str:
        norm = re.sub(r"[^a-z0-9áéíóúñ ]", "", self.titulo.lower())
        norm = " ".join(norm.split()[:12])
        return hashlib.sha1(norm.encode()).hexdigest()[:12]

    def a_dict(self) -> dict:
        d = asdict(self)
        d["id"] = self.clave
        return d


_TAG = re.compile(r"<[^>]+>")


def _limpiar(texto: str | None, maximo: int = 300) -> str:
    if not texto:
        return ""
    t = html.unescape(_TAG.sub(" ", texto))
    t = " ".join(t.split())
    return t[:maximo]


def _fecha(texto: str | None) -> datetime | None:
    if not texto:
        return None
    texto = texto.strip()
    try:
        return parsedate_to_datetime(texto).astimezone(timezone.utc)
    except (TypeError, ValueError):
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%d"):
        try:
            d = datetime.strptime(texto.replace("Z", "+0000") if fmt.endswith("%z") else texto, fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _hijo(el: ET.Element, *nombres: str) -> str | None:
    for hijo in el:
        etiqueta = hijo.tag.split("}")[-1].lower()
        if etiqueta in nombres:
            if etiqueta == "link" and not (hijo.text or "").strip():
                return hijo.attrib.get("href")
            return hijo.text
    return None


def parsear_feed(xml_bytes: bytes) -> list[dict]:
    """Devuelve [{titulo, url, fecha(datetime|None), resumen, fuente_original}] para RSS 2.0, RDF y Atom."""
    raiz = ET.fromstring(xml_bytes)
    items = [e for e in raiz.iter() if e.tag.split("}")[-1].lower() in ("item", "entry")]
    salida = []
    for it in items:
        titulo = _limpiar(_hijo(it, "title"), 220)
        if not titulo:
            continue
        fuente_original = None
        for hijo in it:
            if hijo.tag.split("}")[-1].lower() == "source":
                fuente_original = (hijo.text or "").strip() or None
        salida.append({
            "titulo": titulo,
            "url": (_hijo(it, "link", "guid") or "").strip(),
            "fecha": _fecha(_hijo(it, "pubdate", "published", "updated", "date")),
            "resumen": _limpiar(_hijo(it, "description", "summary", "content"), 300),
            "fuente_original": fuente_original,
        })
    return salida


def _dentro_de_ventana(f: datetime | None, horas: int) -> bool:
    if f is None:
        return True  # sin fecha: lo aceptamos, se desduplica después
    return f >= datetime.now(timezone.utc) - timedelta(hours=horas)


def leer_rss(fuentes: list[dict], salud: Salud, horas: int = 36) -> list[Titular]:
    titulares: list[Titular] = []
    for f in fuentes:
        try:
            r = http_get(f["url"], timeout=20, intentos=2)
            items = parsear_feed(r.content)
            n = 0
            for it in items:
                if not _dentro_de_ventana(it["fecha"], horas):
                    continue
                titulares.append(Titular(
                    titulo=it["titulo"], fuente=f["nombre"], fuente_id=f["id"], url=it["url"],
                    fecha=it["fecha"].isoformat() if it["fecha"] else None, tipo=f.get("tipo", "general"),
                    idioma=f.get("idioma", "en"), peso=int(f.get("peso", 1)), resumen=it["resumen"]))
                n += 1
            salud.bien(f"rss:{f['id']}", f"{n} titulares")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"rss:{f['id']}", repr(e))
    return titulares


def leer_google_news(consultas: list[dict], salud: Salud, horas: int = 30) -> list[Titular]:
    titulares: list[Titular] = []
    for c in consultas:
        hl, gl = c.get("hl", "en-US"), c.get("gl", "US")
        ceid = f"{gl}:{hl.split('-')[0]}"
        url = f"https://news.google.com/rss/search?q={quote_plus(c['q'])}&hl={hl}&gl={gl}&ceid={ceid}"
        try:
            items = parsear_feed(http_get(url, timeout=20, intentos=2).content)
            n = 0
            for it in items[:40]:
                if not _dentro_de_ventana(it["fecha"], horas):
                    continue
                titulo = it["titulo"]
                medio = it["fuente_original"] or "Google News"
                # Google añade " - Medio" al final del titular
                if " - " in titulo and medio != "Google News" and titulo.endswith(medio):
                    titulo = titulo[: -len(medio) - 3]
                titulares.append(Titular(
                    titulo=titulo, fuente=medio, fuente_id=c["id"], url=it["url"],
                    fecha=it["fecha"].isoformat() if it["fecha"] else None, tipo="agregador",
                    idioma=hl[:2], peso=int(c.get("peso", 1))))
                n += 1
            salud.bien(f"gnews:{c['id']}", f"{n} titulares")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"gnews:{c['id']}", repr(e))
    return titulares


def desduplicar(titulares: list[Titular]) -> list[Titular]:
    vistos: dict[str, Titular] = {}
    for t in titulares:
        previo = vistos.get(t.clave)
        if previo is None or t.peso > previo.peso:
            vistos[t.clave] = t
    return list(vistos.values())


def leer_gdelt(consultas: list[dict], salud: Salud) -> dict:
    """Volumen (% de la cobertura mundial) y tono medio de 7 días para cada consulta.

    Devuelve {id: {"volumen_hoy", "volumen_media_7d", "ratio", "tono_hoy", "tono_media_7d"}}.
    """
    base = "https://api.gdeltproject.org/api/v2/doc/doc"
    salida: dict = {}
    for n, c in enumerate(consultas):
        if n:
            time.sleep(12)  # GDELT limita a ~1 petición cada 5 s por IP; cada consulta hace 2
        try:
            vol = http_get(base, params={"query": c["query"], "mode": "TimelineVol", "timespan": "7d",
                                         "format": "json"}, timeout=30, intentos=2).json()
            time.sleep(6)
            ton = http_get(base, params={"query": c["query"], "mode": "TimelineTone", "timespan": "7d",
                                         "format": "json"}, timeout=30, intentos=2).json()
            sv = [p["value"] for p in vol["timeline"][0]["data"]]
            st = [p["value"] for p in ton["timeline"][0]["data"]]
            # Las series son cada 15 min o por horas: comparamos últimas 24 h con la media de 7 días
            n24 = max(1, len(sv) // 7)
            hoy_v = sum(sv[-n24:]) / n24
            media_v = sum(sv) / len(sv)
            n24t = max(1, len(st) // 7)
            salida[c["id"]] = {
                "volumen_hoy": round(hoy_v, 4), "volumen_media_7d": round(media_v, 4),
                "ratio": round(hoy_v / media_v, 2) if media_v else None,
                "tono_hoy": round(sum(st[-n24t:]) / n24t, 2), "tono_media_7d": round(sum(st) / len(st), 2),
            }
            salud.bien(f"gdelt:{c['id']}")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"gdelt:{c['id']}", repr(e))
    return salida


def recoger_titulares(cfg_fuentes: dict, salud: Salud) -> list[Titular]:
    todos = leer_rss(cfg_fuentes.get("rss", []), salud) + leer_google_news(cfg_fuentes.get("google_news", []), salud)
    unicos = desduplicar(todos)
    log.info("Titulares: %d leídos, %d únicos", len(todos), len(unicos))
    return unicos
