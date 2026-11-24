// Tests de la lógica de la web (Node >= 20):  node --test tests/web/
import test from "node:test";
import assert from "node:assert/strict";
import { calcularPosiciones, eficaciaSenales, esApalancado, historico, indicePrecios, resumenCartera, tirCartera, xirr } from "../../web/js/finanzas.js";
import { avisoCorto, repartirInteres, resumen, saldos } from "../../web/js/diners.js";
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
