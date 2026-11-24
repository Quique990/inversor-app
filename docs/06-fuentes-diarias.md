# 06 · Fuentes que se consultan cada día

Configuración: `config/fuentes.yaml` y `config/universo_etf.yaml`. Estado diario: `web/data/salud_fuentes.json`
(se ve en Mercado → Estado de las fuentes).

## Criterios
1. **Gratuitas y legales:** RSS o API pública. No se hace scraping de webs de pago; solo se usan titulares y
   entradillas que el propio medio publica en su RSS.
2. **Fuentes primarias primero:** bancos centrales y organismos (BCE, Fed, Banco de España, FMI, EIA). Tienen
   peso 3 o 2.
3. **Diversidad geográfica** para no ver el mundo desde un solo país: BBC, Al Jazeera, DW, France 24, The
   Guardian, El País.
4. **Agencias vía Google News RSS:** Reuters, Bloomberg o AP no publican RSS gratuito. Google News RSS devuelve
   sus titulares con consultas temáticas (mercados, guerra/sanciones, petróleo).
5. **Medición cuantitativa:** GDELT DOC 2.0 mide el volumen y el tono de la cobertura mundial (65 idiomas) de
   conflicto, sanciones, energía y banca. Si el volumen de las últimas 24 h es ≥ 2× la media de 7 días, refuerza
   el evento.

## Lista
| Tipo | Fuente | Por qué |
|---|---|---|
| Banco central | BCE (RSS de prensa) ✔ | Tipos, discursos y estabilidad financiera de la zona euro |
| Banco central | Reserva Federal ✔ | Tipos de EE. UU., que mueven todos los mercados |
| Banco central | Banco de España | Contexto español |
| Energía | EIA *Today in Energy* | Oferta y precio del petróleo y el gas |
| Geopolítica | Al Jazeera ✔, BBC World, DW, France 24, El País Internacional | Cobertura internacional plural |
| Mercados | BBC Business, CNBC Markets, MarketWatch | Lo que mueve la sesión |
| Mercados (ES) | Expansión, Cinco Días | Visión española, IBEX y prima de riesgo |
| Agencias | Google News RSS (4 consultas) | Titulares de Reuters, Bloomberg, AP… |
| Cuantitativo | GDELT DOC 2.0 (4 consultas) | Volumen y tono mundiales |
| Índice | GPR diario (Caldara-Iacoviello) | Riesgo geopolítico medido por la Fed; contexto, no señal |
| Precios | Yahoo Finance v8 | ETF del universo, índices, VIX, Brent, oro, bono a 10 años, EUR/USD |
| Macro | FRED: T10Y3M, SAHMREALTIME, UNRATE, BAMLH0A0HYM2, CPIAUCSL | Recesión, crédito e inflación de EE. UU. |
| Macro | BCE: EUR/USD, tipo de depósito, IPCA | Zona euro |

✔ = verificado manualmente el 24-11-2026. Las demás se validan en cada ejecución.

## Añadir o quitar fuentes
Edita `config/fuentes.yaml`. Si una fuente falla 7 días seguidos (`salud_fuentes.json`), sustitúyela.
Mantén **al menos 30 titulares diarios**: por debajo, la confianza del informe baja a "media".
