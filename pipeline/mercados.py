"""Datos de mercado gratuitos: Yahoo Finance (endpoint v8 chart), FRED (CSV), BCE (SDMX) y GPR.

Serie = lista de (fecha ISO 'YYYY-MM-DD', valor float) ordenada por fecha.
"""
from __future__ import annotations

import csv
import io
import time
from datetime import datetime, timezone

from .util import Salud, http_get, log

Serie = list[tuple[str, float]]

YAHOO_HOSTS = ("https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com")


def yahoo_serie(ticker: str, rango: str = "5y", intervalo: str = "1d") -> tuple[Serie, dict]:
    """Cierres ajustados (o de cierre) diarios desde el endpoint público v8/finance/chart."""
    ultimo_error: Exception | None = None
    for host in YAHOO_HOSTS:
        try:
            r = http_get(f"{host}/v8/finance/chart/{ticker}",
                         params={"range": rango, "interval": intervalo, "events": "div,splits"},
                         timeout=25, intentos=2)
            res = r.json()["chart"]["result"][0]
            ts = res.get("timestamp") or []
            ind = res["indicators"]
            cierres = ind["quote"][0].get("close") or []
            ajustados = (ind.get("adjclose") or [{}])[0].get("adjclose") or cierres
            serie: Serie = []
            for i, t in enumerate(ts):
                # Yahoo deja a veces sin "adjclose" la última sesión: entonces se usa su cierre (si no, el
                # precio actual se quedaría un día atrás)
                v = ajustados[i] if i < len(ajustados) else None
                if v is None and i < len(cierres):
                    v = cierres[i]
                if v is None:
                    continue
                f = datetime.fromtimestamp(t, tz=timezone.utc).date().isoformat()
                if serie and serie[-1][0] == f:
                    serie[-1] = (f, float(v))
                else:
                    serie.append((f, float(v)))
            meta = res.get("meta", {})
            info = {"moneda": meta.get("currency"), "bolsa": meta.get("exchangeName"),
                    "precio": meta.get("regularMarketPrice")}
            if not serie:
                raise ValueError(f"Serie vacía para {ticker}")
            return serie, info
        except Exception as e:  # noqa: BLE001
            ultimo_error = e
            time.sleep(1)
    assert ultimo_error is not None
    raise ultimo_error


def fred_serie(serie_id: str) -> Serie:
    """FRED permite descargar cualquier serie en CSV sin clave desde fredgraph.csv."""
    r = http_get("https://fred.stlouisfed.org/graph/fredgraph.csv", params={"id": serie_id}, timeout=30)
    filas = list(csv.reader(io.StringIO(r.text)))
    salida: Serie = []
    for fila in filas[1:]:
        if len(fila) < 2 or fila[1] in (".", ""):
            continue
        try:
            salida.append((fila[0], float(fila[1])))
        except ValueError:
            continue
    if not salida:
        raise ValueError(f"FRED {serie_id} sin datos")
    return salida


def bce_serie(clave: str, ultimas: int = 800) -> Serie:
    """Serie del portal de datos del BCE en CSV (API SDMX pública, sin clave)."""
    r = http_get(f"https://data-api.ecb.europa.eu/service/data/{clave}",
                 params={"format": "csvdata", "lastNObservations": ultimas, "detail": "dataonly"}, timeout=30)
    lector = csv.DictReader(io.StringIO(r.text))
    salida: Serie = []
    for fila in lector:
        try:
            salida.append((fila["TIME_PERIOD"], float(fila["OBS_VALUE"])))
        except (KeyError, ValueError):
            continue
    if not salida:
        raise ValueError(f"BCE {clave} sin datos")
    return sorted(salida)


def gpr_diario(url: str) -> Serie:
    """Índice de riesgo geopolítico diario (Caldara-Iacoviello). Requiere pandas + xlrd."""
    import pandas as pd  # import diferido: solo si se usa

    r = http_get(url, timeout=60)
    df = pd.read_excel(io.BytesIO(r.content))
    col_fecha = next(c for c in df.columns if str(c).lower() in ("date", "fecha", "day"))
    col_gpr = next(c for c in df.columns if str(c).upper() in ("GPRD", "GPRD_MA7", "GPR"))
    df = df[[col_fecha, col_gpr]].dropna()
    return [(pd.Timestamp(f).date().isoformat(), float(v)) for f, v in df.itertuples(index=False)]


def recoger_mercados(universo: dict, cfg_fuentes: dict, salud: Salud) -> dict:
    """Descarga todo. Devuelve {'series': {id: Serie}, 'info': {id: dict}}."""
    series: dict[str, Serie] = {}
    info: dict[str, dict] = {}

    for item in universo.get("etfs", []) + universo.get("satelites", []) + universo.get("indicadores", []):
        try:
            rango = "max" if item["id"] in ("SP500", "VIX") else ("10y" if item["id"] in ("VWCE", "EUNL") else "5y")
            try:
                s, i = yahoo_serie(item["yahoo"], rango=rango)
            except Exception:
                if item.get("rol") != "satelite" or not item.get("isin"):
                    raise
                # Satélites: si el ticker no existe en Yahoo, se busca por ISIN (son productos públicos, nada personal)
                from .tickers import buscar_por_isin
                for alternativo in buscar_por_isin(item["isin"])[:3]:
                    try:
                        s, i = yahoo_serie(alternativo, rango=rango)
                        salud.mal(f"yahoo:{item['yahoo']}", f"no existe; usado {alternativo} (corrígelo en universo_etf.yaml)")
                        item = {**item, "yahoo": alternativo}
                        break
                    except Exception:  # noqa: BLE001
                        continue
                else:
                    raise
            series[item["id"]] = s
            info[item["id"]] = {**i, "nombre": item.get("nombre"), "yahoo": item["yahoo"], "isin": item.get("isin"),
                                "rol": item.get("rol"), "ter": item.get("ter")}
            salud.bien(f"yahoo:{item['yahoo']}", f"{len(s)} puntos, último {s[-1][0]}")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"yahoo:{item['yahoo']}", repr(e))
        time.sleep(0.6)  # respeto al límite no documentado (<2 req/s)

    for item in universo.get("fred", []):
        try:
            series[item["id"]] = fred_serie(item["id"])
            salud.bien(f"fred:{item['id']}")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"fred:{item['id']}", repr(e))

    for item in universo.get("bce", []):
        try:
            series[item["id"]] = bce_serie(item["serie"])
            salud.bien(f"bce:{item['id']}")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"bce:{item['id']}", repr(e))

    gpr = (cfg_fuentes.get("gpr") or {}).get("diario")
    if gpr:
        try:
            series["GPR"] = gpr_diario(gpr)
            salud.bien("gpr:diario", f"último {series['GPR'][-1][0]}")
        except Exception as e:  # noqa: BLE001
            salud.mal("gpr:diario", repr(e))

    log.info("Series de mercado descargadas: %d", len(series))
    return {"series": series, "info": info}
