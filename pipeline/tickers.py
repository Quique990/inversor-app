"""Búsqueda del ticker de Yahoo Finance a partir del ISIN (para los activos propios que no lo tienen).

Se ejecuta SOLO en el repositorio privado (precios_cartera.py): el ISIN de tus activos nunca pasa por el público.
Yahoo admite buscar por ISIN en su buscador público (sin clave). Entre las cotizaciones encontradas se prefieren
las de Xetra (en euros y con barras horarias), luego otras bolsas europeas en euros y, por último, el resto.
"""
from __future__ import annotations

import re

from .util import http_get

# Orden de preferencia por sufijo del ticker ("" = bolsa de EE. UU.)
PREFERENCIA = [".DE", ".PA", ".AS", ".MI", ".MC", ".BR", ".VI", "", ".SW", ".L", ".F", ".SG", ".MU", ".DU", ".BE", ".HM", ".HA"]
TIPOS = {"ETF", "EQUITY", "MUTUALFUND", "ETC", "INDEX"}


def sufijo(ticker: str) -> str:
    return "." + ticker.rsplit(".", 1)[1] if "." in ticker else ""


def ordenar_candidatos(quotes: list[dict]) -> list[str]:
    """Tickers candidatos ordenados de mejor a peor."""
    vistos: list[str] = []
    for q in quotes or []:
        t = q.get("symbol")
        # Yahoo a veces devuelve el propio ISIN como ticker (p. ej. "IE00XXXXXXXX.SG"): no tiene precios
        if not t or t in vistos or re.match(r"^[A-Z]{2}[A-Z0-9]{9}\d(\.|$)", t) or (q.get("quoteType") and q["quoteType"] not in TIPOS):
            continue
        vistos.append(t)
    rango = {s: i for i, s in enumerate(PREFERENCIA)}
    return sorted(vistos, key=lambda t: (rango.get(sufijo(t), len(PREFERENCIA)), vistos.index(t)))


def buscar_por_isin(isin: str) -> list[str]:
    ultimo: Exception | None = None
    for host in ("https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"):
        try:
            r = http_get(f"{host}/v1/finance/search", params={"q": isin, "quotesCount": 10, "newsCount": 0}, timeout=20, intentos=2)
            return ordenar_candidatos(r.json().get("quotes") or [])
        except Exception as e:  # noqa: BLE001
            ultimo = e
    assert ultimo is not None
    raise ultimo
