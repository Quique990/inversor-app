# 08 · IA gratuita y prompts

Código: `pipeline/ia.py`.

## Cadena de proveedores
1. **GitHub Models** (`https://models.github.ai/inference/chat/completions`) con el `GITHUB_TOKEN` del workflow y
   el permiso `models: read`. Modelo por defecto `openai/gpt-4.1-mini`, que se puede cambiar con la variable del
   repositorio `GITHUB_MODELS_MODEL`.
2. **Gemini** (opcional): crea una clave gratuita en Google AI Studio y guárdala como secreto `GEMINI_API_KEY`.
   Modelo configurable con `GEMINI_MODEL` (por defecto `gemini-flash-latest`). Los nombres de modelo cambian a
   menudo: copia el identificador exacto de la consola.
3. **Sin IA:** clasificación por palabras clave y resumen con plantilla. La app sigue funcionando entera.

## Presupuesto
Límite gratuito de GitHub Models: 8.000 tokens de entrada por petición. Se envían ~20.000 caracteres (unos
5.000 tokens): los datos de mercado más hasta ~120 titulares ordenados por peso de la fuente. Se hace 1 petición
al día.

## Qué hace (y qué no)
- ✅ Resume el día en ≤ 170 palabras, clasifica los eventos en los tipos permitidos de `reglas_eventos.yaml` con
  una intensidad de 0 a 3, distingue hechos de amenazas y lista los riesgos a vigilar.
- ❌ No recomienda comprar ni vender. Su intensidad solo puede subir **un nivel** lo que detectan las palabras
  clave, y los tipos que no existen se descartan (`eventos.fusionar`).

## Prompt de sistema (resumen)
> Analista macro y geopolítico prudente, en castellano de España, para un inversor de largo plazo en ETF.
> RESUMIR y CLASIFICAR, no recomendar. Basarse SOLO en los titulares y datos dados. Responder solo con JSON:
> `{resumen, eventos:[{tipo, intensidad, region, explicacion, hecho_o_amenaza}], riesgos_a_vigilar, tono_global}`.

El texto completo está en `_prompt_sistema()`. Si se cambia, hay que mantener el formato JSON, porque la web
lo lee.

## Mejoras posibles (sin coste)
- Una segunda petición semanal (los lunes) con un "informe de la semana" más largo.
- Usar los resúmenes de 7 días (`web/data/historial/`) como memoria para detectar escaladas progresivas.
