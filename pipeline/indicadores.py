"""Indicadores técnicos y macro sobre series (fecha, valor). Funciones puras y testeadas."""
from __future__ import annotations

from datetime import date, timedelta
from statistics import pstdev

Serie = list[tuple[str, float]]


def ultimo(s: Serie) -> float | None:
    return s[-1][1] if s else None


def media_movil(s: Serie, n: int) -> float | None:
    if len(s) < n:
        return None
    return sum(v for _, v in s[-n:]) / n


def pendiente_media(s: Serie, n: int, retardo: int = 20) -> float | None:
    """Variación % de la media móvil de n sesiones frente a la de hace `retardo` sesiones."""
    if len(s) < n + retardo:
        return None
    ahora = media_movil(s, n)
    antes = sum(v for _, v in s[-n - retardo:-retardo]) / n
    return (ahora / antes - 1) * 100 if antes else None


def sesiones_bajo_media(s: Serie, n: int = 200, max_mirar: int = 260) -> int | None:
    """Nº de sesiones consecutivas (hasta hoy) con el precio por debajo de su media móvil de n sesiones."""
    if len(s) < n:
        return None
    vals = [v for _, v in s]
    cuenta = 0
    suma = sum(vals[-n:])
    for k in range(min(max_mirar, len(vals) - n + 1)):
        fin = len(vals) - k  # ventana vals[fin-n:fin]
        if k > 0:
            suma += vals[fin - n] - vals[fin]
        if vals[fin - 1] < suma / n:
            cuenta += 1
        else:
            break
    return cuenta


def _desde(s: Serie, dias: int) -> Serie:
    if not s:
        return s
    corte = (date.fromisoformat(s[-1][0]) - timedelta(days=dias)).isoformat()
    return [p for p in s if p[0] >= corte]


def caida_desde_maximo(s: Serie, dias: int = 365) -> float | None:
    """% de caída del último valor frente al máximo de la ventana (negativo o 0)."""
    tramo = _desde(s, dias)
    if not tramo:
        return None
    maximo = max(v for _, v in tramo)
    return (tramo[-1][1] / maximo - 1) * 100 if maximo else None


def variacion(s: Serie, dias: int) -> float | None:
    """% de cambio del último valor frente al valor de hace `dias` naturales."""
    if not s:
        return None
    objetivo = (date.fromisoformat(s[-1][0]) - timedelta(days=dias)).isoformat()
    previos = [v for f, v in s if f <= objetivo]
    if not previos:
        return None
    return (s[-1][1] / previos[-1] - 1) * 100


def volatilidad_anual(s: Serie, sesiones: int = 21) -> float | None:
    if len(s) < sesiones + 1:
        return None
    vals = [v for _, v in s[-(sesiones + 1):]]
    rets = [vals[i] / vals[i - 1] - 1 for i in range(1, len(vals))]
    return pstdev(rets) * (252 ** 0.5) * 100


def minimo_ventana(s: Serie, dias: int) -> float | None:
    tramo = _desde(s, dias)
    return min(v for _, v in tramo) if tramo else None


def interanual(s: Serie) -> float | None:
    """Variación interanual de una serie mensual de nivel (p. ej. IPC)."""
    if len(s) < 13:
        return None
    return (s[-1][1] / s[-13][1] - 1) * 100


def muestrear_semanal(s: Serie, max_puntos: int = 600) -> Serie:
    """Reduce una serie diaria a un punto por semana (último de cada semana ISO), para la web."""
    por_semana: dict[tuple[int, int], tuple[str, float]] = {}
    for f, v in s:
        iso = date.fromisoformat(f).isocalendar()
        por_semana[(iso[0], iso[1])] = (f, v)
    salida = [por_semana[k] for k in sorted(por_semana)]
    return salida[-max_puntos:]


def resumen_activo(s: Serie) -> dict:
    """Métricas estándar que la web muestra para cada activo/indicador."""
    if not s:
        return {}
    mm200 = media_movil(s, 200)
    return {
        "fecha": s[-1][0],
        "ultimo": round(s[-1][1], 4),
        "var_1d": _r(variacion(s, 1) if len(s) > 1 else None),
        "var_1m": _r(variacion(s, 30)),
        "var_3m": _r(variacion(s, 91)),
        "var_1a": _r(variacion(s, 365)),
        "caida_max_52s": _r(caida_desde_maximo(s, 365)),
        "mm200": _r(mm200),
        "sobre_mm200": (s[-1][1] > mm200) if mm200 else None,
        "pendiente_mm200": _r(pendiente_media(s, 200)),
        "vol_1m": _r(volatilidad_anual(s)),
    }


def _r(x: float | None, n: int = 2) -> float | None:
    return None if x is None else round(x, n)
