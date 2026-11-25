// Tests de la lógica de la web (Node >= 20):  node --test tests/web/
import { fusionarIntradia, prediccionCartera, textoCalidad } from "../../web/js/intradia.js";
import test from "node:test";
import { comprobar, crearVerificador, esPin, validarPin } from "../../web/js/acceso.js";
import assert from "node:assert/strict";
import { calcularPosiciones, eficaciaSenales, esApalancado, fuentePrecio, gananciaPeriodo, historico, indicePrecios, precioEUR, restarDias, resumenCartera, tirCartera, xirr } from "../../web/js/finanzas.js";
import { avisoCorto, listaGastos, lunesDe, marcarPaga, posiblesDuplicados, recalcularRepartos, repartirInteres, resumen, saldos, saldosNegativos, semanasPaga } from "../../web/js/diners.js";
import { calcularPerfil } from "../../web/js/perfil.js";
import { clasificarNombre, huecoDe, recomendar } from "../../web/js/reco.js";
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
  assert.equal(r.actual.length, 2);                            // a las 12:00 falta B: se usa su último valor
  assert.equal(r.actual[0].tipo, "estimado");
  assert.deepEqual(r.actual[1], { hora: "12:00", valor: 101 + 2 * 50 + 30, tipo: "estimado" });
  // Con correlación 0 la banda de la cartera es más estrecha que la suma de bandas
  const s = Math.log(r.plan[2].sup / 230) / 1.2816;
  assert.ok(s < (100 * 0.02 + 100 * 0.02) / 230);
  assert.ok(Math.abs(r.calidad.mejora_pct) < 1e-9);            // 5 % y −5 % con el mismo peso
  assert.equal(r.calidad.dias, 10);
  assert.match(textoCalidad({ dias: 0 }), /empieza a aprender/);
  assert.match(textoCalidad({ dias: 20, mejora_pct: 12, cobertura_pct: 78 }), /12 % menos/);
  assert.equal(prediccionCartera(intradia, {}), null);
});

test("Clasificación: oro, renta fija con vencimiento, índices y acciones sueltas", () => {
  assert.equal(clasificarNombre("WisdomTree Core Physical Gold"), "oro");
  assert.equal(clasificarNombre("Dez. 2030"), "renta_fija_euro");
  assert.equal(clasificarNombre("iShares iBonds Dec 2029 Term EUR Corp UCITS ETF"), "renta_fija_euro");
  assert.equal(clasificarNombre("EUR Overnight Rate Swap"), "monetario");
  assert.equal(clasificarNombre("Amundi Euro Stoxx 50 (Acc)"), "renta_variable_global");
  assert.equal(clasificarNombre("Una empresa cualquiera"), "otros");
  assert.equal(clasificarNombre("Leverage Shares 3x Gold"), "otros");
  // El universo y la elección manual mandan sobre el nombre
  const uni = { IE00B4WXJJ64: { rol: "renta_fija_euro" } };
  assert.equal(huecoDe("IE00B4WXJJ64", { IE00B4WXJJ64: { nombre: "Cualquier cosa" } }, uni), "renta_fija_euro");
  assert.equal(huecoDe("XS0000000001", { XS0000000001: { nombre: "Dez. 2030", hueco: "monetario" } }, {}), "monetario");
});

test("Precio actual: el último dato intradía manda sobre el cierre de días anteriores", () => {
  const intra = { fecha: "2026-01-05", activos: { VWCE: { isin: "IE00BK5BQT80", actual: [{ hora: "09:00", valor: 118, tipo: "real" }, { hora: "10:00", valor: 115, tipo: "real" }] } } };
  const idx = indicePrecios(null, universo, {}, intra);
  assert.equal(precioEUR(idx, "IE00BK5BQT80"), 115);
  assert.equal(precioEUR(idx, "IE00BK5BQT80", "2025-07-01"), 90);           // el histórico no cambia
  assert.deepEqual(fuentePrecio(idx, "IE00BK5BQT80"), { fecha: "2026-01-05", hora: "10:00", tipo: "real" });
  // Un precio manual más reciente gana
  const idx2 = indicePrecios(null, universo, { IE00BK5BQT80: { precioManual: { valor: 130, fecha: "2026-01-06" } } }, intra);
  assert.equal(precioEUR(idx2, "IE00BK5BQT80"), 130);
  // Un intradía antiguo no pisa un cierre más nuevo
  const idx3 = indicePrecios(null, universo, {}, { ...intra, fecha: "2025-12-01" });
  assert.equal(precioEUR(idx3, "IE00BK5BQT80"), 120);
  assert.equal(fuentePrecio(idx3, "IE00BK5BQT80").tipo, "cierre");
  // Cotización de Londres en peniques: /100 y de libras a euros
  const precios = { series: { XS0000000001: { moneda: "GBp", puntos: [["2026-01-02", 25000]], ultimo: ["2026-01-02", 25000] },
    __EURGBP: { puntos: [["2026-01-01", 0.8]] } } };
  assert.equal(precioEUR(indicePrecios(precios, universo, {}), "XS0000000001"), 312.5);
});

test("Intradía: fusiona la previsión pública con la privada del mismo día", () => {
  const pub = { fecha: "2026-11-25", horas: ["07:30"], activos: { A: { id: "A", isin: "IE00BK5BQT80" } }, correlaciones: { ids: ["A"], matriz: [[1]] } };
  const priv = { fecha: "2026-11-25", generado: "x", activos: { XS0000000001: { id: "XS0000000001", isin: "XS0000000001" }, XS0000000002: { id: "XS0000000002", isin: "XS0000000002" } },
    correlaciones: { ids: ["XS0000000001", "XS0000000002"], matriz: [[1, 0.3], [0.3, 1]] } };
  const f = fusionarIntradia(pub, priv);
  assert.deepEqual(Object.keys(f.activos), ["A", "XS0000000001", "XS0000000002"]);
  assert.equal(f.activos.XS0000000001.privado, true);
  assert.equal(f.correlaciones.matriz[1][2], 0.3);
  assert.equal(f.correlaciones.matriz[0][1], null);                    // pública-privada: desconocida
  assert.equal(fusionarIntradia(pub, { ...priv, fecha: "2026-11-24" }), pub);  // la privada es de otro día
  // Si el privado también calcula un ETF público, gana el privado
  const conDuplicado = fusionarIntradia(pub, { ...priv, activos: { ...priv.activos, IE00BK5BQT80: { id: "IE00BK5BQT80", isin: "IE00BK5BQT80" } } });
  assert.ok(!conDuplicado.activos.A && conDuplicado.activos.IE00BK5BQT80.privado);
  assert.equal(fusionarIntradia(null, priv), priv);
  assert.equal(fusionarIntradia(pub, null), pub);
  // La previsión de la cartera usa 0,6 cuando no conoce la correlación (sin romper)
  const tray = [{ hora: "07:30", esperado: 10, inf: 9, sup: 11 }];
  f.activos.A = { ...f.activos.A, plan: tray, prevision: tray, actual: [] };
  f.activos.XS0000000001 = { ...f.activos.XS0000000001, plan: tray, prevision: tray, actual: [] };
  const r = prediccionCartera(f, { IE00BK5BQT80: { isin: "IE00BK5BQT80", participaciones: 1 }, XS0000000001: { isin: "XS0000000001", participaciones: 1 } });
  assert.equal(r.plan[0].esperado, 20);
  assert.ok(r.plan[0].sup > 20 && r.plan[0].sup < 22);
});

test("Diners: paga semanal con un check y gastos que sacan dinero del bloque", () => {
  const c = { saldosIniciales: { fecha: null, corto: 0, medio: 100, largo: 0 }, config: { pagaSemanal: 20 }, semanas: [], transferencias: [], intereses: [], inversionesManuales: [], gastos: [] };
  let n = 0;
  const id = () => `id${n++}`;
  assert.equal(lunesDe("2026-11-25"), "2026-11-23");                   // miércoles -> lunes
  assert.equal(lunesDe("2026-11-23"), "2026-11-23");
  assert.equal(lunesDe("2026-11-29"), "2026-11-23");                   // domingo -> lunes anterior
  marcarPaga(c, "2026-11-16", true, 20, id);
  marcarPaga(c, "2026-11-23", true, 20, id);
  let semanas = semanasPaga(c, "2026-11-25", 3);
  assert.deepEqual(semanas.map((x) => x.cobrada), [true, true, false]);
  assert.equal(saldos(c).corto, 40);
  // Una semana con gastos no se borra al desmarcar la paga
  c.semanas.find((s) => s.fecha === "2026-11-16").gastos.push({ importe: 5, concepto: "cine" });
  marcarPaga(c, "2026-11-16", false, 20, id);
  marcarPaga(c, "2026-11-23", false, 20, id);
  assert.equal(c.semanas.length, 1);
  assert.equal(saldos(c).corto, -5);
  // Gasto suelto de medio plazo
  c.gastos.push({ id: "g", fecha: "2026-11-24", importe: 30, concepto: "regalo", bloque: "medio" });
  assert.equal(saldos(c).medio, 70);
  assert.deepEqual(listaGastos(c).map((g) => [g.importe, g.bloque]), [[30, "medio"], [5, "corto"]]);
  // Una semana del Excel con otra fecha dentro de la misma semana se reconoce
  c.semanas.push({ id: "x", fecha: "2026-11-27", paga: 15, extra: 0, gastos: [] });
  assert.equal(semanasPaga(c, "2026-11-25", 1)[0].importe, 15);
});

test("Diners: los saldos puestos a mano ya incluyen lo anterior a su fecha", () => {
  const cartera = { activos: { A: { bloque: "largo" } }, operaciones: [
    { fecha: "2026-10-01", tipo: "compra", isin: "A", importe: 50, comision: 0 }, { fecha: "2026-12-01", tipo: "compra", isin: "A", importe: 10, comision: 0 }] };
  const c = { saldosIniciales: { fecha: "2026-11-25", incluyeAnteriores: true, corto: 100, medio: 0, largo: 500 }, config: {},
    semanas: [{ id: "a", fecha: "2026-11-02", paga: 20, extra: 0, gastos: [] }, { id: "b", fecha: "2026-11-30", paga: 20, extra: 0, gastos: [] }],
    transferencias: [], intereses: [], inversionesManuales: [], gastos: [] };
  const s = saldos(c, null, cartera);
  assert.equal(s.corto, 120);   // solo la semana posterior
  assert.equal(s.largo, 490);   // solo la compra posterior
  // La paga de la semana en curso cuenta aunque los saldos se pusieran a mitad de semana; las semanas anteriores no se ofrecen
  marcarPaga(c, "2026-11-23", true, 25, () => "p");
  assert.equal(c.semanas.find((x) => x.id === "p").fecha, "2026-11-25");
  assert.equal(saldos(c, null, cartera).corto, 145);
  assert.deepEqual(semanasPaga(c, "2026-12-02", 8).map((x) => x.lunes), ["2026-11-30", "2026-11-23"]);
  c.semanas = c.semanas.filter((x) => x.id !== "p");
  // Sin la marca (p. ej. importado del Excel), las semanas se suman todas como antes
  delete c.saldosIniciales.incluyeAnteriores;
  assert.equal(saldos(c, null, cartera).corto, 140);
});

test("Evolución por periodos: diario con los precios recientes y ganancia sin contar aportaciones", () => {
  const precios = { series: { XS0000000001: { moneda: "EUR", puntos: [["2026-10-02", 100], ["2026-10-09", 104]],
    diario: [["2026-10-12", 105], ["2026-10-13", 103], ["2026-10-14", 108]], ultimo: ["2026-10-14", 108] } } };
  const idx = indicePrecios(precios, null, {});
  assert.equal(precioEUR(idx, "XS0000000001", "2026-10-13"), 103);          // el diario completa al semanal
  const ops = [{ fecha: "2026-10-01", tipo: "compra", isin: "XS0000000001", participaciones: 1, importe: 100, comision: 0 },
    { fecha: "2026-10-13", tipo: "compra", isin: "XS0000000001", participaciones: 1, importe: 103, comision: 0 }];
  const h = historico(ops, idx, "2026-10-14", { desde: restarDias("2026-10-14", 7), pasoDias: 1 });
  assert.equal(h[0].fecha, "2026-10-07");
  assert.ok(!h.some((p) => ["2026-10-10", "2026-10-11"].includes(p.fecha)));   // sin fin de semana
  assert.deepEqual(h.slice(-3).map((p) => [p.fecha, p.valor, p.aportado]), [["2026-10-12", 105, 100], ["2026-10-13", 206, 203], ["2026-10-14", 216, 203]]);
  // Del 7 (valor 100) al 14 (216) con 103 € metidos: ganancia 13 €
  const g = gananciaPeriodo(h);
  assert.ok(Math.abs(g.ganancia - 13) < 1e-9);
  assert.ok(Math.abs(g.pct - 13 / 203 * 100) < 1e-9);
});

test("PIN: el verificador comprueba sin guardar el PIN y solo admite 4 cifras", async () => {
  const v = await crearVerificador("4821", 1000); // pocas iteraciones para que el test sea rápido
  assert.equal(v.algoritmo, "PBKDF2-SHA256");
  assert.ok(esPin(v));
  assert.ok(!JSON.stringify(v).includes("4821"));
  assert.equal(await comprobar("4821", v), true);
  assert.equal(await comprobar("4822", v), false);
  assert.equal(await comprobar("4821", null), false);
  assert.notEqual((await crearVerificador("4821", 1000)).huella, v.huella);   // sal distinta cada vez
  assert.ok(!esPin({ sal: "x", huella: "y" }));                                // verificador antiguo (contraseña)
  assert.match(validarPin("123"), /4 cifras/);
  assert.match(validarPin("12a4"), /4 cifras/);
  assert.match(validarPin("12345"), /4 cifras/);
  assert.match(validarPin("1234", "1235"), /no coinciden/);
  assert.equal(validarPin("1234", "1234"), null);
});
