// Contabilidad personal "Diners" (migración del Excel Diners.xlsx, con sus reglas):
//  * Bloques: corto plazo (semanal), medio plazo, largo plazo e inversiones.
//  * Cuando el corto plazo llega al umbral (300 €) se AVISA de pasar 150 € a medio plazo.
//  * Los intereses se reparten entre largo y medio plazo en proporción a sus saldos EN ESE MOMENTO
//    (en el Excel se recalculaban con el saldo actual y cambiaban el pasado; aquí quedan fijados).
//  * Los cobros extraordinarios entran como transferencias desde "extraordinario".
//  * La renta fija cuenta siempre como largo plazo; la variable se marca largo o medio.
//  * Comprar un ETF o una inversión manual SACA el dinero del bloque que la paga (si no, se contaría dos veces:
//    una como saldo y otra como inversión). Se puede desactivar por operación ("fuera de Diners") o en general.

export const BLOQUES = { corto: "Corto plazo", medio: "Medio plazo", largo: "Largo plazo", extraordinario: "Extraordinario (cobro externo)" };
export const PAGADO_DESDE = { auto: "Automático (bloque del activo)", largo: "Largo plazo", medio: "Medio plazo", corto: "Corto plazo", fuera: "Fuera de Diners (no descontar)" };

const r2 = (x) => Math.round(x * 100) / 100;
export const incrementoSemana = (s) => (Number(s.paga) || 0) + (Number(s.extra) || 0) - (s.gastos || []).reduce((a, g) => a + (Number(g.importe) || 0), 0);

/** Bloque del que sale (o al que vuelve) el dinero de una operación de la cartera, o null si no se descuenta. */
export function bloqueOperacion(op, cartera, c) {
  const p = op.pagadoDesde;
  if (p && p !== "auto") return p === "fuera" ? null : p;
  if ((c?.config?.comprasCartera || "descontar") === "no") return null;
  return cartera?.activos?.[op.isin]?.bloque === "medio" ? "medio" : "largo";
}

export const valorFinalManual = (inv) => (Number(inv.actual ?? inv.inicial) || 0) - (Number(inv.comisiones) || 0);

function movimientos(c, cartera = null) {
  const ev = [];
  const desde = c.saldosIniciales?.fecha || "";
  for (const s of c.semanas || []) ev.push({ fecha: s.fecha, corto: incrementoSemana(s) });
  for (const t of c.transferencias || []) {
    const m = { fecha: t.fecha };
    const x = Number(t.cantidad) || 0;
    if (t.de && t.de !== "extraordinario") m[t.de] = (m[t.de] || 0) - x;
    if (t.a) m[t.a] = (m[t.a] || 0) + x;
    ev.push(m);
  }
  for (const i of c.intereses || []) ev.push({ fecha: i.fecha || `${i.mes}-28`, largo: i.reparto?.largo || 0, medio: i.reparto?.medio || 0 });
  // Compras/ventas de la cartera de ETF posteriores a los saldos iniciales (las anteriores ya están en ellos)
  for (const op of cartera?.operaciones || []) {
    if (desde && op.fecha < desde) continue;
    const b = bloqueOperacion(op, cartera, c);
    if (!b) continue;
    const imp = Number(op.importe) || 0, com = Number(op.comision) || 0;
    const delta = op.tipo === "compra" ? -(imp + com) : op.tipo === "venta" || op.tipo === "dividendo" ? imp - com : 0;
    if (delta) ev.push({ fecha: op.fecha, [b]: delta });
  }
  // Inversiones manuales con fecha y bloque de origen (las importadas del Excel no tienen: ya estaban descontadas)
  for (const inv of c.inversionesManuales || []) {
    const b = inv.pagadoDesde;
    if (!b || b === "fuera" || !inv.fecha || inv.enCartera || (desde && inv.fecha < desde)) continue;
    ev.push({ fecha: inv.fecha, [b]: -(Number(inv.inicial) || 0) });
    if (inv.acabada && inv.fechaFin) ev.push({ fecha: inv.fechaFin, [b]: valorFinalManual(inv) });
  }
  return ev.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
}

export function saldos(c, hasta = null, cartera = null) {
  const s = { corto: Number(c.saldosIniciales?.corto) || 0, medio: Number(c.saldosIniciales?.medio) || 0, largo: Number(c.saldosIniciales?.largo) || 0 };
  for (const m of movimientos(c, cartera)) {
    if (hasta && m.fecha > hasta) break;
    for (const k of ["corto", "medio", "largo"]) s[k] += m[k] || 0;
  }
  for (const k of Object.keys(s)) s[k] = r2(s[k]);
  return s;
}

export function valorInversionesManuales(c) {
  let largo = 0, medio = 0;
  for (const inv of c.inversionesManuales || []) {
    if (inv.acabada || inv.enCartera) continue;
    const v = Number(inv.actual ?? inv.inicial) || 0;
    if (inv.tipo === "fija" || inv.largoPlazo !== false) largo += v; else medio += v;
  }
  return { largo, medio, total: largo + medio };
}

/** Resumen de los 4 bloques. valorCartera = {largo, medio} desde la cartera de ETF (opcional). */
export function resumen(c, valorCartera = { largo: 0, medio: 0 }, cartera = null) {
  const s = saldos(c, null, cartera);
  const man = valorInversionesManuales(c);
  const inversiones = man.total + (valorCartera.largo || 0) + (valorCartera.medio || 0);
  return { ...s, inversiones, inversionesLargo: man.largo + (valorCartera.largo || 0), inversionesMedio: man.medio + (valorCartera.medio || 0),
    total: s.corto + s.medio + s.largo + inversiones };
}

export function repartirInteres(importe, s) {
  const base = Math.max(0, s.largo) + Math.max(0, s.medio);
  const pesoLargo = base > 0 ? Math.max(0, s.largo) / base : 0.5;
  const largo = r2(importe * pesoLargo);
  return { largo, medio: r2(importe - largo), pesoLargo };
}

/** Vuelve a calcular el reparto de TODOS los intereses, en orden, con los saldos de cada momento.
 *  Útil después de corregir los saldos iniciales (p. ej. tras importar un Excel sin saldos). */
export function recalcularRepartos(c, cartera = null) {
  const orden = [...(c.intereses || [])].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const tmp = { ...c, intereses: [] };
  let cambios = 0;
  for (const i of orden) {
    const antes = JSON.stringify(i.reparto);
    i.reparto = repartirInteres(Number(i.importe) || 0, saldos(tmp, i.fecha || `${i.mes}-28`, cartera));
    if (JSON.stringify(i.reparto) !== antes) cambios++;
    tmp.intereses.push(i);
  }
  return cambios;
}

export function avisoCorto(c, cartera = null) {
  const s = saldos(c, null, cartera);
  const { umbralCorto = 300, traspaso = 150 } = c.config || {};
  return s.corto >= umbralCorto ? { saldo: s.corto, umbral: umbralCorto, traspaso } : null;
}

/** Bloques con saldo negativo (señal de que algo se pagó con dinero que no está en Diners). */
export function saldosNegativos(c, cartera = null) {
  const s = saldos(c, null, cartera);
  return ["corto", "medio", "largo"].filter((k) => s[k] < -0.005).map((k) => ({ bloque: k, saldo: s[k] }));
}

export function evolucion(c, cartera = null) {
  const fechas = [...new Set(movimientos(c, cartera).map((m) => m.fecha))].sort();
  return fechas.map((f) => ({ fecha: f, ...saldos(c, f, cartera) }));
}

export function rentabilidadManual(c) {
  const activas = (c.inversionesManuales || []).filter((i) => !i.acabada && !i.enCartera);
  const fija = activas.filter((i) => i.tipo === "fija");
  const variable = activas.filter((i) => i.tipo !== "fija");
  const r = (l) => {
    const ini = l.reduce((s, i) => s + (Number(i.inicial) || 0), 0);
    const act = l.reduce((s, i) => s + valorFinalManual(i), 0);
    return { inicial: ini, actual: act, beneficio: act - ini, pct: ini ? (act / ini - 1) * 100 : null };
  };
  const acabadas = (c.inversionesManuales || []).filter((i) => i.acabada && !i.enCartera);
  return { fija: r(fija), variable: r(variable), total: r(activas), historial: r(acabadas) };
}

// ------------------------------------------------------------------ inversiones repetidas en Cartera
const GRUPOS = [["sp500", "sandp500"], ["gold", "oro"], ["silver", "plata"], ["ibex"], ["msciworld", "allworld", "ftseallworld", "coreworld"],
  ["nasdaq"], ["stoxx", "eurostoxx"], ["emerging", "emergentes"], ["brent", "crude", "petroleo"]];
const clave = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/** Inversiones manuales activas que parecen ser el mismo activo que algo de la cartera de ETF. */
export function posiblesDuplicados(c, cartera) {
  const activos = Object.entries(cartera?.activos || {});
  const vivos = new Set((cartera?.operaciones || []).map((o) => o.isin));
  const res = [];
  for (const inv of c.inversionesManuales || []) {
    if (inv.acabada || inv.enCartera || inv.distintaDeCartera) continue;
    const ki = clave(inv.nombre);
    for (const [isin, a] of activos) {
      if (!vivos.has(isin)) continue;
      const ka = clave(a.nombre);
      if (GRUPOS.some((g) => g.some((t) => ki.includes(t)) && g.some((t) => ka.includes(t)))) { res.push({ inv, isin, nombreActivo: a.nombre }); break; }
    }
  }
  return res;
}
