"""Precios de TUS activos. Se ejecuta en el repositorio PRIVADO (inversor-datos), nunca en el público.

Lee  data/cartera.json  (activos; el ticker de Yahoo es opcional)
Escribe data/precios.json con históricos semanales + último cierre diario y el EUR/USD,
para que la web calcule valor, ganancias por compra y gráficas sin exponer qué tienes.

Si un activo no tiene ticker, se busca por su ISIN en Yahoo (tickers.py) y se recuerda en precios.json
(`tickers`), así solo se busca una vez. El ticker escrito a mano en la app siempre manda.

Uso: python -m pipeline.precios_cartera --datos ../inversor-datos
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from . import indicadores as ind
from .mercados import yahoo_serie
from .tickers import buscar_por_isin
from .util import ahora_iso, configurar_log, escribir_json, leer_json, log


def resolver_tickers(activos: dict, anteriores: dict, buscar=buscar_por_isin) -> tuple[dict, dict]:
    """isin -> lista de tickers a probar (el primero que funcione gana). Devuelve (candidatos, fallos)."""
    candidatos: dict[str, list[str]] = {}
    fallos: dict[str, str] = {}
    for isin, a in activos.items():
        if a.get("yahoo"):
            candidatos[isin] = [a["yahoo"]]
        elif (anteriores.get(isin) or {}).get("ticker"):
            candidatos[isin] = [anteriores[isin]["ticker"]]
        else:
            try:
                lista = buscar(isin)
                if lista:
                    candidatos[isin] = lista[:4]
                else:
                    fallos[isin] = "Yahoo no conoce este ISIN"
            except Exception as e:  # noqa: BLE001
                fallos[isin] = f"búsqueda: {e!r}"[:200]
            time.sleep(0.6)
    return candidatos, fallos


def ejecutar(dir_datos: Path, buscar=buscar_por_isin, serie=yahoo_serie) -> dict:
    configurar_log()
    cartera = leer_json(dir_datos / "data" / "cartera.json", {}) or {}
    activos = cartera.get("activos", {})
    previo = leer_json(dir_datos / "data" / "precios.json", {}) or {}
    salida = {"generado": ahora_iso(), "series": {}, "tickers": {}, "fallos": {}}
    candidatos, salida["fallos"] = resolver_tickers(activos, previo.get("tickers") or {}, buscar)
    candidatos["__EURUSD"] = ["EURUSD=X"]
    for clave, lista in candidatos.items():
        errores = []
        for ticker in lista:
            try:
                s, info = serie(ticker, rango="10y")
                semanal = ind.muestrear_semanal(s, max_puntos=700)
                if semanal and semanal[-1][0] != s[-1][0]:
                    semanal.append(s[-1])
                salida["series"][clave] = {"ticker": ticker, "moneda": info.get("moneda"), "puntos": semanal,
                                           "ultimo": s[-1], "var_1d": ind.variacion(s, 1)}
                if not clave.startswith("__"):
                    origen = "manual" if activos.get(clave, {}).get("yahoo") else "automatico"
                    salida["tickers"][clave] = {"ticker": ticker, "moneda": info.get("moneda"), "origen": origen}
                break
            except Exception as e:  # noqa: BLE001
                errores.append(f"{ticker}: {e!r}"[:120])
            finally:
                time.sleep(0.6)
        if clave not in salida["series"]:
            salida["fallos"][clave] = " · ".join(errores)[:300]
            log.warning("Sin precio para %s: %s", clave, errores)
    escribir_json(dir_datos / "data" / "precios.json", salida)
    log.info("Precios: %d series, %d fallos", len(salida["series"]), len(salida["fallos"]))
    return salida


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True, help="Carpeta del repositorio privado de datos")
    ejecutar(Path(ap.parse_args().datos))
