# 07 · Diners: contabilidad personal integrada

Código: `web/js/diners.js` (lógica), `web/js/vistas/diners.js` (pantalla), `web/js/importar_excel.js` (importar/exportar).
Datos: `data/contabilidad.json` en el repositorio privado.

## Origen
Migración del Excel `Diners.xlsx` (hojas General, Transferencies, Inversions, Corto Plazo), respetando sus reglas:

| Regla del Excel | En la app |
|---|---|
| Cuando el corto plazo llega a 300 €, se pasan 150 € a medio | **Aviso** (no automático) en Hoy y en Diners, con un botón para registrar el traspaso. Umbral y cantidad configurables |
| "Fecha a cuadrar" incluye el mes que se escribe | Los intereses se registran por mes (`AAAA-MM`) con la casilla "cuadrado" |
| Los intereses se reparten de forma proporcional entre largo y medio plazo | Reparto según los saldos **del momento** y **fijado** al guardarlo |
| Los cobros extraordinarios van en Transferencias | Transferencia desde "Extraordinario" hacia un bloque |
| La renta fija siempre cuenta como largo plazo | Se fuerza al guardar |
| La renta variable se marca largo o medio | Casilla "Largo plazo"; se conserva al marcarla como acabada |

## Errores del Excel corregidos
1. **El reparto de intereses cambiaba el pasado.** Todas las filas usaban `$B$2/($B$2+$B$3)`, es decir, el saldo
   actual, así que cada cambio de saldo recalculaba los repartos de meses anteriores.
2. **Saldos escritos a mano.** Ahora se calculan siempre: saldos iniciales + semanas + transferencias + intereses.
3. **El "Incremento semana" no tenía fórmula hasta la fila 53.** En la app todas las semanas se calculan igual:
   paga + extra − gastos.
4. **Inversiones sin fechas ni precios de compra.** Las compras de ETF van a Cartera con fecha, participaciones y
   precio. Las inversiones que no son ETF (renta fija USD, acciones sueltas) siguen como "inversiones manuales".
5. **Límites fijos** (20 filas en la evolución del dinero, 3 gastos por semana): ahora no hay límite y cada gasto
   puede llevar un concepto.

## Modelo de datos (`contabilidad.json`)
```jsonc
{
  "version": 1,
  "config": { "umbralCorto": 300, "traspaso": 150 },
  "saldosIniciales": { "fecha": "2025-12-28", "corto": 67.04, "medio": 0, "largo": 0 },
  "semanas": [{ "id": "…", "fecha": "2026-01-04", "paga": 50, "extra": 0, "gastos": [{ "importe": 12.5, "concepto": "cine" }] }],
  "transferencias": [{ "id": "…", "fecha": "2026-08-17", "cantidad": 60, "concepto": "", "de": "extraordinario", "a": "medio" }],
  "intereses": [{ "id": "…", "mes": "2026-01", "fecha": "2026-01-28", "importe": 8.02, "reparto": { "largo": 4.01, "medio": 4.01, "pesoLargo": 0.5 }, "cuadrado": true }],
  "inversionesManuales": [{ "id": "…", "nombre": "Interés fijo USD 2026", "tipo": "fija", "inicial": 0, "actual": 0, "comisiones": 0, "caduca": "2026-12-31", "largoPlazo": true, "acabada": false }],
  "notas": ["Instrucciones importadas del Excel"]
}
```
`de`/`a` ∈ `corto | medio | largo | extraordinario` (este último solo como origen).

## Bloque "Inversiones"
= inversiones manuales activas (valor actual) + valor de la cartera de ETF. Cada activo de la cartera tiene un
`bloque` (largo por defecto, o medio), que decide si cuenta como inversión a largo o a medio plazo.

## Relación con las recomendaciones
- **Colchón:** si corto + medio < "colchón mínimo" (Ajustes → Tu plan), la app no propone aportaciones extra.
- **Límite del extra:** nunca se propone invertir más de lo que excede del colchón.

## Importación del Excel
Diners → "Importar Diners.xlsx". El fichero se procesa en el dispositivo:
- Lee las semanas (Semana, Paga, Extra, Gasto 1-3), el saldo inicial del corto plazo (el número al principio de la
  fórmula de la primera fila de Total, p. ej. `=67.04-D2-E2`), las transferencias, los intereses (mes en
  valenciano o castellano; si falta el año, se hereda el de la fila anterior), las inversiones de renta
  variable, renta fija e historial, y las instrucciones.
- Si la hoja General tiene saldos, ajusta los saldos iniciales para cuadrar con ellos. Si no, avisa para que los
  revises en "Saldos iniciales y reglas".
- **Sustituye** la contabilidad actual de la app (pide confirmación).

Exportar → `Diners-AAAA-MM-DD.xlsx` con las hojas General, Corto Plazo, Transferencias, Intereses, Inversiones
manuales, Cartera y Operaciones.
