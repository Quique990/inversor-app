"""Ejecución completa del pipeline con la red simulada. También genera datos de demostración."""
from __future__ import annotations

import json
import math
from datetime import date, timedelta

import pipeline.main as main
from pipeline import mercados, noticias
from pipeline.noticias import Titular


def _serie(n=2600, base=100.0, tendencia=0.0003, amplitud=0.08, caida_final=0.0):
    hoy = date.today()
    s = []
    for i in range(n):
        f = (hoy - timedelta(days=n - 1 - i)).isoformat()
        v = base * math.exp(tendencia * i) * (1 + amplitud * math.sin(i / 90))
        if i > n - 25:
            v *= 1 + caida_final * (i - (n - 25)) / 25
        s.append((f, v))
    return s


def instalar_simulacion(monkeypatch):
    def falso_yahoo(ticker, rango="5y", intervalo="1d"):
        if ticker in ("^VIX", "^V2TX"):
            return [(f, 27.0) for f, _ in _serie()], {"moneda": "USD"}
        if ticker in ("BZ=F",):
            return _serie(base=80, tendencia=0.0001), {"moneda": "USD"}
        caida = -0.09 if ticker in ("VWCE.DE", "EUNL.DE", "^GSPC", "SXR8.DE") else 0.0
        return _serie(caida_final=caida), {"moneda": "EUR"}

    def falso_fred(sid):
        hoy = date.today().isoformat()
        valores = {"T10Y3M": 0.4, "SAHMREALTIME": 0.2, "UNRATE": 4.2, "BAMLH0A0HYM2": 3.4}
        if sid == "CPIAUCSL":
            return [((date.today() - timedelta(days=31 * (12 - m))).isoformat(), 300 + m * 0.25) for m in range(13)]
        return [(hoy, valores.get(sid, 1.0))]

    titulares = [
        Titular("Missile strikes escalate conflict in the Gulf; oil supply fears grow", "BBC World", "bbc_world", "https://x/1", None, "geopolitica", "en", 3),
        Titular("Iran threatens to close Strait of Hormuz as tensions rise", "Al Jazeera", "aljazeera", "https://x/2", None, "geopolitica", "en", 2),
        Titular("Las bolsas europeas caen por la escalada militar en Oriente Próximo", "Expansión", "expansion", "https://x/3", None, "mercados", "es", 2),
        Titular("ECB keeps rates unchanged, signals vigilance on inflation", "BCE", "bce", "https://x/4", None, "banco_central", "en", 3),
        Titular("New tariffs on European cars announced by Washington", "CNBC", "cnbc_markets", "https://x/5", None, "mercados", "en", 2),
    ] * 4  # repetidos con distinto origen

    monkeypatch.setattr(mercados, "yahoo_serie", falso_yahoo)
    monkeypatch.setattr(mercados, "fred_serie", falso_fred)
    monkeypatch.setattr(mercados, "bce_serie", lambda clave, ultimas=800: [(date.today().isoformat(), 2.0 if "DFR" in clave else (1.08 if "EXR" in clave else 2.4))])
    monkeypatch.setattr(mercados, "gpr_diario", lambda url: [((date.today() - timedelta(days=i)).isoformat(), 180.0 - i * 0.1) for i in range(400)][::-1])
    monkeypatch.setattr(noticias, "recoger_titulares", lambda cfg, salud: list({t.titulo + str(i): t for i, t in enumerate(titulares)}.values()))
    monkeypatch.setattr(noticias, "leer_gdelt", lambda c, s: {"conflicto": {"ratio": 2.3, "tono_hoy": -6.1}, "energia": {"ratio": 1.5}})
    monkeypatch.setattr(main.mercados.time, "sleep", lambda s: None)
    monkeypatch.setenv("SIN_IA", "1")


def test_pipeline_completo_offline(monkeypatch, tmp_path):
    instalar_simulacion(monkeypatch)
    monkeypatch.setattr(main, "WEB_DATA", tmp_path)
    informe = main.ejecutar()
    assert informe["decision"]["postura"] in {"mantener_plan", "comprar_extra_escalonado", "escalonar", "comprar_extra", "precaucion"}
    tipos = {e["tipo"] for e in informe["eventos"]}
    assert "conflicto_militar" in tipos and "shock_petroleo" in tipos
    for nombre in ("mercado.json", "precios_universo.json", "salud_fuentes.json", "backtest.json", "historial/indice.json"):
        assert (tmp_path / nombre).exists(), nombre
    datos = json.loads((tmp_path / "mercado.json").read_text())
    assert datos["ia"] == "desactivada" and datos["resumen"]
    assert "VWCE" in datos["activos"]
