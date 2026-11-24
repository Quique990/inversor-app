# 00 · Visión y alcance

## Para quién
Un inversor particular en España, con Trade Republic, que invierte en ETF a largo plazo con aportaciones pequeñas
(~10 €/mes) y está dispuesto a aportar más algún mes si hay una buena oportunidad. Lleva su contabilidad personal
en un Excel ("Diners") y quiere tenerlo todo en el móvil, gratis y con sus datos privados.

## Qué resuelve
1. **"¿Hago algo este mes?"** Cada mañana la app lee noticias y datos de mercado de todo el mundo, detecta los
   eventos que importan y responde con una postura clara: seguir el plan, aportar extra (de golpe o escalonado)
   o tener precaución. Además dice cuánto, en qué ETF y cómo hacerlo para no pagar comisiones absurdas.
2. **"¿Cómo voy?"** Valor, ganancia por cada compra según el momento en que se hizo, TIR, gráficas y reparto
   frente al objetivo de su perfil de riesgo.
3. **"¿Dónde está mi dinero?"** La contabilidad Diners integrada (corto, medio y largo plazo e inversiones), con
   sus reglas automatizadas y los errores del Excel corregidos.

## Qué NO es
- No es un asesor financiero regulado ni promete predecir el mercado. Las señales son tendencias históricas con
  probabilidades, explicadas y verificables.
- No opera por ti. Tú ejecutas las órdenes en Trade Republic.
- No es un servicio para terceros.

## Requisitos clave
| Requisito | Cómo se cumple |
|---|---|
| Coste 0 € | GitHub Actions + Pages + GitHub Models (ver 01) |
| Datos privados | Repositorio privado + clave limitada y cifrada (ver 02) |
| Usable en el móvil | PWA instalable, funciona sin conexión con los últimos datos |
| Castellano | Toda la interfaz, la documentación y los resúmenes de la IA |
| Regla de los 300 € como aviso | Aviso con botón, nunca automático (ver 07) |
| Gastos sin categorías | Importe y un concepto libre opcional |
| Telegram | Aparcado (ver 11) |
