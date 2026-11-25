"""Tests de la predicción intradía con datos sintéticos (sin red)."""
import json
import math
import random
from datetime import date, datetime, timedelta, timezone

from pipeline import intradia as I


def test_barras_a_puntos_recorta_el_cierre_de_xetra():
    d = date(2026, 11, 24)
    barras = [(I.instante(d, "09:00"), 100.0, 101.0), (I.instante(d, "16:00"), 101.0, 102.0), (I.instante(d, "17:00"), 102.0, 103.0)]
    pts = dict(I.puntos_desde_barras(barras))
    assert pts[I.instante(d, "09:00")] == 100.0
    assert pts[I.instante(d, "10:00")] == 101.0
    assert pts[I.instante(d, "17:30")] == 103.0   # la última barra acaba a las 17:30, no a las 18:00
    assert I.instante(d, "18:00") not in pts


def test_valor_estimado_fuera_de_horario_con_beta():
    d = date(2026, 11, 24)
    reales = [(I.instante(d, "17:30"), 100.0)]
    x = [(I.instante(d, "17:30"), 0.0), (I.instante(d, "20:00"), math.log(1.02))]
    v, tipo = I.valor_en(I.instante(d, "21:00"), reales, x, beta=0.5)
    assert tipo == "estimado"
    assert abs(v - 100 * 1.02 ** 0.5) < 1e-9
    assert I.valor_en(I.instante(d, "17:30"), reales, x, 0.5) == (100.0, "real")


def test_garch_recupera_persistencia():
    random.seed(1)
    w, a, b = 1e-6, 0.08, 0.90
    s2, rend = w / (1 - a - b), []
    for _ in range(1500):
        r = random.gauss(0, math.sqrt(s2))
        rend.append(r)
        s2 = w + a * r * r + b * s2
    g = I.garch11(rend)
    assert 0.9 < g["alfa"] + g["beta"] < 0.995
    assert g["varianza_prevista"] > 0


def test_kalman_aprende_un_efecto_y_hedge_lo_premia():
    random.seed(2)
    k = I.kalman_nuevo()
    for _ in range(300):
        geo = random.uniform(-1, 1)
        phi = [1.0, geo, 0.0, 0.0, 0.0]
        y = -0.004 * geo + random.gauss(0, 0.002)
        I.kalman_actualizar(k, phi, y, 0.002 ** 2)
    assert -0.0055 < k["theta"][1] < -0.0025
    # Hedge: el que menos pierde se lleva el peso
    w = I.pesos_hedge({"ingenuo": 5.0, "modelo": 2.0})
    assert w["modelo"] > 0.9


def test_trayectoria_y_reanclaje():
    est = I.estado_nuevo()
    cuotas = [1 / len(I.REJILLA)] * len(I.REJILLA)
    plan = I.crear_plan(date(2026, 11, 24), 100.0, 1e-4, cuotas, [1, 0, 0, 0, 0], est)
    t = I.trayectoria(plan)
    assert len(t) == len(I.REJILLA) and t[0]["esperado"] == 100.0
    assert t[-1]["inf"] < 100 < t[-1]["sup"]
    # banda final ≈ ±1.28·σ_día·sqrt(17/18)
    s = math.sqrt(1e-4 * 17 / 18)
    assert abs(math.log(t[-1]["sup"] / 100) - I.Z80 * s) < 1e-6
    r = I.trayectoria(plan, 101.0, "12:00")
    assert r[0]["hora"] == "12:00" and r[0]["esperado"] == 101.0 and r[0]["inf"] == 101.0


def _simulador(dias=45, deriva_geo=0.0):
    """Genera barras horarias de un ETF (Xetra) y de un futuro 24 h correlacionados."""
    random.seed(3)
    etf, fut, eur = [], [], []
    p, f = 100.0, 5000.0
    inicio = date(2026, 9, 1)
    for n in range(dias):
        d = inicio + timedelta(days=n)
        if d.weekday() >= 5:
            continue
        for h in range(0, 24):
            t = datetime(d.year, d.month, d.day, h, tzinfo=timezone.utc)
            rf = random.gauss(0, 0.002)
            fo, f = f, f * math.exp(rf)
            fut.append((t, fo, f))
            eur.append((t, 1.1, 1.1))
            loc = t.astimezone(I.MADRID)
            if 9 <= loc.hour <= 17:
                po, p = p, p * math.exp(0.7 * rf + random.gauss(0, 0.001))
                etf.append((t, po, p))
    return {"VWCE.DE": etf, "ES=F": fut, "EURUSD=X": eur}


def test_ejecucion_completa_varios_dias(tmp_path, monkeypatch):
    datos = _simulador()
    monkeypatch.setattr(I, "cargar_yaml", lambda _n: {"etfs": [{"id": "VWCE", "isin": "IE00BK5BQT80", "yahoo": "VWCE.DE", "rol": "renta_variable_global"}]})

    def horario(ticker):
        if ticker not in datos:
            raise ValueError("sin datos")
        return [b for b in datos[ticker] if b[0] <= reloj["ahora"]]

    def diario(_t):
        base = date(2024, 9, 1)
        random.seed(4)
        v, s = 100.0, []
        for i in range(500):
            v *= math.exp(random.gauss(0, 0.01))
            s.append(((base + timedelta(days=i)).isoformat(), v))
        return s

    reloj = {"ahora": None}
    resultados = []
    for d in [date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14), date(2026, 10, 15)]:
        for hh in ["07:13", "12:13", "22:13"]:
            reloj["ahora"] = I.instante(d, hh)
            resultados.append(I.ejecutar(ahora=reloj["ahora"], horario=horario, diario=diario, destino=tmp_path))
    ult = resultados[-1]["activos"]["VWCE"]
    assert ult["modelo"]["beta_indicador"] > 0.4          # detecta la relación con el futuro
    assert ult["calidad"]["dias"] == 3                    # evaluó los 3 días anteriores
    assert any(p["tipo"] == "estimado" for p in ult["actual"])
    assert any(p["tipo"] == "real" for p in ult["actual"])
    estado = json.loads((tmp_path / "intradia_estado.json").read_text())
    assert estado["activos"]["VWCE"]["kalman"]["n"] == 3
    assert len(ult["plan"]) == len(I.REJILLA)


def test_plan_de_madrugada_es_provisional(tmp_path, monkeypatch):
    datos = _simulador()
    monkeypatch.setattr(I, "cargar_yaml", lambda _n: {"etfs": [{"id": "VWCE", "isin": "IE00BK5BQT80", "yahoo": "VWCE.DE", "rol": "renta_variable_global"}]})
    reloj = {}
    horario = lambda t: [b for b in datos[t] if b[0] <= reloj["ahora"]]
    diario = lambda _t: [((date(2024, 1, 1) + timedelta(days=i)).isoformat(), 100 + i % 7) for i in range(300)]
    d = date(2026, 10, 13)
    reloj["ahora"] = I.instante(d, "01:20")
    I.ejecutar(ahora=reloj["ahora"], horario=horario, diario=diario, destino=tmp_path)
    creado1 = json.loads((tmp_path / "intradia_estado.json").read_text())["activos"]["VWCE"]["plan"]["creado"]
    reloj["ahora"] = I.instante(d, "07:13")
    I.ejecutar(ahora=reloj["ahora"], horario=horario, diario=diario, destino=tmp_path)
    creado2 = json.loads((tmp_path / "intradia_estado.json").read_text())["activos"]["VWCE"]["plan"]["creado"]
    assert creado2 > creado1
    reloj["ahora"] = I.instante(d, "12:13")
    I.ejecutar(ahora=reloj["ahora"], horario=horario, diario=diario, destino=tmp_path)
    assert json.loads((tmp_path / "intradia_estado.json").read_text())["activos"]["VWCE"]["plan"]["creado"] == creado2
