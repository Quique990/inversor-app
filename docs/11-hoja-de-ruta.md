# 11 · Hoja de ruta

## Hecho (v1)
- [x] Análisis diario gratuito: noticias, GDELT, precios, macro, IA con respaldo y reglas de eventos.
- [x] Motor de señales con régimen, puntuación, postura y backtest.
- [x] PWA: Hoy, Cartera (FIFO, ganancia por compra, TIR, gráficas, eficacia de las señales), Diners, Mercado y Ajustes.
- [x] Datos privados en un repositorio privado con la clave cifrada con PIN.
- [x] Importación de Diners.xlsx y del CSV de Trade Republic; exportación a Excel.

## Próximo (por prioridad)
1. **Avisos por Telegram** (aparcado a petición del usuario). Bot gratuito; el workflow del repositorio privado
   enviaría un mensaje solo cuando la postura cambie a `comprar_extra` o `precaucion`. Secretos: `TELEGRAM_TOKEN`
   y `TELEGRAM_CHAT_ID`.
2. **Informe semanal** con IA (lunes) usando el historial de 7 días.
3. **Gráfica de la puntuación frente a la bolsa mundial**, para ver visualmente si las señales tienen sentido.
4. **Calendario macro** (reuniones de la Fed y el BCE, IPC) para avisar de días de volatilidad esperada.
5. **Modo IRPF:** ganancias realizadas por año (FIFO), listas para la declaración (casillas del ahorro).
6. **Varios dispositivos a la vez:** fusión de cambios si dos dispositivos editan a la vez (ahora gana el último).

## Ideas descartadas (y por qué)
- **Ejecutar órdenes automáticamente:** Trade Republic no tiene API pública para valores, y además sería un riesgo
  innecesario.
- **Predicción de precios con machine learning:** con datos gratuitos y un horizonte corto, el riesgo de
  sobreajuste es enorme. La evidencia (sección 1 del documento 05) favorece reglas simples y robustas.
