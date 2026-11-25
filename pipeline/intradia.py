"""Predicción intradía hora a hora (7:30–23:00, horario de Trade Republic) para los ETF del universo.

Qué predice y qué no
--------------------
La dirección del precio de un ETF dentro de un día es casi impredecible (paseo aleatorio; Fama 1970). Lo que sí
se predice bien es CUÁNTO se va a mover y CUÁNDO (volatilidad y su patrón intradía). Por eso la salida es una
línea esperada + una banda del 80 %, y el sistema mide cada día si su línea mejora a "el precio no cambia".

Piezas (todas gratuitas y deterministas)
----------------------------------------
1. Precios horarios: Yahoo Finance, barras de 60 min. En Xetra (9:00–17:30) son reales. Fuera de ese horario
   Trade Republic sigue cotizando (Lang & Schwarz); ese valor se ESTIMA con un indicador que cotiza casi 24 h
   (futuros del S&P 500, oro) y el tipo de cambio, con una beta estimada por mínimos cuadrados. Se marca como
   "estimado".
2. Volatilidad diaria: GARCH(1,1) (Bollerslev 1986) con variance targeting (Engle y Mezrich 1996).
3. Reparto de la volatilidad a lo largo del día: estacionalidad intradía (Andersen y Bollerslev 1997):
   proporción media de la varianza diaria que cae en cada franja horaria.
4. Rentabilidad esperada del día: regresión con coeficientes variables estimada con un filtro de Kalman
   (Kalman 1960; equivale a mínimos cuadrados recursivos con olvido). Variables: tono geopolítico del análisis
   diario (eventos × impacto típico en la clase de activo; Tetlock 2007, López-Lira y Tang 2023), cambio del VIX,
   movimiento nocturno del indicador y rentabilidad de ayer (reversión a corto plazo).
5. Combinación con el modelo ingenuo ("no cambia") mediante pesos exponenciales (Hedge; Freund y Schapire 1997,
   Vovk 1990): cada noche se compara lo previsto con lo real y gana peso el que menos falla.
6. Calibración de la banda: si el precio real cae fuera de la banda más del 20 % de las veces, la banda se
   ensancha; si cae dentro siempre, se estrecha.

El estado aprendido (coeficientes, pesos, calibración, errores) se guarda en web/data/intradia_estado.json.
No contiene nada personal: solo trabaja con los ETF públicos del universo.
"""
from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, time as dtime, timedelta, timezone
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

from .util import WEB_DATA, Salud, ahora_iso, cargar_yaml, configurar_log, http_get, log

MADRID = ZoneInfo("Europe/Madrid")
# Rejilla horaria de Trade Republic (hora de Madrid). 07:30 es el "ancla" de cada día.
REJILLA = ["07:30", "08:00"] + [f"{h:02d}:00" for h in range(9, 18)] + ["17:30"] + [f"{h:02d}:00" for h in range(18, 24)]
Z80 = 1.2816  # cuantil normal para una banda central del 80 %
COBERTURA_OBJETIVO = 0.80
VARIABLES = ["constante", "geopolitica", "vix", "nocturno", "ayer"]
# Varianzas a priori de cada coeficiente (escala de su efecto típico en la rentabilidad del día)
P0 = [4e-6, 2.5e-5, 9e-4, 0.25, 0.04]
Q_FRACCION = 0.01   # ruido de proceso: los coeficientes pueden cambiar despacio (adaptación)
OLVIDO_HEDGE = 0.95
ETA_HEDGE = 1.0
PROXY_POR_ROL = {"renta_variable_global": "ES=F", "renta_variable_desarrollados": "ES=F", "renta_variable_eeuu": "ES=F",
                 "renta_variable_emergentes": "ES=F", "oro": "GC=F"}
CLASE_POR_ROL = {"oro": "oro", "renta_fija_euro": "renta_fija_calidad", "renta_fija_global": "renta_fija_calidad", "monetario": None}

Puntos = list[tuple[datetime, float]]  # (instante UTC, valor), ordenado


# ====================================================================== tiempo
def instante(fecha: date, hhmm: str) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return datetime.combine(fecha, dtime(h, m), tzinfo=MADRID).astimezone(timezone.utc)


def es_dia_habil(fecha: date) -> bool:
    return fecha.weekday() < 5


# ====================================================================== datos
def yahoo_horario(ticker: str, rango: str = "60d") -> list[tuple[datetime, float | None, float | None]]:
    """Barras de 60 minutos: (inicio UTC, apertura, cierre)."""
    ultimo: Exception | None = None
    for host in ("https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"):
        try:
            r = http_get(f"{host}/v8/finance/chart/{ticker}", params={"range": rango, "interval": "60m"}, timeout=25, intentos=2)
            res = r.json()["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            barras = [(datetime.fromtimestamp(t, tz=timezone.utc), o, c) for t, o, c in zip(res.get("timestamp") or [], q.get("open") or [], q.get("close") or [])]
            if not barras:
                raise ValueError(f"Sin barras horarias para {ticker}")
            return barras
        except Exception as e:  # noqa: BLE001
            ultimo = e
    assert ultimo is not None
    raise ultimo


def puntos_desde_barras(barras, cierre: str | None = "17:30") -> Puntos:
    """Convierte barras en puntos de precio: apertura al inicio de la barra y cierre al final.
    El final de la última barra de la sesión se recorta a la hora de cierre (Xetra cierra a las 17:30)."""
    pts: dict[datetime, float] = {}
    for inicio, apertura, cierre_b in barras:
        loc = inicio.astimezone(MADRID)
        fin = inicio + timedelta(hours=1)
        if cierre:
            limite = instante(loc.date(), cierre)
            if inicio < limite < fin:
                fin = limite
        if apertura is not None and inicio not in pts:
            pts[inicio] = float(apertura)
        if cierre_b is not None:
            pts[fin] = float(cierre_b)
    return sorted(pts.items())


def ultimo_hasta(puntos: Puntos, t: datetime) -> tuple[datetime, float] | None:
    """Último punto con instante <= t (búsqueda binaria)."""
    lo, hi = 0, len(puntos)
    while lo < hi:
        mid = (lo + hi) // 2
        if puntos[mid][0] <= t:
            lo = mid + 1
        else:
            hi = mid
    return puntos[lo - 1] if lo else None


def serie_log_eur(proxy: Puntos, eurusd: Puntos | None) -> Puntos:
    """log del precio del indicador en euros (los futuros cotizan en USD; EURUSD=X son USD por EUR)."""
    salida: Puntos = []
    for t, v in proxy:
        if v <= 0:
            continue
        x = math.log(v)
        if eurusd:
            fx = ultimo_hasta(eurusd, t)
            if fx is None or fx[1] <= 0:
                continue
            x -= math.log(fx[1])
        salida.append((t, x))
    return salida


def estimar_beta(reales: Puntos, x: Puntos, defecto: float, minimo: int = 30) -> tuple[float, int]:
    """Beta del ETF frente al indicador con rendimientos horarios dentro de la misma sesión (MCO por el origen)."""
    num = den = 0.0
    n = 0
    for (t1, p1), (t2, p2) in zip(reales, reales[1:]):
        if t2 - t1 > timedelta(hours=1, minutes=5) or p1 <= 0 or p2 <= 0:
            continue
        a, b = ultimo_hasta(x, t1), ultimo_hasta(x, t2)
        if not a or not b or a[0] == b[0]:
            continue
        rx = b[1] - a[1]
        num += math.log(p2 / p1) * rx
        den += rx * rx
        n += 1
    if n < minimo or den <= 0:
        return defecto, n
    return max(0.0, min(1.5, num / den)), n


def valor_en(t: datetime, reales: Puntos, x: Puntos | None, beta: float) -> tuple[float, str] | None:
    """Valor del ETF en el instante t: real si hay cotización en ese momento; si no, el último real
    trasladado con el movimiento del indicador (beta · Δlog) desde entonces."""
    ult = ultimo_hasta(reales, t)
    if ult is None:
        return None
    t_r, p_r = ult
    if abs((t - t_r).total_seconds()) < 90:
        return p_r, "real"
    if x and beta > 0:
        a, b = ultimo_hasta(x, t_r), ultimo_hasta(x, t)
        if a and b:
            return p_r * math.exp(beta * (b[1] - a[1])), "estimado"
    return p_r, "estimado"


def rejilla_dia(fecha: date, reales: Puntos, x: Puntos | None, beta: float, hasta: datetime | None = None) -> list[dict]:
    salida = []
    for hhmm in REJILLA:
        t = instante(fecha, hhmm)
        if hasta and t > hasta:
            break
        v = valor_en(t, reales, x, beta)
        if v:
            salida.append({"hora": hhmm, "valor": round(v[0], 4), "tipo": v[1]})
    return salida


# ====================================================================== volatilidad
def garch11(rend: list[float]) -> dict:
    """Ajuste GARCH(1,1) con variance targeting por rejilla de máxima verosimilitud gaussiana.
    Devuelve los parámetros y la varianza prevista para la siguiente sesión."""
    n = len(rend)
    media_r2 = sum(r * r for r in rend) / n if n else 1e-4
    mejor = None
    for ia in range(1, 16):
        a = 0.01 * ia * 1.4
        for ib in range(0, 30):
            b = 0.70 + 0.01 * ib
            if a + b >= 0.995:
                continue
            w = media_r2 * (1 - a - b)
            s2 = media_r2
            ll = 0.0
            for r in rend:
                ll += -0.5 * (math.log(s2) + r * r / s2)
                s2 = w + a * r * r + b * s2
            if mejor is None or ll > mejor[0]:
                mejor = (ll, a, b, w, s2)
    if mejor is None:
        return {"alfa": None, "beta": None, "varianza_prevista": media_r2, "varianza_larga": media_r2}
    _, a, b, w, s2 = mejor
    return {"alfa": round(a, 3), "beta": round(b, 3), "varianza_prevista": s2, "varianza_larga": media_r2}


def rendimientos_diarios(serie: list[tuple[str, float]]) -> list[float]:
    return [math.log(b / a) for (_, a), (_, b) in zip(serie, serie[1:]) if a > 0 and b > 0]


def estacionalidad(dias: list[list[dict]], previos: list[float | None]) -> list[float]:
    """Proporción media de la varianza diaria en cada franja: [nocturno (23:00→7:30), 7:30→8:00, …, 22:00→23:00].
    `dias` = rejillas completas de días pasados; `previos` = valor a las 23:00 del día anterior a cada uno."""
    k = len(REJILLA)
    suma = [0.0] * k
    cuenta = [0] * k
    for rej, previo in zip(dias, previos):
        if len(rej) != k:
            continue
        vals = [previo] + [p["valor"] for p in rej]
        for i in range(k):
            a, b = vals[i], vals[i + 1]
            if a and b and a > 0 and b > 0:
                suma[i] += math.log(b / a) ** 2
                cuenta[i] += 1
    medias = [s / c if c else None for s, c in zip(suma, cuenta)]
    if not any(medias):
        # Sin historia: patrón por defecto (más movimiento en apertura y cierre de Xetra y en la apertura de EE. UU.)
        medias = [0.20] + [0.02, 0.03, 0.10, 0.06, 0.05, 0.04, 0.04, 0.04, 0.07, 0.08, 0.07, 0.03, 0.03, 0.03, 0.03, 0.03, 0.02]
    medias = [m if m else 1e-9 for m in medias]
    total = sum(medias)
    return [m / total for m in medias]


# ====================================================================== filtro de Kalman (coeficientes variables)
def kalman_nuevo() -> dict:
    return {"theta": [0.0] * len(VARIABLES), "P": [[P0[i] if i == j else 0.0 for j in range(len(P0))] for i in range(len(P0))], "n": 0}


def kalman_prever(k: dict, phi: list[float]) -> float:
    return sum(t * f for t, f in zip(k["theta"], phi))


def kalman_actualizar(k: dict, phi: list[float], y: float, r: float) -> None:
    """Paso de predicción (θ sigue un paseo aleatorio: P += Q) y de corrección con la observación y."""
    n = len(phi)
    P = [[k["P"][i][j] + (Q_FRACCION * P0[i] if i == j else 0.0) for j in range(n)] for i in range(n)]
    Pphi = [sum(P[i][j] * phi[j] for j in range(n)) for i in range(n)]
    s = sum(phi[i] * Pphi[i] for i in range(n)) + max(r, 1e-10)
    g = [v / s for v in Pphi]
    e = y - kalman_prever(k, phi)
    k["theta"] = [t + gi * e for t, gi in zip(k["theta"], g)]
    k["P"] = [[P[i][j] - g[i] * Pphi[j] for j in range(n)] for i in range(n)]
    k["n"] = k.get("n", 0) + 1


# ====================================================================== variables explicativas
def variable_geopolitica(mercado: dict | None, rol: str, fecha: date) -> float:
    """Σ intensidad × impacto típico del evento en la clase del ETF, /10. Solo si el análisis es reciente."""
    if not mercado:
        return 0.0
    try:
        f = date.fromisoformat(mercado.get("fecha", ""))
    except ValueError:
        return 0.0
    if (fecha - f).days > 3:
        return 0.0
    clase = CLASE_POR_ROL.get(rol, "renta_variable")
    if clase is None:
        return 0.0
    total = 0.0
    for ev in mercado.get("eventos") or []:
        total += float(ev.get("intensidad") or 0) * float((ev.get("impacto_tipico") or {}).get(clase) or 0)
    return max(-3.0, min(3.0, total / 10))


def variable_vix(mercado: dict | None) -> float:
    v = ((mercado or {}).get("activos") or {}).get("VIX", {}).get("var_1d")
    return max(-1.0, min(1.0, float(v) / 100)) if v is not None else 0.0


# ====================================================================== combinación (Hedge) y calibración
def pesos_hedge(perdidas: dict[str, float]) -> dict[str, float]:
    m = min(perdidas.values())
    e = {k: math.exp(-ETA_HEDGE * (v - m)) for k, v in perdidas.items()}
    s = sum(e.values())
    return {k: v / s for k, v in e.items()}


def estado_nuevo() -> dict:
    return {"kalman": kalman_nuevo(), "perdidas": {"ingenuo": 0.0, "modelo": 0.0}, "escala_banda": 1.0, "historial": [], "plan": None}


def crear_plan(fecha: date, ancla: float, sigma2_dia: float, cuotas: list[float], phi: list[float], est: dict) -> dict:
    """Trayectoria prevista desde las 07:30: deriva repartida según la llegada de información (cuotas de varianza)
    y banda del 80 % con la varianza acumulada desde el ancla."""
    cuotas_dia = cuotas[1:]  # sin la franja nocturna: el ancla ya la incorpora
    total = sum(cuotas_dia) or 1.0
    y_modelo = kalman_prever(est["kalman"], phi)
    w = pesos_hedge(est["perdidas"])
    y = w["modelo"] * y_modelo
    acum_f = acum_v = 0.0
    tramos = [{"hora": REJILLA[0], "f": 0.0, "sigma": 0.0}]
    for hhmm, c in zip(REJILLA[1:], cuotas_dia):
        acum_f += c / total
        acum_v += sigma2_dia * c
        tramos.append({"hora": hhmm, "f": round(acum_f, 6), "sigma": math.sqrt(acum_v)})
    return {"fecha": fecha.isoformat(), "ancla": ancla, "phi": phi, "y_modelo": y_modelo, "y": y, "pesos": w,
            "escala": est["escala_banda"], "sigma2_dia": sigma2_dia, "tramos": tramos}


def trayectoria(plan: dict, desde_valor: float | None = None, desde_hora: str | None = None) -> list[dict]:
    """Línea esperada y banda. Si se da desde_valor/desde_hora, se reancla en el último dato observado
    (lo mejor que se sabe de un paseo aleatorio es el último precio) y se proyecta el resto del día."""
    z = Z80 * plan["escala"]
    tramos = plan["tramos"]
    base_v, base_f, base_s2 = plan["ancla"], 0.0, 0.0
    inicio = 0
    if desde_valor is not None and desde_hora:
        idx = next((i for i, t in enumerate(tramos) if t["hora"] == desde_hora), None)
        if idx is not None:
            base_v, base_f, base_s2, inicio = desde_valor, tramos[idx]["f"], tramos[idx]["sigma"] ** 2, idx
    salida = []
    for t in tramos[inicio:]:
        mu = plan["y"] * (t["f"] - base_f)
        s = math.sqrt(max(0.0, t["sigma"] ** 2 - base_s2))
        salida.append({"hora": t["hora"], "esperado": round(base_v * math.exp(mu), 4),
                       "inf": round(base_v * math.exp(mu - z * s), 4), "sup": round(base_v * math.exp(mu + z * s), 4)})
    return salida


def evaluar_plan(est: dict, plan: dict, reales_dia: dict[str, float]) -> dict | None:
    """Compara el plan con los precios reales de ese día y actualiza el aprendizaje. Devuelve la puntuación."""
    A = plan["ancla"]
    z = Z80 * plan["escala"]
    err_m = err_n = dentro = 0.0
    perd = {"ingenuo": 0.0, "modelo": 0.0}
    n = 0
    for t in plan["tramos"][1:]:
        p = reales_dia.get(t["hora"])
        if p is None or p <= 0 or t["sigma"] <= 0:
            continue
        r = math.log(p / A)
        prev = plan["y"] * t["f"]
        err_m += (r - prev) ** 2
        err_n += r ** 2
        dentro += 1 if abs(r - prev) <= z * t["sigma"] else 0
        perd["ingenuo"] += r ** 2 / t["sigma"] ** 2
        perd["modelo"] += (r - plan["y_modelo"] * t["f"]) ** 2 / t["sigma"] ** 2
        n += 1
    if n == 0:
        return None  # festivo o sin datos: no se aprende nada
    for k in perd:
        est["perdidas"][k] = OLVIDO_HEDGE * est["perdidas"][k] + perd[k] / n
    # Kalman: objetivo = rentabilidad desde el ancla hasta el último precio real del día
    ultima = next((reales_dia[t["hora"]] for t in reversed(plan["tramos"]) if t["hora"] in reales_dia), None)
    if ultima:
        kalman_actualizar(est["kalman"], plan["phi"], math.log(ultima / A), plan["sigma2_dia"])
    cobertura = dentro / n
    est["escala_banda"] = max(0.5, min(3.0, est["escala_banda"] * math.exp(0.3 * (COBERTURA_OBJETIVO - cobertura))))
    punt = {"fecha": plan["fecha"], "n": n, "mse_modelo": err_m / n, "mse_ingenuo": err_n / n, "cobertura": round(cobertura, 3)}
    est["historial"] = (est["historial"] + [punt])[-60:]
    return punt


def calidad(historial: list[dict], dias: int = 20) -> dict:
    h = historial[-dias:]
    if not h:
        return {"dias": 0}
    mm = sum(x["mse_modelo"] for x in h) / len(h)
    mn = sum(x["mse_ingenuo"] for x in h) / len(h)
    return {"dias": len(h), "error_modelo_pct": round(math.sqrt(mm) * 100, 3), "error_ingenuo_pct": round(math.sqrt(mn) * 100, 3),
            "mejora_pct": round((1 - mm / mn) * 100, 1) if mn > 0 else None,
            "cobertura_pct": round(sum(x["cobertura"] for x in h) / len(h) * 100, 1)}


def correlaciones(rend: dict[str, list[tuple[str, float]]]) -> dict:
    """Matriz de correlación de rendimientos diarios (fechas comunes), para la banda de la cartera."""
    ids = sorted(rend)
    mapas = {i: dict(rend[i]) for i in ids}
    m = []
    for a in ids:
        fila = []
        for b in ids:
            fechas = sorted(set(mapas[a]) & set(mapas[b]))[-250:]
            xs, ys = [mapas[a][f] for f in fechas], [mapas[b][f] for f in fechas]
            fila.append(round(_corr(xs, ys), 3) if len(fechas) > 20 else (1.0 if a == b else 0.5))
        m.append(fila)
    return {"ids": ids, "matriz": m}


def _corr(x: list[float], y: list[float]) -> float:
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    sx = math.sqrt(sum((a - mx) ** 2 for a in x))
    sy = math.sqrt(sum((b - my) ** 2 for b in y))
    return sxy / (sx * sy) if sx > 0 and sy > 0 else 0.0


# ====================================================================== ejecución
def _leer(ruta: Path, defecto):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return defecto


def ejecutar(ahora: datetime | None = None, horario: Callable = yahoo_horario, diario: Callable | None = None,
             destino: Path = WEB_DATA) -> dict:
    from .mercados import yahoo_serie
    diario = diario or (lambda t: yahoo_serie(t, rango="2y", intervalo="1d")[0])
    ahora = (ahora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    hoy = ahora.astimezone(MADRID).date()
    salud = Salud()
    estado = _leer(destino / "intradia_estado.json", {"activos": {}, "comun": {}})
    mercado = _leer(destino / "mercado.json", None)
    etfs = [e for e in cargar_yaml("universo_etf.yaml")["etfs"] if e.get("yahoo")]

    cache: dict[str, Puntos] = {}

    def puntos(ticker: str, cierre: str | None) -> Puntos:
        if ticker not in cache:
            cache[ticker] = puntos_desde_barras(horario(ticker), cierre)
        return cache[ticker]

    try:
        eurusd = puntos("EURUSD=X", None)
        salud.bien("yahoo_60m:EURUSD=X")
    except Exception as e:  # noqa: BLE001
        eurusd = None
        salud.mal("yahoo_60m:EURUSD=X", str(e))

    activos_out: dict[str, dict] = {}
    rend_diarios: dict[str, list[tuple[str, float]]] = {}
    for etf in etfs:
        ident, rol = etf["id"], etf.get("rol", "")
        ticker = etf.get("yahoo_intradia") or etf["yahoo"]
        try:
            reales = puntos(ticker, etf.get("cierre_intradia", "17:30"))
            salud.bien(f"yahoo_60m:{ticker}", f"{len(reales)} puntos")
        except Exception as e:  # noqa: BLE001
            salud.mal(f"yahoo_60m:{ticker}", str(e))
            continue
        proxy = etf.get("proxy_intradia", PROXY_POR_ROL.get(rol))
        x = None
        if proxy:
            try:
                x = serie_log_eur(puntos(proxy, None), eurusd)
            except Exception as e:  # noqa: BLE001
                salud.mal(f"yahoo_60m:{proxy}", str(e))
        beta, n_beta = estimar_beta(reales, x, defecto=1.0 if rol == "oro" else 0.6) if x else (0.0, 0)
        est = estado["activos"].setdefault(ident, estado_nuevo())

        # 1) Aprender del plan anterior (si es de otro día ya cerrado)
        plan = est.get("plan")
        if plan and plan["fecha"] < hoy.isoformat():
            f = date.fromisoformat(plan["fecha"])
            reales_dia = {p["hora"]: p["valor"] for p in rejilla_dia(f, reales, x, beta) if p["tipo"] == "real"}
            punt = evaluar_plan(est, plan, reales_dia)
            log.info("Intradía %s: evaluado %s → %s", ident, plan["fecha"], punt)
            est["plan"] = plan = None

        # 2) Plan de hoy (una vez al día, con datos anteriores a las 07:30)
        ancla_t = instante(hoy, REJILLA[0])
        if es_dia_habil(hoy) and plan is None:
            ancla = valor_en(min(ancla_t, ahora), reales, x, beta)
            if ancla:
                try:
                    serie = diario(etf["yahoo"])
                    rend = rendimientos_diarios(serie)
                    rend_diarios[ident] = list(zip([f for f, _ in serie[1:]], rend))
                    g = garch11(rend[-500:])
                except Exception as e:  # noqa: BLE001
                    salud.mal(f"yahoo_1d:{etf['yahoo']}", str(e))
                    rend, g = [], {"varianza_prevista": 1e-4, "alfa": None, "beta": None}
                dias_hist, previos = [], []
                for d in range(40, 0, -1):
                    f = hoy - timedelta(days=d)
                    if not es_dia_habil(f):
                        continue
                    dias_hist.append(rejilla_dia(f, reales, x, beta))
                    pv = valor_en(instante(f - timedelta(days=1 if f.weekday() else 3), "23:00"), reales, x, beta)
                    previos.append(pv[0] if pv else None)
                cuotas = estacionalidad(dias_hist, previos)
                cierre_prev = ultimo_hasta(reales, ancla_t - timedelta(hours=10))
                nocturno = math.log(ancla[0] / cierre_prev[1]) if cierre_prev and cierre_prev[1] > 0 else 0.0
                phi = [1.0, variable_geopolitica(mercado, rol, hoy), variable_vix(mercado), nocturno, rend[-1] if rend else 0.0]
                plan = est["plan"] = crear_plan(hoy, ancla[0], g["varianza_prevista"], cuotas, phi, est)
                plan["garch"] = {"alfa": g.get("alfa"), "beta": g.get("beta")}
                plan["cuotas"] = [round(c, 4) for c in cuotas]

        if plan is None or plan["fecha"] != hoy.isoformat():
            continue
        # 3) Lo que llevamos de día y previsión reanclada para las horas que quedan
        actual = rejilla_dia(hoy, reales, x, beta, hasta=ahora)
        ultimo = actual[-1] if actual else None
        sigma_dia = math.sqrt(plan["sigma2_dia"])
        activos_out[ident] = {
            "id": ident, "isin": etf.get("isin"), "nombre": etf.get("nombre"), "rol": rol,
            "ancla": {"hora": REJILLA[0], "valor": round(plan["ancla"], 4)},
            "plan": trayectoria(plan),
            "actual": actual,
            "prevision": trayectoria(plan, ultimo["valor"], ultimo["hora"]) if ultimo else trayectoria(plan),
            "modelo": {
                "indicador": proxy, "beta_indicador": round(beta, 3), "pares_beta": n_beta,
                "volatilidad_dia_pct": round(sigma_dia * 100, 3), "garch": plan.get("garch"),
                "rentabilidad_esperada_pct": round(plan["y"] * 100, 3),
                "pesos": {k: round(v, 3) for k, v in plan["pesos"].items()},
                "escala_banda": round(plan["escala"], 3),
                "variables": dict(zip(VARIABLES, [round(v, 5) for v in plan["phi"]])),
                "coeficientes": dict(zip(VARIABLES, [round(v, 6) for v in est["kalman"]["theta"]])),
                "dias_aprendidos": est["kalman"].get("n", 0),
            },
            "calidad": calidad(est["historial"]),
            "historial": est["historial"][-20:],
        }

    if rend_diarios:
        estado["comun"]["correlaciones"] = correlaciones(rend_diarios)
    salida = {
        "generado": ahora_iso(), "fecha": hoy.isoformat(), "zona": "Europe/Madrid", "horas": REJILLA, "z": Z80,
        "cobertura_objetivo": COBERTURA_OBJETIVO, "activos": activos_out,
        "correlaciones": estado["comun"].get("correlaciones"),
        "nota": ("Línea esperada y banda del 80 %. Entre 9:00 y 17:30 los precios son reales (Xetra); fuera de ese "
                 "horario se estiman con un indicador que cotiza casi 24 h. La dirección del día es casi impredecible: "
                 "la app mide cada día si la línea mejora a 'el precio no cambia'."),
        "salud": salud.a_dict(),
    }
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "intradia.json").write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (destino / "intradia_estado.json").write_text(json.dumps(estado, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return salida


def dentro_de_horario(ahora: datetime | None = None) -> bool:
    loc = (ahora or datetime.now(timezone.utc)).astimezone(MADRID)
    return es_dia_habil(loc.date()) and dtime(7, 0) <= loc.time() <= dtime(23, 59)


if __name__ == "__main__":
    configurar_log()
    if os.environ.get("FORZAR") == "1" or dentro_de_horario():
        r = ejecutar()
        log.info("Intradía: %d activos con previsión", len(r["activos"]))
    else:
        log.info("Fuera del horario de Trade Republic: no se hace nada")
