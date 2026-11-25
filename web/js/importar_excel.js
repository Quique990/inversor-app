// Importación y exportación de Excel (Diners.xlsx) con ExcelJS (vendor/, se carga solo al usarlo).
import { cargarScript, uid } from "./dom.js";
import { POR_DEFECTO } from "./store.js";
import { incrementoSemana, recalcularRepartos, saldos } from "./diners.js";

async function excel() {
  await cargarScript("vendor/exceljs.min.js");
  return window.ExcelJS;
}

// ------------------------------------------------------------------ lectura de celdas
function valor(celda) {
  const v = celda?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined && v.result !== null && typeof v.result !== "object") return v.result;
    if (v.result && v.result.error) return null;
    if ("formula" in v || "sharedFormula" in v) return evaluarSimple(v.formula || "");
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text) return v.text;
    return null;
  }
  return v;
}

/** Evalúa fórmulas "de calculadora" sin referencias (p. ej. =5.68+7.01). Devuelve null si no puede. */
export function evaluarSimple(formula) {
  const f = String(formula).replace(/^=/, "").replace(/\s/g, "");
  if (!/^[0-9.+\-*/()]+$/.test(f)) return null;
  // Analizador recursivo muy pequeño (sin eval)
  let i = 0;
  const num = () => { const m = /^\d+(\.\d+)?/.exec(f.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
  const factor = () => { if (f[i] === "-") { i++; return -factor(); } if (f[i] === "(") { i++; const v = expr(); i++; return v; } return num(); };
  const term = () => { let v = factor(); while (f[i] === "*" || f[i] === "/") { const o = f[i++]; const w = factor(); v = o === "*" ? v * w : v / w; } return v; };
  const expr = () => { let v = term(); while (f[i] === "+" || f[i] === "-") { const o = f[i++]; const w = term(); v = o === "+" ? v + w : v - w; } return v; };
  try { const v = expr(); return i === f.length ? v : null; } catch { return null; }
}

const n = (x) => (typeof x === "number" ? x : x === null || x === "" || x === " " ? null : Number(String(x).replace(",", ".")) || null);
const iso = (d) => (d instanceof Date ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10) : null);
const txt = (x) => (x === null || x === undefined ? "" : String(x).trim());
const norm = (s) => txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[:.]/g, "");

function buscarCabecera(ws, palabra, maxFilas = 30, maxCols = 20) {
  for (let r = 1; r <= Math.min(maxFilas, ws.rowCount); r++) {
    for (let c = 1; c <= maxCols; c++) {
      if (norm(valor(ws.getCell(r, c))) === norm(palabra)) return { fila: r, col: c };
    }
  }
  return null;
}

function columnas(ws, fila, desde, hasta) {
  const mapa = {};
  for (let c = desde; c <= hasta; c++) { const k = norm(valor(ws.getCell(fila, c))); if (k) mapa[k] = c; }
  return mapa;
}

const MESES = { gener: 1, enero: 1, febrer: 2, febrero: 2, marc: 3, marzo: 3, abril: 4, maig: 5, mayo: 5, juny: 6, junio: 6,
  juliol: 7, julio: 7, agost: 8, agosto: 8, setembre: 9, septiembre: 9, octubre: 10, novembre: 11, noviembre: 11, desembre: 12, decembre: 12, diciembre: 12 };

export function mesDesdeTexto(texto, anoPrevio) {
  const t = norm(texto);
  const m = Object.entries(MESES).find(([k]) => t.startsWith(k) || t.includes(k));
  if (!m) return null;
  const ano = Number((/(\d{4})/.exec(t) || [])[1]) || anoPrevio;
  return ano ? `${ano}-${String(m[1]).padStart(2, "0")}` : null;
}

const BLOQUE = { "corto plazo": "corto", "medio plazo": "medio", "largo plazo": "largo", extraordinari: "extraordinario", extraordinario: "extraordinario" };

// ------------------------------------------------------------------ importación
export async function importarDiners(arrayBuffer, cartera = null) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const c = POR_DEFECTO.contabilidad();
  const avisos = [];
  const revision = []; // observaciones sobre las fórmulas del Excel original
  const hoja = (nombre) => wb.worksheets.find((w) => norm(w.name) === norm(nombre));

  // Corto plazo (semanal)
  const cp = hoja("Corto Plazo");
  if (cp) {
    const cab = buscarCabecera(cp, "Semana");
    const col = columnas(cp, cab.fila, 1, 12);
    let primera = true;
    const sinFormula = [];
    for (let r = cab.fila + 1; r <= cp.rowCount; r++) {
      const f = valor(cp.getCell(r, col.semana));
      if (!(f instanceof Date)) continue;
      const inc = col["incremento semana"] ? cp.getCell(r, col["incremento semana"])?.value : null;
      if (!primera && col["incremento semana"] && !(inc && typeof inc === "object" && ("formula" in inc || "sharedFormula" in inc))) sinFormula.push(r);
      if (primera) {
        // Saldo inicial del corto plazo: número al principio de la fórmula de Total (=67.04-D2-E2)
        const tot = cp.getCell(r, col.total)?.value;
        const m = /^=?\s*(\d+(?:\.\d+)?)/.exec(tot?.formula || "");
        if (m) c.saldosIniciales.corto = parseFloat(m[1]);
        c.saldosIniciales.fecha = iso(f);
        primera = false;
      }
      const gastos = ["gasto 1", "gasto 2", "gasto 3"].map((k) => n(valor(cp.getCell(r, col[k])))).filter((x) => x);
      const semana = { id: uid(), fecha: iso(f), paga: n(valor(cp.getCell(r, col.paga))) || 0, extra: n(valor(cp.getCell(r, col.extra))) || 0,
        gastos: gastos.map((g) => ({ importe: g, concepto: "" })) };
      if (semana.paga || semana.extra || semana.gastos.length) c.semanas.push(semana);
    }
    if (sinFormula.length) revision.push(`Corto Plazo: la columna "Incremento Semana" no tenía fórmula en ${sinFormula.length} filas (de la ${sinFormula[0]} a la ${sinFormula.at(-1)}). Lo que apuntaras ahí no sumaba al Total. La app calcula todas las semanas igual: paga + extra − gastos.`);
    const tot1 = cp.getCell(cab.fila + 1, col.total)?.value?.formula || "";
    if (/^\s*\d/.test(tot1)) revision.push(`Corto Plazo: la primera fila del Total era "=${tot1}": restaba solo los gastos 1 y 2 e ignoraba paga, extra y gasto 3. La app toma ${c.saldosIniciales.corto} € como saldo inicial y trata esa semana como las demás.`);
  } else avisos.push("No se encontró la hoja 'Corto Plazo'.");

  // Transferencias
  const tr = hoja("Transferencies") || hoja("Transferencias");
  if (tr) {
    const cab = buscarCabecera(tr, "Fecha");
    const col = columnas(tr, cab.fila, 1, 10);
    for (let r = cab.fila + 1; r <= tr.rowCount; r++) {
      const f = valor(tr.getCell(r, col.fecha));
      const cant = n(valor(tr.getCell(r, col.cantitat || col.cantidad)));
      if (!(f instanceof Date) || !cant) continue;
      const de = BLOQUE[norm(valor(tr.getCell(r, col["transferit de"] || col.de)))] || "extraordinario";
      const a = BLOQUE[norm(valor(tr.getCell(r, col["transferit a"] || col.a)))] || "medio";
      c.transferencias.push({ id: uid(), fecha: iso(f), concepto: txt(valor(tr.getCell(r, col.concepte || col.concepto))), cantidad: cant, de, a });
    }
  }

  // General: saldos, intereses e instrucciones
  const g = hoja("General");
  let saldosExcel = null;
  if (g) {
    const sx = {};
    for (let r = 1; r <= 8; r++) {
      const k = BLOQUE[norm(valor(g.getCell(r, 1)))];
      const v = n(valor(g.getCell(r, 2)));
      if (k && v !== null) sx[k] = v;
    }
    if (Object.keys(sx).length) saldosExcel = sx;
    else revision.push("General: los saldos de Largo, Medio, Inversions, Corto y Total estaban vacíos (se escribían a mano). En la app se calculan solos a partir de los movimientos.");
    const cab = buscarCabecera(g, "Interesos") || buscarCabecera(g, "Intereses");
    if (cab) {
      let ano = null;
      const interesesBrutos = [];
      for (let r = cab.fila + 1; r <= cab.fila + 60; r++) {
        const imp = n(valor(g.getCell(r, cab.col)));
        const etiqueta = valor(g.getCell(r, cab.col + 1));
        if (imp === null && !etiqueta) continue;
        const mes = etiqueta instanceof Date ? iso(etiqueta).slice(0, 7) : mesDesdeTexto(etiqueta, ano);
        if (mes) ano = Number(mes.slice(0, 4));
        if (!imp || !mes) { if (imp) avisos.push(`Interés de ${imp} € sin mes reconocible ("${txt(etiqueta)}"): no importado.`); continue; }
        interesesBrutos.push({ mes, importe: imp, cuadrado: valor(g.getCell(r, cab.col + 6)) === true });
      }
      c._interesesPendientes = interesesBrutos;
      const fJ = g.getCell(cab.fila + 1, cab.col + 2)?.value?.formula || "";
      if (fJ.includes("$B$2")) revision.push(`General: el peso de cada mes de intereses era "=${fJ}" en todas las filas, es decir, el saldo de HOY. Cada vez que cambiaba un saldo se reescribían los repartos de meses pasados (y si los saldos están vacíos, da #¡DIV/0!). En la app cada reparto usa los saldos de su mes y queda fijado.`);
      revision.push("General: los intereses repartidos no se sumaban a los saldos de largo y medio plazo (si lo hubieras hecho con fórmula habría sido una referencia circular). En la app se suman solos.");
    }
    const instr = buscarCabecera(g, "Instruccions", 60, 30);
    if (instr) {
      for (let r = instr.fila + 1; r <= instr.fila + 25; r++) {
        const t = txt(valor(g.getCell(r, instr.col)));
        if (t) c.notas.push(t);
      }
    }
  }

  // Inversiones manuales
  const inv = hoja("Inversions") || hoja("Inversiones");
  if (inv) {
    let columnaEntera = false;
    inv.eachRow((row) => row.eachCell((cel) => { if (/SUM\([A-Z]:[A-Z]\)/i.test(cel.value?.formula || "")) columnaEntera = true; }));
    if (columnaEntera) revision.push("Inversions: la rentabilidad total usaba SUM(B:B) y SUM(C:C), columnas enteras, así que mezclaba las inversiones activas con las del historial. La app separa activas e historial.");
    const filasTabla = (fila, colIni, colFin) => {
      const col = columnas(inv, fila, colIni, colFin);
      const filas = [];
      for (let r = fila + 1; r <= fila + 40; r++) {
        const nombre = txt(valor(inv.getCell(r, colIni)));
        if (!nombre) { if (filas.length && !txt(valor(inv.getCell(r + 1, colIni)))) break; continue; }
        if (norm(nombre).startsWith("inversi") && r > fila + 1) break; // empieza otra tabla
        filas.push({ r, col, nombre });
      }
      return filas;
    };
    const rv = buscarCabecera(inv, "Inversió") || buscarCabecera(inv, "Inversion");
    if (rv) {
      for (const { r, col, nombre } of filasTabla(rv.fila, rv.col, rv.col + 5)) {
        c.inversionesManuales.push({ id: uid(), nombre, tipo: "variable", inicial: n(valor(inv.getCell(r, col["inversio inicial"]))) || 0,
          actual: n(valor(inv.getCell(r, col["valor actual"]))), largoPlazo: valor(inv.getCell(r, col["largo plazo"])) !== false, acabada: false });
      }
    }
    const rf = buscarCabecera(inv, "Invesió") || buscarCabecera(inv, "Inversió renta fija");
    if (rf) {
      for (const { r, col, nombre } of filasTabla(rf.fila, rf.col, rf.col + 6)) {
        const ini = n(valor(inv.getCell(r, col["inversio inical"] || col["inversio inicial"]))) || 0;
        const ben = n(valor(inv.getCell(r, col.benefici))) || 0;
        const cad = valor(inv.getCell(r, col.caduca));
        c.inversionesManuales.push({ id: uid(), nombre, tipo: "fija", inicial: ini, actual: ini + ben, beneficio: ben,
          comisiones: n(valor(inv.getCell(r, col.comisions))) || 0, caduca: cad instanceof Date ? iso(cad) : null,
          largoPlazo: true, acabada: valor(inv.getCell(r, col.acabada)) === true });
      }
    }
    // El historial es la segunda tabla "Inversió" de la columna A
    for (let r = (rv?.fila || 2) + 3; r <= Math.min(inv.rowCount, 80); r++) {
      if (norm(valor(inv.getCell(r, 1))) === "inversio" && r !== rv?.fila) {
        for (const { r: rr, col, nombre } of filasTabla(r, 1, 6)) {
          c.inversionesManuales.push({ id: uid(), nombre, tipo: "variable", inicial: n(valor(inv.getCell(rr, col["inversio inicial"]))) || 0,
            actual: n(valor(inv.getCell(rr, col["valor actual"]))), largoPlazo: valor(inv.getCell(rr, col["largo plazo"])) !== false, acabada: true });
        }
        break;
      }
    }
  }

  // Intereses: se registran y su reparto se fija con los saldos de cada momento (al final, cuando ya se conocen los saldos iniciales)
  for (const i of c._interesesPendientes || []) {
    c.intereses.push({ id: uid(), mes: i.mes, fecha: `${i.mes}-28`, importe: i.importe, reparto: { largo: 0, medio: 0, pesoLargo: 0.5 }, cuadrado: i.cuadrado });
  }
  delete c._interesesPendientes;
  recalcularRepartos(c, cartera);

  // Ajuste para que los saldos actuales coincidan con los del Excel (si estaban rellenos)
  if (saldosExcel) {
    const calc = saldos(c, null, cartera);
    for (const k of ["corto", "medio", "largo"]) {
      if (saldosExcel[k] !== undefined) c.saldosIniciales[k] = Math.round((c.saldosIniciales[k] + saldosExcel[k] - calc[k]) * 100) / 100;
    }
    recalcularRepartos(c, cartera);
    avisos.push("Saldos iniciales ajustados para cuadrar con los de la hoja General.");
  } else {
    avisos.push("La hoja General no tenía saldos: revisa los saldos iniciales de medio y largo plazo en Diners → Saldos iniciales y reglas (al guardarlos se recalcula el reparto de los intereses).");
  }

  return { contabilidad: c, resumen: { semanas: c.semanas.length, transferencias: c.transferencias.length, intereses: c.intereses.length,
    inversiones: c.inversionesManuales.length, notas: c.notas.length, saldoInicialCorto: c.saldosIniciales.corto }, avisos, revision };
}

// ------------------------------------------------------------------ exportación
export async function exportarExcel({ contabilidad: c, cartera, posiciones, resumenBloques }) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Inversor";
  const negrita = (ws) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; };
  const eur = '#,##0.00 "€"';

  const g = wb.addWorksheet("General");
  g.columns = [{ header: "Bloque", width: 22 }, { header: "Saldo", width: 14, style: { numFmt: eur } }];
  for (const [k, v] of [["Corto plazo", resumenBloques.corto], ["Medio plazo", resumenBloques.medio], ["Largo plazo", resumenBloques.largo],
    ["Inversiones", resumenBloques.inversiones], ["Total", resumenBloques.total]]) g.addRow([k, v]);
  negrita(g);

  const cp = wb.addWorksheet("Corto Plazo");
  cp.columns = [{ header: "Semana", width: 12, style: { numFmt: "dd/mm/yyyy" } }, { header: "Paga", width: 10, style: { numFmt: eur } },
    { header: "Extra", width: 10, style: { numFmt: eur } }, { header: "Gastos", width: 10, style: { numFmt: eur } },
    { header: "Conceptos", width: 30 }, { header: "Incremento", width: 12, style: { numFmt: eur } }];
  for (const s of [...c.semanas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    cp.addRow([new Date(s.fecha + "T00:00:00Z"), s.paga, s.extra, (s.gastos || []).reduce((a, x) => a + Number(x.importe || 0), 0),
      (s.gastos || []).map((x) => x.concepto).filter(Boolean).join(", "), incrementoSemana(s)]);
  }
  negrita(cp);

  const tr = wb.addWorksheet("Transferencias");
  tr.columns = [{ header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } }, { header: "Concepto", width: 26 },
    { header: "Cantidad", width: 12, style: { numFmt: eur } }, { header: "De", width: 16 }, { header: "A", width: 16 }];
  for (const t of c.transferencias) tr.addRow([new Date(t.fecha + "T00:00:00Z"), t.concepto, t.cantidad, t.de, t.a]);
  negrita(tr);

  const it = wb.addWorksheet("Intereses");
  it.columns = [{ header: "Mes", width: 10 }, { header: "Importe", width: 10, style: { numFmt: eur } },
    { header: "A largo", width: 10, style: { numFmt: eur } }, { header: "A medio", width: 10, style: { numFmt: eur } }, { header: "Cuadrado", width: 10 }];
  for (const i of c.intereses) it.addRow([i.mes, i.importe, i.reparto?.largo, i.reparto?.medio, i.cuadrado ? "Sí" : "No"]);
  negrita(it);

  const im = wb.addWorksheet("Inversiones manuales");
  im.columns = [{ header: "Nombre", width: 30 }, { header: "Tipo", width: 10 }, { header: "Inicial", width: 12, style: { numFmt: eur } },
    { header: "Actual", width: 12, style: { numFmt: eur } }, { header: "Largo plazo", width: 11 }, { header: "Acabada", width: 9 }];
  for (const i of c.inversionesManuales) im.addRow([i.nombre, i.tipo, i.inicial, i.actual, i.largoPlazo ? "Sí" : "No", i.acabada ? "Sí" : "No"]);
  negrita(im);

  const cr = wb.addWorksheet("Cartera");
  cr.columns = [{ header: "ISIN", width: 15 }, { header: "Nombre", width: 34 }, { header: "Participaciones", width: 14 },
    { header: "Coste", width: 12, style: { numFmt: eur } }, { header: "Valor", width: 12, style: { numFmt: eur } }, { header: "Ganancia", width: 12, style: { numFmt: eur } }];
  for (const p of Object.values(posiciones || {})) cr.addRow([p.isin, cartera.activos[p.isin]?.nombre || "", p.participaciones, p.costeVivo, p.valor, p.latente]);
  negrita(cr);

  const op = wb.addWorksheet("Operaciones");
  op.columns = [{ header: "Fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } }, { header: "Tipo", width: 10 }, { header: "ISIN", width: 15 },
    { header: "Nombre", width: 30 }, { header: "Participaciones", width: 14 }, { header: "Precio", width: 10 }, { header: "Importe", width: 12, style: { numFmt: eur } },
    { header: "Comisión", width: 10, style: { numFmt: eur } }, { header: "Origen", width: 10 }];
  for (const o of cartera.operaciones) op.addRow([new Date(o.fecha + "T00:00:00Z"), o.tipo, o.isin, cartera.activos[o.isin]?.nombre || "", o.participaciones, o.precio, o.importe, o.comision, o.origen]);
  negrita(op);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
