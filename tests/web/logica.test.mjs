// Tests de la lógica de la web (Node >= 20):  node --test tests/web/
import { prediccionCartera, textoCalidad } from "../../web/js/intradia.js";
import test from "node:test";
import assert from "node:assert/strict";
import { calcularPosiciones, eficaciaSenales, esApalancado, historico, indicePrecios, resumenCartera, tirCartera, xirr } from "../../web/js/finanzas.js";
import { avisoCorto, posiblesDuplicados, recalcularRepartos, repartirInteres, resumen, saldos, saldosNegativos } from "../../web/js/diners.js";
import { calcularPerfil } from "../../web/js/perfil.js";
import { recomendar } from "../../web/js/reco.js";
import { convertir, detectarColumnas, fusionar, parsearCSV } from "../../web/js/importar_tr.js";

const universo = {
  info: { VWCE: { isin: "IE00BK5BQT80", nombre: "Vanguard All-World", moneda: "EUR", rol: "renta_variable_global" },
          EUNH: { isin: "IE00B4WXJJ64", nombre: "Bonos euro", moneda: "EUR", rol: "renta_fija_euro" } },
  series: { VWCE: [["2025-01-03", 100], ["2025-06-06", 90], ["2026-01-02", 120]], EUNH: [["2025-01-03", 50], ["2026-01-02", 51]] },
  ultimo: { VWCE: ["2026-01-02", 120], EUNH: ["2026-01-02", 51] },
};
const ops = [
  { id: "1", fecha: "2025-01-03", tipo: "compra", isin: "IE00BK5BQT80", participaciones: 1, precio: 100, importe: 100, comision: 0, origen: "plan" },
  { id: "2", fecha: "2025-06-06", tipo: "compra", isin: "IE00BK5BQT80", participaciones: 2, precio: 90, importe: 180, comision: 1, origen: "extra" },
  { id: "3", fecha: "2025-07-01", tipo: "compra", isin: "IE00BK5BQT80", participaciones: 1, precio: 100, importe: 100, comision: 0, origen: "plan" },
  { id: "4", fecha: "2025-12-01", tipo: "venta", isin: "IE00BK5BQT80", participaciones: 1, precio: 110, importe: 110, comision: 1, origen: "manual" },
];

test("FIFO: la venta consume la compra más antigua y calcula la ganancia realizada", () => {
  const idx = indicePrecios(null, universo, {});
  const pos = calcularPosiciones(ops, idx)["IE00BK5BQT80"];
  assert.equal(pos.participaciones, 3);
  assert.ok(Math.abs(pos.realizado - (109 - 100)) < 1e-9);
  assert.equal(pos.lotes[0].restantes, 0);
  assert.equal(pos.valor, 360);
  const lote2 = pos.lotes[1];
  assert.ok(Math.abs(lote2.ganancia - (240 - 181)) < 1e-9);
  const r = resumenCartera({ x: pos });
  assert.ok(Math.abs(r.coste - 281) < 1e-9);
});

test("XIRR: 10 % anual exacto", () => {
  const r = xirr([{ fecha: "2024-01-01", importe: -1000 }, { fecha: "2025-01-01", importe: 1100 }]);
  assert.ok(Math.abs(r - 10) < 0.05, String(r));
  assert.equal(tirCartera(ops.slice(0, 1), 100, "2025-02-01"), null); // < 3 meses
});

test("Histórico: aportado acumulado y valor por fecha", () => {
  const idx = indicePrecios(null, universo, {});
  const h = historico(ops.slice(0, 2), idx, "2026-01-02");
  assert.equal(h.at(-1).aportado, 281);
  assert.equal(h.at(-1).valor, 360);
});

test("Eficacia de señales: la compra extra a 90 frente al plan a 100", () => {
  const e = eficaciaSenales(ops);
  assert.equal(e.n, 1);
  assert.ok(Math.abs(e.filas[0].ventajaPct - (100 / 90 - 1) * 100) < 1e-9);
});

test("Detecta productos apalancados del Excel", () => {
  assert.ok(esApalancado("Brent Crude x3"));
  assert.ok(esApalancado("Silve 3x Level USD"));
  assert.ok(!esApalancado("Vanguard FTSE All-World"));
});

test("Diners: saldos, reparto de intereses fijo y aviso de 300 €", () => {
  const c = { config: { umbralCorto: 300, traspaso: 150 }, saldosIniciales: { corto: 67.04, medio: 1000, largo: 3000 },
    semanas: [{ fecha: "2026-01-04", paga: 250, extra: 0, gastos: [{ importe: 10 }] }],
    transferencias: [{ fecha: "2026-01-10", cantidad: 60, de: "extraordinario", a: "medio" }], intereses: [], inversionesManuales: [] };
  const s = saldos(c);
  assert.equal(s.corto, 307.04);
  assert.equal(s.medio, 1060);
  const r = repartirInteres(10, s);
  assert.equal(r.largo + r.medio, 10);
  assert.ok(Math.abs(r.pesoLargo - 3000 / 4060) < 1e-9);
  assert.deepEqual(avisoCorto(c), { saldo: 307.04, umbral: 300, traspaso: 150 });
  c.inversionesManuales.push({ tipo: "fija", inicial: 100, actual: 104 }, { tipo: "variable", inicial: 50, actual: 40, largoPlazo: false });
  const b = resumen(c, { largo: 200, medio: 0 });
  assert.equal(b.inversiones, 344);
  assert.equal(b.inversionesMedio, 40);
});

test("Perfil: horizonte corto limita a moderado", () => {
  const p = calcularPerfil({ horizonte: 0, caida: 5, objetivo: 5, perdida_max: 5, colchon: 3, ingresos: 2, experiencia: 2, dependencia: 3 });
  assert.equal(p.perfil, "moderado");
  const q = calcularPerfil({ horizonte: 6, caida: 5, objetivo: 5, perdida_max: 5, colchon: 3, ingresos: 2, experiencia: 2, dependencia: 3 });
  assert.equal(q.perfil, "agresivo");
});

test("Recomendación: extra pequeño -> subir el plan en vez de orden manual", () => {
  const idx = indicePrecios(null, universo, {});
  const pos = calcularPosiciones(ops.slice(0, 1), idx);
  const universoPorIsin = Object.fromEntries(Object.entries(universo.info).map(([id, i]) => [i.isin, { id, ...i }]));
  const r = recomendar({
    mercado: { decision: { postura: "comprar_extra_escalonado", multiplicador_extra: 3, tramos: 3 } },
    perfil: { asignacion: { renta_variable_global: 60, renta_fija_euro: 40 }, huecos: {}, plan: { aportacionMensual: 10, maxExtraMes: 100, minOrdenManual: 100, comision: 1 } },
    pos, activos: {}, universoPorIsin, saldos: { corto: 100, medio: 500 } });
  assert.equal(r.extra.importe, 30);
  assert.equal(r.extra.porTramo, 10);
  assert.equal(r.extra.destino, "renta_fija_euro"); // RV ya al 100 % (> 60+5): va al hueco infraponderado
  assert.match(r.extra.metodo, /sube tu plan/);
});

test("CSV de Trade Republic: detecta columnas, ignora efectivo y no duplica", () => {
  const csv = [
    '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency"',
    '"2026-05-02T10:00:00Z","2026-05-02","DEFAULT","TRADING","SAVINGS_PLAN_EXECUTED","ETF","Vanguard FTSE All-World","IE00BK5BQT80","0.080000","125.00","-10.00","0","","EUR"',
    '"2026-05-15T12:00:00Z","2026-05-15","DEFAULT","TRADING","BUY","ETF","iShares Core S&P 500","IE00B5BMR087","0.200000","600.00","-121.00","-1.00","","EUR"',
    '"2024-05-15T12:15:59Z","2024-05-15","DEFAULT","CASH","CARD_ORDERING_FEE","","","","","","0.000000","-5.00","","EUR"',
  ].join("\n");
  const d = parsearCSV(csv);
  const mapa = detectarColumnas(d.cabecera);
  assert.equal(d.cabecera[mapa.isin], "symbol");
  assert.equal(d.cabecera[mapa.fecha], "date");
  const r = convertir(d, mapa);
  assert.equal(r.operaciones.length, 2);
  assert.equal(r.operaciones[0].origen, "plan");
  assert.equal(r.operaciones[1].importe, 120);
  assert.equal(r.operaciones[1].comision, 1);
  assert.equal(r.descartadas.length, 1);
  const f = fusionar(r.operaciones, r.operaciones);
  assert.equal(f.añadidas, 0);
});

test("Diners: las compras de ETF salen del bloque y no se cuentan dos veces", () => {
  const c = { config: {}, saldosIniciales: { fecha: "2026-01-01", corto: 0, medio: 200, largo: 1000 },
    semanas: [], transferencias: [], intereses: [], inversionesManuales: [] };
  const cartera = { activos: { IE00BK5BQT80: { nombre: "Vanguard FTSE All-World", bloque: "largo" }, IE00B579F325: { nombre: "Invesco Physical Gold", bloque: "medio" } },
    operaciones: [
      { fecha: "2025-12-15", tipo: "compra", isin: "IE00BK5BQT80", importe: 500, comision: 0 }, // anterior: ya en saldos iniciales
      { fecha: "2026-02-01", tipo: "compra", isin: "IE00BK5BQT80", importe: 99, comision: 1 },
      { fecha: "2026-03-01", tipo: "compra", isin: "IE00B579F325", importe: 50, comision: 1 },
      { fecha: "2026-04-01", tipo: "compra", isin: "IE00BK5BQT80", importe: 30, comision: 0, pagadoDesde: "fuera" },
      { fecha: "2026-05-01", tipo: "venta", isin: "IE00B579F325", importe: 20, comision: 1 },
    ] };
  const s = saldos(c, null, cartera);
  assert.equal(s.largo, 900);
  assert.equal(s.medio, 200 - 51 + 19);
  // Total: valor de la cartera + saldos, sin duplicar
  const b = resumen(c, { largo: 650, medio: 30 }, cartera);
  assert.equal(b.total, 900 + 168 + 680);
  c.config.comprasCartera = "no";
  assert.equal(saldos(c, null, cartera).largo, 1000);
});

test("Diners: inversión manual con origen, acabada, duplicados y saldo negativo", () => {
  const c = { config: {}, saldosIniciales: { fecha: "2026-01-01", corto: 0, medio: 0, largo: 100 }, semanas: [], transferencias: [], intereses: [],
    inversionesManuales: [{ nombre: "SP500", tipo: "variable", inicial: 152, actual: 173.04 },
      { nombre: "Bono", tipo: "fija", inicial: 50, actual: 52, comisiones: 1, fecha: "2026-02-01", pagadoDesde: "largo", acabada: true, fechaFin: "2026-06-01" }] };
  const cartera = { activos: { IE00B5BMR087: { nombre: "iShares Core S&P 500" } }, operaciones: [{ fecha: "2025-06-01", tipo: "compra", isin: "IE00B5BMR087", importe: 152 }] };
  assert.equal(saldos(c, "2026-03-01").largo, 50);
  assert.equal(saldos(c).largo, 101); // 100 − 50 + (52 − 1)
  const d = posiblesDuplicados(c, cartera);
  assert.equal(d.length, 1);
  assert.equal(d[0].inv.nombre, "SP500");
  c.inversionesManuales[0].enCartera = true;
  assert.equal(resumen(c).inversiones, 0);
  assert.equal(posiblesDuplicados(c, cartera).length, 0);
  c.saldosIniciales.largo = 10;
  c.inversionesManuales[1].acabada = false;
  assert.deepEqual(saldosNegativos(c, cartera), [{ bloque: "largo", saldo: -40 }]);
});

test("Diners: recalcular repartos usa los saldos de cada mes, en orden", () => {
  const c = { config: {}, saldosIniciales: { fecha: "2025-12-01", corto: 0, medio: 0, largo: 0 }, semanas: [], inversionesManuales: [],
    transferencias: [{ fecha: "2026-02-01", cantidad: 300, de: "extraordinario", a: "largo" }],
    intereses: [{ mes: "2026-03", fecha: "2026-03-28", importe: 10, reparto: { largo: 5, medio: 5 } }, { mes: "2026-01", fecha: "2026-01-28", importe: 2, reparto: { largo: 0, medio: 0 } }] };
  c.saldosIniciales.medio = 100;
  recalcularRepartos(c);
  const ene = c.intereses.find((i) => i.mes === "2026-01");
  const mar = c.intereses.find((i) => i.mes === "2026-03");
  assert.deepEqual([ene.reparto.largo, ene.reparto.medio], [0, 2]);
  assert.ok(Math.abs(mar.reparto.pesoLargo - 300 / 402) < 1e-9);
  assert.equal(saldos(c).medio + saldos(c).largo, 412);
});

test("Intradía: previsión de la cartera combina ETF y diversifica la banda", () => {
  const horas = ["07:30", "12:00", "23:00"];
  const tray = (v, s) => horas.map((hora, i) => ({ hora, esperado: v, inf: v * Math.exp(-1.2816 * s * i), sup: v * Math.exp(1.2816 * s * i) }));
  const intradia = { z: 1.2816, horas, fecha: "2026-11-25",
    correlaciones: { ids: ["A", "B"], matriz: [[1, 0], [0, 1]] },
    activos: {
      A: { id: "A", isin: "IE00BK5BQT80", ancla: { valor: 100 }, plan: tray(100, 0.01), prevision: tray(100, 0.01), actual: [{ hora: "07:30", valor: 100, tipo: "estimado" }, { hora: "12:00", valor: 101, tipo: "real" }], calidad: { dias: 10, mejora_pct: 5, cobertura_pct: 80 } },
      B: { id: "B", isin: "IE00B579F325", ancla: { valor: 50 }, plan: tray(50, 0.01), prevision: tray(50, 0.01), actual: [{ hora: "07:30", valor: 50, tipo: "estimado" }], calidad: { dias: 12, mejora_pct: -5, cobertura_pct: 70 } },
    } };
  const pos = { IE00BK5BQT80: { isin: "IE00BK5BQT80", participaciones: 1, valor: 101 }, IE00B579F325: { isin: "IE00B579F325", participaciones: 2, valor: 100 },
    XS0000000000: { isin: "XS0000000000", participaciones: 3, valor: 30 } };
  const r = prediccionCartera(intradia, pos);
  assert.equal(r.plan[0].esperado, 230);                       // 100 + 2·50 + 30 fijo
  assert.deepEqual(r.sinPrediccion, ["XS0000000000"]);
  assert.equal(r.actual.length, 1);                            // a las 12:00 falta el dato de B
  assert.equal(r.actual[0].tipo, "estimado");
  // Con correlación 0 la banda de la cartera es más estrecha que la suma de bandas
  const s = Math.log(r.plan[2].sup / 230) / 1.2816;
  assert.ok(s < (100 * 0.02 + 100 * 0.02) / 230);
  assert.ok(Math.abs(r.calidad.mejora_pct) < 1e-9);            // 5 % y −5 % con el mismo peso
  assert.equal(r.calidad.dias, 10);
  assert.match(textoCalidad({ dias: 0 }), /empieza a aprender/);
  assert.match(textoCalidad({ dias: 20, mejora_pct: 12, cobertura_pct: 78 }), /12 % menos/);
  assert.equal(prediccionCartera(intradia, {}), null);
});
