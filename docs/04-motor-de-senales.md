# 04 · Motor de señales

Código: `pipeline/senales.py` (público, sin datos personales) y `web/js/reco.js` (personal, en el navegador).

## Principios
1. **El plan periódico es la base.** Las señales solo responden a: ¿merece la pena una aportación EXTRA este mes?
   ¿De golpe o escalonada? ¿Hay que tener cuidado?
2. **La oportunidad la crea el precio, no la noticia.** La puntuación se basa en la caída desde máximos y en el
   miedo del mercado (VIX/VSTOXX). Las noticias solo suman si ya ha habido caída.
3. **El régimen macro decide la prudencia.** Si la recesión es probable o hay inflación alta, las caídas pueden
   alargarse, así que la app recomienda escalonar o tener precaución.
4. **Vender casi nunca por timing.** Solo se proponen ventas para rebalancear desviaciones grandes (> 15 puntos),
   para salir de productos apalancados o para corregir concentraciones excesivas. Siempre se recuerda el coste
   fiscal y la comisión.
5. **La IA no decide.** Solo resume y clasifica titulares; su intensidad está limitada a +1 nivel sobre lo que
   detectan las palabras clave (`eventos.fusionar`).

## Puntuación de oportunidad (0-100)
| Factor | Cálculo | Máx. |
|---|---|---|
| Caída de la bolsa mundial (VWCE → EUNL → S&P 500) desde el máximo de 52 semanas | 0 si ≥ −3 %, lineal hasta 40 en −20 % | 45 |
| Miedo: máx(VIX, VSTOXX) | 0 si ≤ 20, lineal hasta 25 en 40 | 30 |
| Shock geopolítico (conflicto, terrorismo, aranceles, pandemia) de intensidad ≥ 2 **y** caída ≥ 5 % | +10 | 10 |

## Régimen
- **Recesión probable**, si se cumple cualquiera de estas: regla de Sahm ≥ 0,5; high yield ≥ 7 pp; curva 10a-3m
  invertida en los últimos 24 meses con Sahm ≥ 0,3; noticias de recesión de intensidad ≥ 2 con tendencia bajista.
- **Inflación alta**: IPC de EE. UU. > 3,5 %, IPCA de la eurozona > 3 % o bancos centrales endureciendo con intensidad ≥ 2.
- **Expansión**: en cualquier otro caso.

## Postura
| Puntuación | Postura base | Multiplicador del extra |
|---|---|---|
| < 20 | `mantener_plan` | 0 |
| 20-45 | `comprar_extra_escalonado` (3 tramos) | 3× aportación mensual |
| ≥ 45 | `comprar_extra` (1 tramo) | 6× (10× si ≥ 70) |

Modificadores:
- Una **tendencia bajista** (≥ 40 sesiones bajo la MM200 con la media cayendo) o un régimen distinto de la
  expansión convierten la postura en `escalonar`. Un desplome reciente no cuenta como tendencia, porque es
  justo cuando más se recupera.
- Un **petróleo** con intensidad ≥ 2 o una subida de más del 30 % en 3 meses, junto con inflación alta, da
  `precaucion` (o `escalonar` si la puntuación es ≥ 45). Pasa lo mismo con una **crisis de crédito** confirmada
  con un high yield ≥ 5.

## Recomendación personal (navegador)
- Extra en € = aportación mensual × multiplicador, limitado por el "máximo extra al mes" y por lo que exceda
  del colchón mínimo (corto + medio plazo de Diners).
- **Destino:** la renta variable mundial, salvo que tras la compra supere su objetivo en más de 5 puntos. En
  ese caso va al hueco más infraponderado.
- **Comisión:** si cada tramo es menor que el "mínimo para orden manual" (100 € por defecto, para que el 1 € de
  comisión sea ≤ 1 %), se propone subir el plan de inversión ese mes, que es gratis en Trade Republic.
- **Avisos:** colchón insuficiente, desviación ≥ 5 puntos (dirigir ahí las aportaciones), desviación > 15 puntos
  (considerar una venta parcial), productos apalancados y concentración > 15 % en un solo valor.

## Cómo evaluarlo
Ver `docs/09-backtesting-y-evaluacion.md`. La web muestra en "Mercado" el backtest semanal y en "Cartera" si tus
compras extra salieron más baratas que tus compras del plan.
