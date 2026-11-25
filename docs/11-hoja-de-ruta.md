# 11 · Hoja de ruta

## Hecho (v1)
- [x] Análisis diario gratuito: noticias, GDELT, precios, macro, IA con respaldo y reglas de eventos.
- [x] Motor de señales con régimen, puntuación, postura y backtest.
- [x] PWA: Hoy, Cartera (FIFO, ganancia por compra, TIR, gráficas, eficacia de las señales), Diners, Mercado y Ajustes.
- [x] Datos privados en un repositorio privado con la clave cifrada con PIN.
- [x] Importación de Diners.xlsx y del CSV de Trade Republic; exportación a Excel.
- [x] Revisión de Diners frente al Excel: compras que salen del bloque, duplicados con Cartera, recálculo de intereses.
- [x] Predicción intradía hora a hora (7:30–23:00) con aprendizaje diario y medidor de acierto (docs/12).
- [x] Pantalla "Cómo funciona" dentro de la app.

## Próximo (por prioridad)
El backlog detallado y con criterios de aceptación está en `docs/13-traspaso-a-codex.md`.

1. **Intradía para ETF propios fuera del universo** (workflow privado) y verificación de las barras de 60 min.
2. **IA gratuita** para el resumen (GitHub Models responde mal; Gemini aparcado porque AI Studio pide facturación).
3. **Avisos por Telegram** (aparcado a petición del usuario). Bot gratuito; el workflow del repositorio privado
   enviaría un mensaje solo cuando la postura cambie a `comprar_extra` o `precaucion`. Secretos: `TELEGRAM_TOKEN`
   y `TELEGRAM_CHAT_ID`.
4. **Informe semanal** con IA (lunes) usando el historial de 7 días.
5. **Gráfica de la puntuación frente a la bolsa mundial**, para ver visualmente si las señales tienen sentido.
6. **Calendario macro** (reuniones de la Fed y el BCE, IPC) para avisar de días de volatilidad esperada.
7. **Modo IRPF:** ganancias realizadas por año (FIFO), listas para la declaración (casillas del ahorro).
8. **Varios dispositivos a la vez:** fusión de cambios si dos dispositivos editan a la vez (ahora gana el último).

## Ideas descartadas (y por qué)
- **Ejecutar órdenes automáticamente:** Trade Republic no tiene API pública para valores, y además sería un riesgo
  innecesario.
- **Predicción de precios con machine learning complejo:** con datos gratuitos y un horizonte corto, el riesgo de
  sobreajuste es enorme. La predicción intradía (docs/12) usa a propósito modelos pequeños, con prior hacia "no
  cambia" y evaluación pública diaria; NO influye en las recomendaciones de compra.
