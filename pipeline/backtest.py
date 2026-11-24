"""Backtest honesto de la parte táctica.

Compara, con el MISMO dinero total aportado cada mes:
  A) Plan puro: todo el dinero mensual se invierte el primer día hábil del mes.
  B) Plan + reserva táctica: un % del dinero mensual se guarda en una "hucha" (sin intereses, para ser
     conservadores) y se invierte solo cuando la puntuación de oportunidad lo indica.

Solo usa las señales cuantitativas reconstruibles hacia atrás (caída desde máximos y VIX); las noticias
históricas no están disponibles gratis. Si B no supera a A en el histórico, la web lo dice claramente.
"""
from __future__ import annotations

from datetime import date

from .senales import _clamp

Serie = list[tuple[str, float]]


def puntuacion_historica(precios: Serie, vix: dict[str, float], i: int) -> float:
    ventana = precios[max(0, i - 252):i + 1]
    maximo = max(v for _, v in ventana)
    dd = (precios[i][1] / maximo - 1) * 100
    p = _clamp((-dd - 3) / 17 * 40, 0, 45)
    v = vix.get(precios[i][0])
    if v is not None:
        p += _clamp((v - 20) / 20 * 25, 0, 30)
    return p


def simular(precios: Serie, vix_serie: Serie, aportacion: float = 100.0, pct_reserva: float = 0.3,
            umbral: float = 45.0, umbral_escalonado: float = 20.0, enfriamiento_dias: int = 14) -> dict:
    if len(precios) < 300:
        return {"error": "Histórico insuficiente"}
    vix = dict(vix_serie)
    part_a = part_b = 0.0
    reserva = 0.0
    aportado = 0.0
    mes_actual = None
    ultimo_disparo: date | None = None
    disparos = []
    for i in range(252, len(precios)):
        f, p = precios[i]
        d = date.fromisoformat(f)
        if (d.year, d.month) != mes_actual:
            mes_actual = (d.year, d.month)
            aportado += aportacion
            part_a += aportacion / p
            part_b += aportacion * (1 - pct_reserva) / p
            reserva += aportacion * pct_reserva
        if reserva <= 0:
            continue
        if ultimo_disparo and (d - ultimo_disparo).days < enfriamiento_dias:
            continue
        s = puntuacion_historica(precios, vix, i)
        fraccion = 1.0 if s >= umbral else (1 / 3 if s >= umbral_escalonado else 0.0)
        if fraccion:
            importe = reserva * fraccion if fraccion < 1 else reserva
            part_b += importe / p
            reserva -= importe
            ultimo_disparo = d
            disparos.append({"fecha": f, "puntuacion": round(s, 1), "importe": round(importe, 2)})
    precio_final = precios[-1][1]
    valor_a = part_a * precio_final
    valor_b = part_b * precio_final + reserva
    return {
        "desde": precios[252][0], "hasta": precios[-1][0],
        "aportado": round(aportado, 2),
        "valor_plan_puro": round(valor_a, 2),
        "valor_plan_tactico": round(valor_b, 2),
        "diferencia_pct": round((valor_b / valor_a - 1) * 100, 2) if valor_a else None,
        "reserva_sin_invertir": round(reserva, 2),
        "invertido_tactico": round(aportado - reserva, 2),
        "num_disparos": len(disparos),
        "ultimos_disparos": disparos[-8:],
        "parametros": {"pct_reserva": pct_reserva, "umbral": umbral, "umbral_escalonado": umbral_escalonado},
        "nota": "Sin dividendos ni intereses de la reserva; solo señales de precio y VIX.",
    }


def ejecutar(series: dict) -> dict:
    precios = series.get("SP500") or series.get("VWCE") or []
    vix = series.get("VIX") or []
    resultado = {"activo": "SP500" if series.get("SP500") else "VWCE"}
    resultado.update(simular(precios, vix))
    resultado["variantes"] = [
        {"pct_reserva": pr, **{k: v for k, v in simular(precios, vix, pct_reserva=pr).items()
                               if k in ("diferencia_pct", "num_disparos")}}
        for pr in (0.1, 0.2, 0.5)
    ] if len(precios) >= 300 else []
    return resultado

