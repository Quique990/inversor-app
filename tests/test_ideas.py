"""Ideas tácticas: señal por eventos, filtros de precio ("tarde", "vigilar") e historial de resultados."""
from __future__ import annotations

from datetime import date, timedelta

from pipeline import ideas as I

REGLAS = {"eventos": {
    "conflicto_militar": {"impacto": {"petroleo": 1, "oro": 1}, "impacto_tematico": {"defensa": 2}},
    "desescalada_acuerdo": {"impacto": {"petroleo": -1}, "impacto_tematico": {"defensa": -1}},
}}
CFG = {"limites": {"umbral_senal": 3, "tarde_1m_pct": 15},
       "ideas": [{"id": "DEF", "tema": "Defensa", "clase": "defensa"}, {"id": "OIL", "tema": "Petróleo", "clase": "petroleo"}]}


def _serie(pendiente_final: float, dias: int = 200, base: float = 100.0):
    hoy = date(2026, 11, 25)
    s, v = [], base
    for i in range(dias):
        v *= 1 + (pendiente_final if i >= dias - 30 else 0.0005)
        s.append(((hoy - timedelta(days=dias - 1 - i)).isoformat(), v))
    return s


def test_senal_suma_intensidad_por_impacto():
    ev = [{"tipo": "conflicto_militar", "intensidad": 3, "nombre": "Conflicto"}, {"tipo": "desescalada_acuerdo", "intensidad": 1}]
    s, motivos = I.senal(ev, REGLAS, "defensa")
    assert s == 3 * 2 - 1 and motivos[0]["aporte"] == 6
    assert I.senal(ev, REGLAS, "petroleo")[0] == 2


def test_estados_activa_tarde_vigilar_y_sin_senal():
    ev = [{"tipo": "conflicto_militar", "intensidad": 3}]
    series = {"DEF": _serie(0.002), "OIL": _serie(0.01)}               # OIL: +35 % en el último mes
    r = {x["id"]: x for x in I.evaluar(ev, series, {}, REGLAS, CFG)}
    assert r["DEF"]["estado"] == "activa"
    assert r["OIL"]["estado"] == "tarde"                               # señal 3·1 = 3, pero ya subió un 35 %
    flojo = [{"tipo": "conflicto_militar", "intensidad": 2}]
    assert {x["id"]: x for x in I.evaluar(flojo, series, {}, REGLAS, CFG)}["OIL"]["estado"] == "sin_senal"  # 2·1 < 3
    caida = {"DEF": _serie(-0.004), "OIL": _serie(-0.004)}             # el precio va en contra
    r3 = {x["id"]: x for x in I.evaluar(ev, caida, {}, REGLAS, CFG)}
    assert r3["DEF"]["estado"] == "vigilar"
    paz = [{"tipo": "desescalada_acuerdo", "intensidad": 3}]
    assert {x["id"]: x for x in I.evaluar(paz, series, {}, REGLAS, CFG)}["DEF"]["estado"] == "en_contra"
    assert I.evaluar(ev, {}, {}, REGLAS, CFG)[0]["estado"] == "sin_datos"


def test_historial_apunta_y_compara_con_la_bolsa():
    ideas = [{"id": "DEF", "tema": "Defensa", "estado": "activa", "senal": 6, "precio": {"ultimo": 50.0}}]
    h = I.actualizar_historial(None, ideas, {"VWCE": [("2026-11-25", 100.0)]}, "2026-11-25")
    assert h["tramos"][0]["desde"] == "2026-11-25" and h["resumen"]["abiertos"] == 1
    # Sigue activa otro día: no se duplica y el resultado se actualiza
    ideas[0]["precio"]["ultimo"] = 55.0
    h = I.actualizar_historial(h, ideas, {"VWCE": [("2026-11-26", 102.0)]}, "2026-11-26")
    assert len(h["tramos"]) == 1 and h["tramos"][0]["resultado_pct"] == 10.0 and h["tramos"][0]["referencia_pct"] == 2.0
    # Deja de estar activa: se cierra con su precio y se cuenta en el resumen
    ideas[0].update({"estado": "tarde", "precio": {"ultimo": 52.0}})
    h = I.actualizar_historial(h, ideas, {"VWCE": [("2026-12-10", 101.0)]}, "2026-12-10")
    t = h["tramos"][0]
    assert t["hasta"] == "2026-12-10" and t["resultado_pct"] == 4.0 and t["referencia_pct"] == 1.0
    assert h["resumen"] == {"cerrados": 1, "abiertos": 0, "ganan_a_referencia": 1, "ventaja_media_pct": 3.0}
