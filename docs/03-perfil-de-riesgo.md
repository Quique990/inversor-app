# 03 · Perfil de riesgo y carteras modelo

Código: `web/js/perfil.js`.

## Test (8 preguntas, 0-31 puntos)
Inspirado en los test de idoneidad MiFID II. Pregunta por el horizonte, la reacción ante una caída del 25 %,
el objetivo, la pérdida máxima tolerable, el fondo de emergencia, la estabilidad de ingresos, la experiencia y
la dependencia del dinero.

**Límites de sentido común** (pesan más que la puntuación):
- Con un horizonte inferior a 5 años, sin fondo de emergencia o si venderías en una caída fuerte, el perfil
  queda como máximo en "Moderado".

## Carteras modelo
| Perfil | Puntos | RV mundial | RF euro | Monetario | Oro | Caída orientativa |
|---|---|---|---|---|---|---|
| Conservador | 0-9 | 20 % | 50 % | 20 % | 10 % | 10-15 % |
| Moderado | 10-16 | 40 % | 40 % | 10 % | 10 % | 15-25 % |
| Equilibrado | 17-22 | 60 % | 30 % | — | 10 % | 25-30 % |
| Dinámico | 23-27 | 80 % | 10 % | — | 10 % | 35-45 % |
| Agresivo | 28-31 | 95 % | — | — | 5 % | hasta 50 % (2008) |

El reparto se puede ajustar a mano en Ajustes (debe sumar 100 %).

## ETF por hueco (por defecto; todos UCITS y de acumulación salvo EUNH)
| Hueco | ETF | ISIN | TER |
|---|---|---|---|
| Renta variable mundial | Vanguard FTSE All-World (VWCE) | IE00BK5BQT80 | 0,19 % |
| Renta fija euro | iShares Core Euro Govt Bond (EUNH) | IE00B4WXJJ64 | 0,07 % |
| Monetario | Xtrackers EUR Overnight Rate Swap (XEON) | LU0290358497 | 0,10 % |
| Oro | Invesco Physical Gold ETC (8PSG) | IE00B579F325 | 0,12 % |

Alternativas en `config/universo_etf.yaml`: MSCI World + EM IMI, S&P 500, Global Aggregate cubierto en EUR y
Xetra-Gold. **Comprueba en Trade Republic que cada ETF admite plan de inversión** antes de elegirlo.

## Por qué un solo ETF mundial
Con 10 €/mes, repartir el dinero entre muchos ETF no aporta diversificación real y complica rebalancear. Un ETF
mundial ya incluye unas 4.000 empresas de desarrollados y emergentes. El oro y los bonos se añaden según el perfil.

## Fiscalidad en España (recordatorio, no asesoramiento)
- A diferencia de los fondos, los ETF **no** permiten traspasos sin tributar: cada venta con ganancia tributa en la
  base del ahorro (19-30 %). Por eso la app evita proponer ventas y rebalancea con las nuevas aportaciones.
- Los ETF de acumulación no reparten dividendos y difieren la tributación.
