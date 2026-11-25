"""Predicción intradía de TUS activos que no están en el universo público. Solo en el repositorio PRIVADO.

Usa el mismo modelo que pipeline/intradia.py (GARCH + estacionalidad + Kalman + Hedge + calibración) con los
activos de data/cartera.json que tienes ahora mismo y que no tienen ya previsión pública. El ticker sale de lo
que escribiste en la app o del que encontró precios_cartera.py por ISIN (data/precios.json → tickers).

Escribe en la carpeta de salida (en el workflow, la rama `intradia` del repositorio privado):
  intradia.json         -> mismo formato que web/data/intradia.json (la web los fusiona)
  intradia_estado.json  -> lo aprendido; hay que conservarlo entre ejecuciones

Uso: python -m pipeline.intradia_cartera --datos ../datos --salida ../salida
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from . import intradia
from .clasificar import rol_de_activo
from .util import WEB_DATA, cargar_yaml, configurar_log, leer_json, log


def participaciones_vivas(operaciones: list[dict]) -> dict[str, float]:
    n: dict[str, float] = {}
    for o in operaciones or []:
        signo = 1 if o.get("tipo") == "compra" else -1 if o.get("tipo") == "venta" else 0
        n[o.get("isin", "")] = n.get(o.get("isin", ""), 0.0) + signo * float(o.get("participaciones") or 0)
    return n


def activos_a_prever(cartera: dict, precios: dict, isins_publicos: set[str]) -> tuple[list[dict], list[str]]:
    """Lista de "ETF" para intradia.ejecutar y lista de ISIN propios que no se pueden prever (sin ticker)."""
    vivas = participaciones_vivas(cartera.get("operaciones") or [])
    tickers = precios.get("tickers") or {}
    series = precios.get("series") or {}
    etfs, sin_ticker = [], []
    for isin, a in (cartera.get("activos") or {}).items():
        if vivas.get(isin, 0) <= 1e-9 or isin in isins_publicos:
            continue
        t = a.get("yahoo") or (tickers.get(isin) or {}).get("ticker") or (series.get(isin) or {}).get("ticker")
        if not t:
            sin_ticker.append(isin)
            continue
        moneda = (tickers.get(isin) or {}).get("moneda") or (series.get(isin) or {}).get("moneda") or "EUR"
        etfs.append({"id": isin, "isin": isin, "nombre": a.get("nombre") or isin, "yahoo": t,
                     "rol": rol_de_activo(a), "moneda": moneda})
    return etfs, sin_ticker


def ejecutar(dir_datos: Path, salida: Path, **kw) -> dict | None:
    cartera = leer_json(dir_datos / "data" / "cartera.json", {}) or {}
    precios = leer_json(dir_datos / "data" / "precios.json", {}) or {}
    publicos = {e["isin"] for e in cargar_yaml("universo_etf.yaml")["etfs"] if e.get("isin")}
    etfs, sin_ticker = activos_a_prever(cartera, precios, publicos)
    if sin_ticker:
        log.warning("Sin ticker (no se pueden prever): %s", ", ".join(sin_ticker))
    if not etfs:
        log.info("Ningún activo propio fuera del universo: no hay nada que prever")
        return None
    r = intradia.ejecutar(destino=salida, etfs=etfs, ruta_mercado=WEB_DATA / "mercado.json", **kw)
    log.info("Intradía privada: %d de %d activos con previsión", len(r["activos"]), len(etfs))
    return r


if __name__ == "__main__":
    configurar_log()
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True, help="Carpeta del repositorio privado de datos")
    ap.add_argument("--salida", required=True, help="Carpeta donde leer/escribir intradia.json e intradia_estado.json")
    args = ap.parse_args()
    if os.environ.get("FORZAR") == "1" or intradia.dentro_de_horario():
        ejecutar(Path(args.datos), Path(args.salida))
    else:
        log.info("Fuera del horario de Trade Republic: no se hace nada")
