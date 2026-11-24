// Contabilidad personal "Diners" (migración del Excel Diners.xlsx, con sus reglas):
//  * Bloques: corto plazo (semanal), medio plazo, largo plazo e inversiones.
//  * Cuando el corto plazo llega al umbral (300 €) se AVISA de pasar 150 € a medio plazo.
//  * Los intereses se reparten entre largo y medio plazo en proporción a sus saldos EN ESE MOMENTO
//    (en el Excel se recalculaban con el saldo actual y cambiaban el pasado; aquí quedan fijados).
//  * Los cobros extraordinarios entran como transferencias desde "extraordinario".
//  * La renta fija cuenta siempre como largo plazo; la variable se marca largo o medio.

export const BLOQUES = { corto: "Corto plazo", medio: "Medio plazo", largo: "Largo plazo", extraordinario: "Extraordinario (cobro externo)" };

export const incrementoSemana = (s) => (Number(s.paga) || 0) + (Number(s.extra) || 0) - (s.gastos || []).reduce((a, g) => a + (Number(g.importe) || 0), 0);

function movimientos(c) {
  const ev = [];
  for (const s of c.semanas || []) ev.push({ fecha: s.fecha, corto: incrementoSemana(s) });
  for (const t of c.transferencias || []) {
    const m = { fecha: t.fecha };
    const x = Number(t.cantidad) || 0;
    if (t.de && t.de !== "extraordinario") m[t.de] = (m[t.de] || 0) - x;
    if (t.a) m[t.a] = (m[t.a] || 0) + x;
    ev.push(m);
  }
  for (const i of c.intereses || []) ev.push({ fecha: i.fecha || `${i.mes}-28`, largo: i.reparto?.largo || 0, medio: i.reparto?.medio || 0 });
  return ev.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
}

export function saldos(c, hasta = null) {
  const s = { corto: Number(c.saldosIniciales?.corto) || 0, medio: Number(c.saldosIniciales?.medio) || 0, largo: Number(c.saldosIniciales?.largo) || 0 };
  for (const m of movimientos(c)) {
    if (hasta && m.fecha > hasta) break;
    for (const k of ["corto", "medio", "largo"]) s[k] += m[k] || 0;
  }
  for (const k of Object.keys(s)) s[k] = Math.round(s[k] * 100) / 100;
  return s;
}

export function valorInversionesManuales(c) {
  let largo = 0, medio = 0;
  for (const inv of c.inversionesManuales || []) {
    if (inv.acabada) continue;
    const v = Number(inv.actual ?? inv.inicial) || 0;
    if (inv.tipo === "fija" || inv.largoPlazo !== false) largo += v; else medio += v;
  }
  return { largo, medio, total: largo + medio };
}

/** Resumen de los 4 bloques. valorCartera = {largo, medio} desde la cartera de ETF (opcional). */
export function resumen(c, valorCartera = { largo: 0, medio: 0 }) {
  const s = saldos(c);
  const man = valorInversionesManuales(c);
  const inversiones = man.total + (valorCartera.largo || 0) + (valorCartera.medio || 0);
  return { ...s, inversiones, inversionesLargo: man.largo + (valorCartera.largo || 0), inversionesMedio: man.medio + (valorCartera.medio || 0),
    total: s.corto + s.medio + s.largo + inversiones };
}

export function repartirInteres(importe, s) {
  const base = Math.max(0, s.largo) + Math.max(0, s.medio);
  const pesoLargo = base > 0 ? Math.max(0, s.largo) / base : 0.5;
  const largo = Math.round(importe * pesoLargo * 100) / 100;
  return { largo, medio: Math.round((importe - largo) * 100) / 100, pesoLargo };
}

export function avisoCorto(c) {
  const s = saldos(c);
  const { umbralCorto = 300, traspaso = 150 } = c.config || {};
  return s.corto >= umbralCorto ? { saldo: s.corto, umbral: umbralCorto, traspaso } : null;
}

export function evolucion(c) {
  const fechas = [...new Set(movimientos(c).map((m) => m.fecha))].sort();
  return fechas.map((f) => ({ fecha: f, ...saldos(c, f) }));
}

export function rentabilidadManual(c) {
  const activas = (c.inversionesManuales || []).filter((i) => !i.acabada);
  const fija = activas.filter((i) => i.tipo === "fija");
  const variable = activas.filter((i) => i.tipo !== "fija");
  const r = (l) => {
    const ini = l.reduce((s, i) => s + (Number(i.inicial) || 0), 0);
    const act = l.reduce((s, i) => s + (Number(i.actual ?? i.inicial) || 0) - (Number(i.comisiones) || 0), 0);
    return { inicial: ini, actual: act, beneficio: act - ini, pct: ini ? (act / ini - 1) * 100 : null };
  };
  return { fija: r(fija), variable: r(variable), total: r(activas) };
}
