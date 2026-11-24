"""Tests del pipeline sin red (todo lo externo se simula)."""
from __future__ import annotations

import math
from datetime import date, timedelta

import pytest

from pipeline import backtest, eventos as ev, indicadores as ind, noticias, senales
from pipeline.noticias import Titular
from pipeline.util import cargar_yaml

REGLAS = cargar_yaml("reglas_eventos.yaml")


def serie_desde(valores, inicio=date(2020, 1, 1)):
    return [((inicio + timedelta(days=i)).isoformat(), float(v)) for i, v in enumerate(valores)]


# ---------------------------------------------------------------- indicadores
def test_media_y_caida():
    s = serie_desde([100] * 250 + [90])
    assert ind.media_movil(s, 200) == pytest.approx((199 * 100 + 90) / 200)
    assert ind.caida_desde_maximo(s) == pytest.approx(-10.0)


def test_variacion_y_interanual():
    s = serie_desde(range(1, 400))
    assert ind.variacion(s, 30) == pytest.approx((399 / 369 - 1) * 100)
    mensual = [(f"2024-{m:02d}-01", 100.0) for m in range(1, 13)] + [("2025-01-01", 103.0)]
    assert ind.interanual(mensual) == pytest.approx(3.0)


def test_sesiones_bajo_media():
    s = serie_desde([100] * 250 + [90] * 10)
    assert ind.sesiones_bajo_media(s, 200) == 10


def test_muestreo_semanal_reduce():
    s = serie_desde(range(700))
    sem = ind.muestrear_semanal(s)
    assert 95 <= len(sem) <= 102
    assert sem[-1] == s[-1]


# ---------------------------------------------------------------- noticias
RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Missile strikes hit oil terminal &amp; Brent surges</title><link>https://a/1</link>
<pubDate>Mon, 23 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>Texto</p>]]></description></item>
<item><title>Central bank holds rates</title><link>https://a/2</link></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>El BCE sube los tipos</title><link href="https://b/1"/><updated>2026-11-23T09:00:00Z</updated>
<summary>Resumen</summary></entry></feed>"""


def test_parsear_rss_y_atom():
    r = noticias.parsear_feed(RSS)
    assert r[0]["titulo"].startswith("Missile strikes hit oil terminal & Brent")
    assert r[0]["fecha"].year == 2026 and r[0]["resumen"] == "Texto"
    a = noticias.parsear_feed(ATOM)
    assert a[0]["url"] == "https://b/1" and a[0]["fecha"].month == 11


def test_desduplicar_mantiene_mayor_peso():
    t1 = Titular("Oil prices surge after attack", "A", "a", "", None, "x", "en", 1)
    t2 = Titular("Oil prices surge after attack!", "B", "b", "", None, "x", "en", 3)
    assert noticias.desduplicar([t1, t2])[0].fuente == "B"


# ---------------------------------------------------------------- eventos
def _t(texto, peso=2):
    return Titular(texto, "Fuente", "f", "", None, "geopolitica", "en", peso)


def test_clasificador_palabras_y_tildes():
    c = ev.Clasificador(REGLAS)
    assert "conflicto_militar" in c.tipos_de("Ataque aéreo contra una base: escalada militar")
    assert "banco_central_endurece" in c.tipos_de("El BCE SUBE LOS TIPOS por sorpresa")
    assert "shock_petroleo" in c.tipos_de("Iran threatens to close the Strait of Hormuz")
    assert c.tipos_de("Football results of the weekend") == []


def test_fusion_ia_no_inventa_mas_de_un_nivel():
    c = ev.Clasificador(REGLAS)
    palabras = c.clasificar([_t("Missile attack on capital") for _ in range(3)])  # 6 puntos -> intensidad 1
    ia = {"eventos": [{"tipo": "conflicto_militar", "intensidad": 3, "explicacion": "x"},
                      {"tipo": "tipo_inexistente", "intensidad": 3}]}
    res = ev.fusionar(palabras, ia, {}, REGLAS)
    assert len(res) == 1 and res[0]["intensidad"] == 2  # 1 por palabras, la IA sube como mucho a 2


# ---------------------------------------------------------------- señales
def _series_escenario(caida_pct, vix, brent_3m=0.0, sahm=0.1, curva=1.0, hy=3.5, ipc=2.5, tendencia_baja=False):
    n = 400
    base = [100.0] * (n - 30)
    if tendencia_baja:
        base = [100 - i * 0.05 for i in range(n - 30)]
    final = base[-1] * (1 + caida_pct / 100)
    tramo = [base[-1] + (final - base[-1]) * (i + 1) / 30 for i in range(30)]
    rv = serie_desde(base + tramo)
    hoy = rv[-1][0]
    brent = serie_desde([80.0] * 300 + [80 * (1 + brent_3m / 100)] * 100)
    cpi = [(f"{2025 if m < 12 else 2026}-{(m % 12) + 1:02d}-01", 100.0) for m in range(12)] + [("2026-11-01", 100 + ipc)]
    return {
        "VWCE": rv, "VIX": [(hoy, vix)], "BRENT": brent, "SAHMREALTIME": [(hoy, sahm)],
        "T10Y3M": [(hoy, curva)], "BAMLH0A0HYM2": [(hoy, hy)], "CPIAUCSL": cpi,
    }


def test_maximos_sin_miedo_mantener_plan():
    r = senales.generar(_series_escenario(0, 14), [], REGLAS, ia_ok=True, noticias_ok=True)
    assert r["postura"] == "mantener_plan" and r["multiplicador_extra"] == 0
    assert r["regimen"]["principal"] == "expansion"


def test_correccion_geopolitica_en_expansion_compra_extra():
    eventos = [{"tipo": "conflicto_militar", "nombre": "Conflicto", "intensidad": 3, "titulares": 20}]
    r = senales.generar(_series_escenario(-14, 33), eventos, REGLAS, ia_ok=True, noticias_ok=True)
    assert r["puntuacion"] >= 45
    assert r["postura"] == "comprar_extra" and r["multiplicador_extra"] >= 6


def test_shock_petroleo_con_inflacion_precaucion():
    eventos = [{"tipo": "shock_petroleo", "nombre": "Petróleo", "intensidad": 2, "titulares": 12}]
    r = senales.generar(_series_escenario(-6, 24, brent_3m=45, ipc=4.5), eventos, REGLAS, ia_ok=True, noticias_ok=True)
    assert r["regimen"]["inflacion_alta"]
    assert r["postura"] == "precaucion"
    assert any("1973" in a for a in r["avisos"])


def test_recesion_obliga_a_escalonar():
    r = senales.generar(_series_escenario(-22, 38, sahm=0.6, curva=-0.5), [], REGLAS, ia_ok=True, noticias_ok=True)
    assert r["regimen"]["recesion_probable"]
    assert r["postura"] == "escalonar" and r["tramos"] == 3


def test_tendencia_bajista_escalona():
    r = senales.generar(_series_escenario(-12, 27, tendencia_baja=True), [], REGLAS, ia_ok=True, noticias_ok=True)
    assert r["tendencia_bajista"] and r["postura"] == "escalonar"


# ---------------------------------------------------------------- backtest
def test_backtest_misma_aportacion_y_reserva_se_invierte_en_caidas():
    # Mercado sube, cae un 30% con VIX alto y se recupera
    sube = [100 * (1.0004 ** i) for i in range(600)]
    pico = sube[-1]
    cae = [pico * (1 - 0.30 * (i + 1) / 60) for i in range(60)]
    recupera = [cae[-1] * (1.0012 ** (i + 1)) for i in range(400)]
    precios = serie_desde(sube + cae + recupera)
    vix = [(f, 45.0 if 600 <= i < 660 else 15.0) for i, (f, _) in enumerate(precios)]
    r = backtest.simular(precios, vix, aportacion=100, pct_reserva=0.3)
    assert r["num_disparos"] >= 1
    # Las compras tácticas ocurren durante la caída o la recuperación, nunca en el tramo alcista inicial
    assert all(d["fecha"] >= precios[600][0] for d in r["ultimos_disparos"])
    # Contabilidad: lo invertido + lo que queda en la hucha = lo aportado
    assert math.isclose(r["invertido_tactico"] + r["reserva_sin_invertir"], r["aportado"], abs_tol=0.05)
    assert math.isclose(r["aportado"], 100 * len({f[:7] for f, _ in precios[252:]}), rel_tol=1e-9)
