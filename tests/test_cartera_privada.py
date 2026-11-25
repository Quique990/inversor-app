"""Piezas que solo corren en el repositorio privado: ticker por ISIN, clasificación y previsión de activos propios.
Todos los datos son sintéticos (ISIN inventados): nada personal en el repositorio público."""
from __future__ import annotations

import json
from datetime import date, timedelta

from pipeline import intradia as I
from pipeline import intradia_cartera as IC
from pipeline import mercados, precios_cartera
from pipeline.clasificar import hueco_por_nombre, rol_de_activo
from pipeline.tickers import ordenar_candidatos
from tests.test_intradia import _simulador


def test_clasificacion_por_nombre():
    assert hueco_por_nombre("WisdomTree Core Physical Gold") == "oro"
    assert hueco_por_nombre("Xetra-Gold") == "oro"
    assert hueco_por_nombre("Dez. 2030") == "renta_fija_euro"
    assert hueco_por_nombre("iShares iBonds Dec 2029 Term EUR Corp UCITS ETF") == "renta_fija_euro"
    assert hueco_por_nombre("Core Euro Government Bond") == "renta_fija_euro"
    assert hueco_por_nombre("EUR Overnight Rate Swap") == "monetario"
    assert hueco_por_nombre("Amundi Euro Stoxx 50 (Acc)") == "renta_variable_global"
    assert hueco_por_nombre("Xtrackers MSCI World (Acc)") == "renta_variable_global"
    assert hueco_por_nombre("Una empresa cualquiera") == "otros"
    assert hueco_por_nombre("Leverage Shares 3x Gold") == "otros"   # apalancado manda
    assert rol_de_activo({"nombre": "Una empresa"}) == "accion"
    assert rol_de_activo({"nombre": "Dez. 2030", "hueco": "oro"}) == "oro"  # lo elegido a mano manda


def test_ordenar_candidatos_prefiere_xetra_y_euros():
    quotes = [{"symbol": "XYZ.L", "quoteType": "ETF"}, {"symbol": "XYZ", "quoteType": "ETF"}, {"symbol": "XYZ.PA", "quoteType": "ETF"},
              {"symbol": "XYZ.DE", "quoteType": "ETF"}, {"symbol": "XYZ.F", "quoteType": "ETF"}, {"symbol": "OPC", "quoteType": "OPTION"}]
    assert ordenar_candidatos(quotes) == ["XYZ.DE", "XYZ.PA", "XYZ", "XYZ.L", "XYZ.F"]
    assert ordenar_candidatos([{"symbol": "IE0000000000.SG"}, {"symbol": "ABC.L"}]) == ["ABC.L"]  # el ISIN no es un ticker


def test_precios_descarta_peniques_si_hay_euros(tmp_path, monkeypatch):
    monkeypatch.setattr(precios_cartera.time, "sleep", lambda s: None)
    datos = tmp_path / "datos"
    (datos / "data").mkdir(parents=True)
    (datos / "data" / "cartera.json").write_text(json.dumps({"activos": {"XS0000000001": {"nombre": "Oro"}}, "operaciones": []}))
    (datos / "data" / "precios.json").write_text(json.dumps({"tickers": {"XS0000000001": {"ticker": "ORO.L", "moneda": "GBp", "origen": "automatico"}}}))

    def serie(ticker, rango="10y"):
        return [("2026-01-01", 10.0), ("2026-01-02", 11.0)], {"moneda": {"ORO.L": "GBp", "EURUSD=X": "USD"}.get(ticker, "EUR")}

    r = precios_cartera.ejecutar(datos, buscar=lambda i: ["ORO.L", "ORO.DE"], serie=serie)
    assert r["tickers"]["XS0000000001"]["ticker"] == "ORO.DE"   # se vuelve a buscar y gana el de euros


def test_precios_resuelve_ticker_por_isin_y_lo_recuerda(tmp_path, monkeypatch):
    monkeypatch.setattr(precios_cartera.time, "sleep", lambda s: None)
    datos = tmp_path / "datos"
    (datos / "data").mkdir(parents=True)
    cartera = {"activos": {"XS0000000001": {"nombre": "Oro de prueba"}, "XS0000000002": {"nombre": "Con ticker", "yahoo": "MIO.DE"}},
               "operaciones": []}
    (datos / "data" / "cartera.json").write_text(json.dumps(cartera))
    busquedas = []

    def buscar(isin):
        busquedas.append(isin)
        return ["MALO.DE", "BUENO.PA"]

    def serie(ticker, rango="10y"):
        if ticker == "MALO.DE":
            raise ValueError("sin datos")
        return [((date(2026, 1, 1) + timedelta(days=i)).isoformat(), 10.0 + i) for i in range(30)], {"moneda": "USD" if ticker == "EURUSD=X" else "EUR"}

    r = precios_cartera.ejecutar(datos, buscar=buscar, serie=serie)
    assert r["tickers"]["XS0000000001"] == {"ticker": "BUENO.PA", "moneda": "EUR", "origen": "automatico"}
    assert r["tickers"]["XS0000000002"]["origen"] == "manual"
    assert busquedas == ["XS0000000001"]               # el que tiene ticker manual no se busca
    assert len(r["series"]["XS0000000001"]["diario"]) == 30   # precios diarios recientes para la gráfica
    precios_cartera.ejecutar(datos, buscar=buscar, serie=serie)
    assert busquedas == ["XS0000000001"]               # la segunda vez se recuerda: no se vuelve a buscar


def test_yahoo_usa_el_cierre_si_falta_el_ajustado(monkeypatch):
    class R:
        def json(self):
            return {"chart": {"result": [{"timestamp": [1764000000, 1764086400, 1764172800], "meta": {"currency": "EUR"},
                                          "indicators": {"quote": [{"close": [10.0, 11.0, 12.0]}], "adjclose": [{"adjclose": [10.0, 11.0, None]}]}}]}}
    monkeypatch.setattr(mercados, "http_get", lambda *a, **k: R())
    serie, _ = mercados.yahoo_serie("X.DE")
    assert len(serie) == 3 and serie[-1][1] == 12.0


def test_activos_a_prever_solo_propios_fuera_del_universo():
    cartera = {"activos": {"XS0000000001": {"nombre": "Oro A"}, "XS0000000002": {"nombre": "Vendido"}, "IE00BK5BQT80": {"nombre": "Público"},
                           "XS0000000003": {"nombre": "Sin ticker"}},
               "operaciones": [{"isin": i, "tipo": "compra", "participaciones": 1} for i in ["XS0000000001", "XS0000000002", "IE00BK5BQT80", "XS0000000003"]]
               + [{"isin": "XS0000000002", "tipo": "venta", "participaciones": 1}]}
    precios = {"tickers": {"XS0000000001": {"ticker": "ORO.DE", "moneda": "USD"}}}
    etfs, sin = IC.activos_a_prever(cartera, precios, {"IE00BK5BQT80"})
    assert [e["id"] for e in etfs] == ["XS0000000001"] and etfs[0]["rol"] == "oro" and etfs[0]["moneda"] == "USD"
    assert sin == ["XS0000000003"]


def test_intradia_de_un_activo_en_dolares(tmp_path):
    datos = _simulador()
    barras = {"MIO": datos["VWCE.DE"], "ES=F": datos["ES=F"], "EURUSD=X": [(t, 1.25, 1.25) for t, _, _ in datos["EURUSD=X"]]}
    reloj = {"ahora": None}

    def horario(ticker):
        return [b for b in barras[ticker] if b[0] <= reloj["ahora"]]

    def diario(_t):
        return [((date(2025, 1, 1) + timedelta(days=i)).isoformat(), 100 * (1.001 ** i)) for i in range(300)]

    etfs = [{"id": "XS0000000001", "isin": "XS0000000001", "nombre": "Acción", "yahoo": "MIO", "rol": "accion", "moneda": "USD"}]
    d = date(2026, 10, 13)
    reloj["ahora"] = I.instante(d, "12:13")
    r = I.ejecutar(ahora=reloj["ahora"], horario=horario, diario=diario, destino=tmp_path, etfs=etfs, ruta_mercado=tmp_path / "no.json")
    a = r["activos"]["XS0000000001"]
    usd = dict(I.puntos_desde_barras(horario("MIO"), None))
    real = next(p for p in a["actual"] if p["tipo"] == "real" and p["hora"] == "12:00")
    assert abs(real["valor"] - usd[I.instante(d, "12:00")] / 1.25) < 1e-3  # pasado a euros
    assert a["modelo"]["indicador"] == "ES=F"
    assert I.cierre_por_defecto("ABC.DE") == "17:30" and I.cierre_por_defecto("ABC") is None
    t0 = I.instante(d, "12:00")
    assert I.a_euros([(t0, 25000.0)], [(t0, 0.8)], 100.0) == [(t0, 312.5)]  # peniques -> euros
