# 05 · Base de conocimiento: cómo afectan los eventos mundiales a los mercados

> Investigación realizada el 24-11-2026. Las reglas que usa el código están en
> `config/reglas_eventos.yaml` y deben mantenerse coherentes con este documento.
> Si actualizas una cifra aquí, actualízala también allí, y al revés.

## 1. Conclusiones generales (lo más importante)

1. **La mayoría de shocks geopolíticos se recuperan rápido.** LPL Research revisó 26 eventos
   geopolíticos desde 1941. De media, el S&P 500 cae un 4,5 % (mediana: 2,9 %), toca fondo en unos
   18 días y recupera el nivel previo en menos de 39 días.
   Deutsche Bank da una mediana del −6,1 % y 16 días hasta el suelo. Su recuperación media es de 109 días,
   pero esa cifra está muy distorsionada por el embargo de 1973, que tardó más de 5 años en recuperarse.
2. **El tamaño del evento NO predice el tamaño de la caída.** El propio LPL lo subraya, y es la razón de que
   la app puntúe la caída de precios y el miedo (VIX), no lo grave que suena la noticia.
3. **Lo decisivo es el contexto macro.** Según el análisis de más de 40 shocks citado por Kitco/LPL (2026),
   lo que más determina la reacción del mercado es si la economía ya está en recesión o cerca de ella.
   Si el shock llega en plena expansión, el mercado suele quedar plano o algo positivo en los meses siguientes.
4. **El índice GPR no predice rentabilidades futuras.** Bianchi, Johns, Ludvigson y Ma (Fed/NBER) concluyen
   que los picos de riesgo geopolítico no predicen rentabilidades ni primas futuras, y que la mayor parte de
   la incertidumbre financiera no la generan los eventos geopolíticos. Caldara e Iacoviello sí documentan
   efectos sobre la actividad real, las rentabilidades y los flujos de capital, pero son efectos moderados.
   **Consecuencia de diseño:** el GPR se muestra como contexto, pero no suma puntos a la señal.
5. **Comprar en momentos de pánico ha funcionado históricamente.** Wells Fargo analizó el periodo 1990-2025:
   con el VIX por encima de 40, el S&P 500 subió de media un 30 % a 12 meses, con más de un 90 % de casos positivos.
6. **El market timing a partir de la valoración no funciona a corto plazo.** El CAPE explica en torno al 40-60 %
   de la rentabilidad a 10 años (Vanguard: R² = 0,43 entre 1926 y 2011; el "Component CAPE" de 2026 llega a un
   R² fuera de muestra de 0,58), pero casi nada a 1 año. Además, Vanguard estima un error medio de ±7,8 puntos
   anuales en su previsión a 10 años.
7. **Invertir de golpe gana a escalonar unas 2 de cada 3 veces.** Vanguard (1976-2022): la inversión única
   batió al promediado en el 68 % de los casos. Escalonar reduce el arrepentimiento y el riesgo de comprar en
   el pico, a cambio de una rentabilidad esperada algo menor.
   **Consecuencia de diseño:** la app nunca recomienda retener el plan para "esperar caídas". Las aportaciones
   extra salen de ahorro que ya estaba fuera del mercado (el medio plazo de Diners).

## 2. Tabla por tipo de evento

| Evento | Bolsa | Bonos calidad | Oro | Dólar | Petróleo | Evidencia clave |
|---|---|---|---|---|---|---|
| Conflicto militar | ▼ | ▲ | ▲ | ▲ | ▲ | LPL: −4,5 % de media, recuperación < 39 días |
| Shock de petróleo | ▼ | ＝ | ▲ | ▲ | ▲▲ | T. Rowe Price: 7 shocks desde 1972; solo 1973 hundió la bolsa (−30 % frente a bonos en 12 meses) |
| Atentado | ▼ | ▲ | ▲ | ＝ | ＝ | 11-S: −11,6 %, recuperado en ~1 mes |
| Aranceles/sanciones | ▼ | ▲ | ▲ | ＝ | ▼ | Abril 2025: −12 % en 4 días, +9,5 % el día de la pausa y máximos en < 20 semanas (BIS) |
| Banco central endurece | ▼ | ▼ | ▼ | ▲ | ＝ | Lo que mueve el mercado es la sorpresa frente a lo esperado |
| Banco central relaja | ▲ | ▲ | ▲ | ▼ | ＝ | +6,6 % a 1 año tras el primer recorte (Evercore), pero −12 % si es en recesión (Carson) |
| IPC peor de lo esperado | ▼ | ▼ | ＝ | ▲ | ＝ | Reacción mucho mayor en regímenes de inflación alta (Kroner, Fed) |
| Señales de recesión | ▼▼ | ▲▲ | ▲ | ▲ | ▼ | La curva invertida precede a la recesión en 14-22 meses, con mucha variabilidad |
| Crisis bancaria/crédito | ▼▼ | ▲ | ▲ | ▲ | ▼ | Confirmar con el diferencial high yield (FRED BAMLH0A0HYM2) |
| Prima de riesgo euro | ▼ | ＝ | ▲ | ▲ | ＝ | Muy relevante para el IBEX; el BCE tiene el TPI para frenarla |
| Pandemia | ▼▼ | ▲▲ | ▲ | ▲ | ▼▼ | Covid: −34 % en 23 sesiones; máximos en ~5 meses gracias a los estímulos |
| Elecciones | ＝ | ＝ | ＝ | ＝ | ＝ | Los midterms de EE. UU. son los años más volátiles, pero el mercado suele subir en los 12 meses siguientes |
| Burbuja/valoraciones | ▼ | ▲ | ＝ | ＝ | ＝ | Respuesta adecuada: diversificar, no salir del mercado |
| Desescalada/acuerdo | ▲ | ＝ | ▼ | ▼ | ▼ | Rebotes rápidos; perseguirlos no da ventaja |

## 3. Matices críticos

### 3.1 El petróleo con inflación alta es la combinación peligrosa
En 1973 coincidieron un shock de alimentos y el embargo de la OPEP, con la inflación ya alta. La Fed subió
tipos del 5,5 % al 13 % e incluso siguió subiendo con la recesión ya en marcha (T. Rowe Price). En 1990 el crudo
pasó de 15 a 42 $ en dos meses tras la invasión de Kuwait, y hubo recesión. En 2022 el Brent llegó a 139 $.
**Regla:** si el Brent sube más de un 30 % en 3 meses o hay un shock de petróleo de intensidad ≥ 2, y además el
régimen es de inflación alta, la postura pasa a **precaución**.

### 3.2 El oro no siempre protege
El World Gold Council documenta un buen comportamiento del oro en los picos de riesgo geopolítico. Sin embargo,
en el conflicto con Irán de 2026 el oro cayó más que la bolsa: un 10 % por debajo de su nivel previo en abril,
mientras la bolsa ya se había recuperado (Morgan Stanley, CMC Markets). El BIS (2026) explica que el efecto
refugio depende de las condiciones financieras. **Consecuencia:** el oro se usa como diversificador estructural
(5-10 % de la cartera), no como apuesta táctica ante cada noticia.

### 3.3 El dólar como refugio y el inversor europeo
En las crisis el dólar suele subir, lo que amortigua las caídas de los ETF de renta variable mundial (con mucho
peso en EE. UU.) para quien invierte en euros. Si la crisis es "made in USA" (por ejemplo, los aranceles de 2025),
el dólar puede caer y empeorar el resultado en euros. La web calcula siempre el valor en euros.

### 3.4 Productos apalancados (x2, x3) con reajuste diario
Su objetivo es multiplicar el movimiento de UN DÍA. Si se mantienen más tiempo, la volatilidad los erosiona
aunque el subyacente acabe donde empezó: una caída aproximada de ½·L·(L−1)·σ²·T. Por ejemplo, un ETP x3 puede
quedarse por detrás del índice sin apalancar en 3-5 años incluso con el índice en positivo. **Regla:** la app los
detecta por el nombre (x3, 3x, leveraged…) y avisa, porque no son adecuados para el largo plazo.

### 3.5 Contexto actual (noviembre de 2026)
- Conflicto en Oriente Próximo desde finales de febrero de 2026 (ataques de EE. UU. e Israel sobre Irán, estrecho
  de Ormuz con tráfico afectado). El Brent llegó a superar los 100 $ y en noviembre oscila entre 88 y 100 $.
- La Fed y el BCE mantuvieron tipos en octubre, pero el mercado descuenta subidas en diciembre: régimen de
  inflación persistente, el más peligroso para los shocks de oferta (ver 3.1).
- En marzo de 2026 el S&P 500 cayó un 7,4 % frente a la mediana histórica del 6,1 % (MarketWatch/Deutsche Bank).
  Este episodio fue peor que la media precisamente por el petróleo.
- Hay dudas sobre las valoraciones de la IA: el Informe de Estabilidad Financiera del BCE de noviembre de 2026
  cita los riesgos por las valoraciones de la IA, los desequilibrios fiscales y las tensiones geoeconómicas.

## 4. Fuentes

- LPL Research, *Iran Escalation: How Markets Have Reacted to Geopolitical Events* (marzo de 2026) y *Lessons From Past Conflicts* (abril de 2026).
- MarketWatch/Morningstar, tabla de Deutsche Bank sobre shocks geopolíticos (30-03-2026).
- Caldara, D. e Iacoviello, M. (2022), *Measuring Geopolitical Risk*, AER. Datos: matteoiacoviello.com/gpr.htm
- Bianchi, Johns, Ludvigson y Ma, *Are Geopolitical Risks Financial Market Risks?* (presentación en el DNB).
- FMI, GFSR, abril de 2025, cap. 2 (efectos de los grandes eventos geopolíticos en las bolsas).
- T. Rowe Price, *Parallels to the 1973 Market Shocks May Be Imprecise* (2022).
- Advisor Perspectives, *Oil Shocks & Recessionary Outcomes* (abril de 2026).
- Wells Fargo Investment Institute vía CNBC: el VIX > 40 y las rentabilidades a 12 meses (1990-2025).
- Vanguard, *Cost averaging: Invest now or temporarily hold your cash?* (2023).
- Vanguard/Advisor Perspectives/Morningstar sobre el CAPE (2018-2026).
- Reuters/Evercore ISI, Carson Group y Ned Davis Research sobre los recortes de tipos.
- Kroner, T. N. (Fed), *Inflation and Attention* (2023-2025).
- BIS Quarterly Review, sept. de 2025: *Understanding the swift market recovery after the April 2025 tariff shock*.
- BIS WP 1380 (2026), sobre el oro y el riesgo geopolítico; World Gold Council (2024); Morgan Stanley (mayo de 2026).
- Credit Suisse, Invesco y BMO sobre la inversión de la curva y su adelanto a las recesiones.
- LPL, Fidelity, BlackRock y J.P. Morgan sobre los años de midterms (2026).
- Faber, M., *A Quantitative Approach to Tactical Asset Allocation* (media de 10 meses / 200 sesiones).
- Leverage Shares, interactive investor: la erosión de los ETP apalancados.
- CaixaBank Research, InvestingLive y Finect: resúmenes de mercado de noviembre de 2026.
