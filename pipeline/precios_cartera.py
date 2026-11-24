"""Precios de TUS activos. Se ejecuta en el repositorio PRIVADO (inversor-datos), nunca en el público.

Lee  data/cartera.json  (activos con su ticker de Yahoo)
Escribe data/precios.json con históricos semanales + último cierre diario y el EUR/USD,
para que la web calcule valor, ganancias por compra y gráficas sin exponer qué tienes.

Uso: python -m pipeline.precios_cartera --datos ../inversor-datos
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from . import indicadores as ind
from .mercados import yahoo_serie
from .util import ahora_iso, configurar_log, escribir_json, leer_json, log


def ejecutar(dir_datos: Path) -> dict:
    configurar_log()
    cartera = leer_json(dir_datos / "data" / "cartera.json", {}) or {}
    activos = cartera.get("activos", {})
    salida = {"generado": ahora_iso(), "series": {}, "fallos": {}}
    tickers = {isin: a.get("yahoo") for isin, a in activos.items() if a.get("yahoo")}
    tickers["__EURUSD"] = "EURUSD=X"
    for clave, ticker in tickers.items():
        try:
            serie, info = yahoo_serie(ticker, rango="10y")
            semanal = ind.muestrear_semanal(serie, max_puntos=700)
            if semanal and semanal[-1][0] != serie[-1][0]:
                semanal.append(serie[-1])
            salida["series"][clave] = {"ticker": ticker, "moneda": info.get("moneda"), "puntos": semanal,
                                       "ultimo": serie[-1], "var_1d": ind.variacion(serie, 1)}
        except Exception as e:  # noqa: BLE001
            salida["fallos"][clave] = f"{ticker}: {e!r}"[:200]
            log.warning("Sin precio para %s (%s): %s", clave, ticker, e)
        time.sleep(0.6)
    escribir_json(dir_datos / "data" / "precios.json", salida)
    log.info("Precios: %d series, %d fallos", len(salida["series"]), len(salida["fallos"]))
    return salida


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True, help="Carpeta del repositorio privado de datos")
    ejecutar(Path(ap.parse_args().datos))
