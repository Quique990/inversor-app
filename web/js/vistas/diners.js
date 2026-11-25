import { abrirModal, campo, cerrarModal, claseSigno, descargar, eur, fecha, h, hoyISO, parseNumero, pct, tarjeta, toast, uid } from "../dom.js";
import { avisoCorto, BLOQUES, evolucion, incrementoSemana, listaGastos, marcarPaga, posiblesDuplicados, recalcularRepartos, rentabilidadManual, repartirInteres, saldos, saldosNegativos, semanasPaga } from "../diners.js";
import { donut, lineas } from "../graficas.js";
import { exportarExcel, importarDiners } from "../importar_excel.js";

export function render(ctx) {
  const { S, calc } = ctx;
  const c = S.privado.contabilidad;
  const b = calc.bloques;
  const cartera = S.privado.cartera;
  const nodos = [];

  const a300 = avisoCorto(c, cartera);
  const vacia = !c.semanas.length && !c.transferencias.length && !c.intereses.length && !c.inversionesManuales.length && !(c.gastos || []).length
    && !["corto", "medio", "largo"].some((k) => Number(c.saldosIniciales?.[k]));
  if (vacia) {
    nodos.push(tarjeta("Empieza aquí",
      h("p", {}, "Pon el dinero que tienes hoy en cada bloque (lo que dice tu Excel). A partir de ahí solo tendrás que marcar la paga de cada semana y apuntar los gastos."),
      h("div", { class: "fila" }, h("button", { onclick: () => modalInicial(ctx) }, "Poner mi dinero a mano"),
        h("button", { class: "sec", onclick: () => modalImportarExcel(ctx) }, "Importar Diners.xlsx"))));
  }
  nodos.push(tarjeta(null,
    h("div", { class: "rejilla" }, kpi("Corto plazo", eur(b.corto)), kpi("Medio plazo", eur(b.medio)), kpi("Largo plazo", eur(b.largo)),
      kpi("Inversiones", eur(b.inversiones)), kpi("Total", eur(b.total))),
    a300 ? h("div", { class: "aviso" }, `Corto plazo en ${eur(a300.saldo)}: pasa ${eur(a300.traspaso)} a medio plazo.`, " ",
      h("button", { class: "mini", onclick: () => modalTransferencia(ctx, { cantidad: a300.traspaso, de: "corto", a: "medio", concepto: "Regla de los 300 €" }) }, "Registrar")) : null,
    h("div", { class: "fila", style: { marginTop: "10px" } },
      h("button", { onclick: () => modalGasto(ctx) }, "+ Gasto"),
      h("button", { class: "sec", onclick: () => modalSemana(ctx) }, "+ Semana"),
      h("button", { class: "sec", onclick: () => modalTransferencia(ctx) }, "+ Transferencia"),
      h("button", { class: "sec", onclick: () => modalInteres(ctx) }, "+ Intereses"))));

  nodos.push(tarjetaPaga(ctx));
  nodos.push(tarjetaGastos(ctx));

  const negativos = saldosNegativos(c, cartera);
  const dups = posiblesDuplicados(c, cartera);
  if (negativos.length || dups.length) {
    nodos.push(tarjeta("Revisa esto",
      negativos.map((x) => h("div", { class: "aviso" }, `${BLOQUES[x.bloque]} en ${eur(x.saldo)}. Puede que alguna compra se pagara con dinero que no está en Diners: márcala como “Fuera de Diners” en Cartera, o corrige los saldos iniciales.`)),
      dups.map(({ inv, nombreActivo }) => h("div", { class: "aviso" }, `“${inv.nombre}” (inversión manual) parece el mismo activo que “${nombreActivo}” de tu Cartera. Si es el mismo, se está sumando dos veces. `,
        h("button", { class: "mini", onclick: async () => { inv.enCartera = true; await persistir(ctx, `Inversión ${inv.nombre}: ya está en Cartera`); } }, "Es el mismo"), " ",
        h("button", { class: "mini sec", onclick: async () => { inv.distintaDeCartera = true; await persistir(ctx, `Inversión ${inv.nombre}: distinta de Cartera`); } }, "Son distintos")))));
  }

  if (b.total > 0) {
    nodos.push(tarjeta("Clasificación del dinero", donut(["Corto", "Medio", "Largo", "Inversiones"], [b.corto, b.medio, b.largo, b.inversiones].map((x) => Math.max(0, x)))));
  }
  const ev = evolucion(c, cartera);
  if (ev.length > 1) {
    nodos.push(tarjeta("Variación del dinero", lineas(ev.map((p) => p.fecha), [
      { nombre: "Corto", valores: ev.map((p) => p.corto), escalonada: true }, { nombre: "Medio", valores: ev.map((p) => p.medio), escalonada: true },
      { nombre: "Largo", valores: ev.map((p) => p.largo), escalonada: true },
    ], { formatoY: (v) => `${v} €` })));
  }

  // Semanas
  const semanas = [...c.semanas].sort((x, y) => y.fecha.localeCompare(x.fecha));
  nodos.push(tarjeta("Corto plazo (semanas)",
    semanas.length ? h("div", { class: "tabla-scroll" }, h("table", {},
      h("tr", {}, h("th", {}, "Semana"), h("th", { class: "num" }, "Entra"), h("th", { class: "num" }, "Gastos"), h("th", { class: "num" }, "Saldo")),
      semanas.slice(0, 16).map((s) => h("tr", { onclick: () => modalSemana(ctx, s), style: { cursor: "pointer" } },
        h("td", {}, fecha(s.fecha), (s.gastos || []).some((g) => g.concepto) ? h("div", { class: "suave pequeno" }, s.gastos.map((g) => g.concepto).filter(Boolean).join(", ")) : null),
        h("td", { class: "num" }, eur((Number(s.paga) || 0) + (Number(s.extra) || 0))),
        h("td", { class: "num neg" }, eur((s.gastos || []).reduce((a, g) => a + Number(g.importe || 0), 0))),
        h("td", { class: "num" }, eur(saldos(c, s.fecha, cartera).corto))))))
      : h("p", { class: "suave" }, "Sin semanas registradas.")));

  // Transferencias
  nodos.push(tarjeta("Transferencias",
    c.transferencias.length ? h("table", {}, [...c.transferencias].sort((x, y) => y.fecha.localeCompare(x.fecha)).slice(0, 20).map((t) =>
      h("tr", { onclick: () => modalTransferencia(ctx, t), style: { cursor: "pointer" } }, h("td", {}, fecha(t.fecha), h("div", { class: "suave pequeno" }, t.concepto || "")),
        h("td", {}, `${BLOQUES[t.de] || t.de} → ${BLOQUES[t.a] || t.a}`), h("td", { class: "num" }, eur(t.cantidad)))))
      : h("p", { class: "suave" }, "Los cobros extraordinarios van aquí (de “Extraordinario” a un bloque).")));

  // Intereses
  nodos.push(tarjeta("Intereses",
    c.intereses.length ? h("table", {},
      h("tr", {}, h("th", {}, "Mes"), h("th", { class: "num" }, "Importe"), h("th", { class: "num" }, "Largo"), h("th", { class: "num" }, "Medio"), h("th", {}, "Cuadrado")),
      [...c.intereses].sort((x, y) => y.mes.localeCompare(x.mes)).map((i) => h("tr", { onclick: () => modalInteres(ctx, i), style: { cursor: "pointer" } },
        h("td", {}, i.mes), h("td", { class: "num" }, eur(i.importe)), h("td", { class: "num" }, eur(i.reparto?.largo)), h("td", { class: "num" }, eur(i.reparto?.medio)),
        h("td", {}, i.cuadrado ? "✓" : "—"))))
      : h("p", { class: "suave" }, "Los intereses se reparten entre largo y medio plazo según sus saldos en ese momento, y el reparto queda fijado.")));

  // Inversiones manuales
  const rm = rentabilidadManual(c);
  nodos.push(tarjeta("Inversiones fuera de la cartera de ETF",
    h("p", { class: "suave pequeno" }, "Inversiones que gestionas a mano (renta fija, acciones sueltas…). Las compras de ETF se llevan en la pestaña Cartera y se suman solas al bloque de inversiones."),
    c.inversionesManuales.length ? h("div", { class: "tabla-scroll" }, h("table", {},
      h("tr", {}, h("th", {}, "Inversión"), h("th", { class: "num" }, "Inicial"), h("th", { class: "num" }, "Actual"), h("th", { class: "num" }, "Rent.")),
      c.inversionesManuales.map((i) => {
        const r = i.inicial ? ((Number(i.actual ?? i.inicial) - (Number(i.comisiones) || 0)) / i.inicial - 1) * 100 : null;
        return h("tr", { onclick: () => modalInversion(ctx, i), style: { cursor: "pointer", opacity: i.acabada || i.enCartera ? 0.55 : 1 } },
          h("td", {}, i.nombre, h("div", { class: "suave pequeno" }, `${i.tipo === "fija" ? "Renta fija" : "Renta variable"} · ${i.largoPlazo !== false ? "largo" : "medio"} plazo${i.acabada ? " · acabada" : ""}${i.enCartera ? " · ya en Cartera (no suma)" : ""}`)),
          h("td", { class: "num" }, eur(i.inicial)), h("td", { class: "num" }, eur(i.actual)), h("td", { class: `num ${claseSigno(r)}` }, pct(r)));
      })))
      : null,
    h("p", { class: "pequeno" }, `Renta fija: ${eur(rm.fija.beneficio)} (${pct(rm.fija.pct)}) · Renta variable: ${eur(rm.variable.beneficio)} (${pct(rm.variable.pct)})`,
      rm.historial.inicial ? ` · Historial (acabadas): ${eur(rm.historial.beneficio)} (${pct(rm.historial.pct)})` : ""),
    h("button", { class: "sec", onclick: () => modalInversion(ctx) }, "+ Inversión manual")));

  if (c.notas?.length) nodos.push(tarjeta("Tus instrucciones (del Excel)", h("ul", { class: "pequeno" }, c.notas.map((n) => h("li", {}, n)))));

  nodos.push(tarjeta("Excel y ajustes",
    h("div", { class: "fila" },
      h("button", { class: "sec", onclick: () => modalInicial(ctx) }, "Poner mi dinero a mano"),
      h("button", { class: "sec", onclick: () => modalImportarExcel(ctx) }, "Importar Diners.xlsx"),
      h("button", { class: "sec", onclick: async () => {
        const blob = await exportarExcel({ contabilidad: c, cartera: S.privado.cartera, posiciones: calc.pos, resumenBloques: b });
        descargar(`Diners-${hoyISO()}.xlsx`, blob);
      } }, "Exportar a Excel"),
      h("button", { class: "sec", onclick: () => modalAjustesDiners(ctx) }, "Saldos iniciales y reglas"))));
  return nodos;
}

function kpi(e, v) { return h("div", { class: "kpi" }, h("div", { class: "eti" }, e), h("div", { class: "val" }, v)); }
const botones = (guardarFn, borrarFn) => h("div", { class: "fila", style: { marginTop: "12px" } },
  h("button", { onclick: guardarFn }, "Guardar"), borrarFn ? h("button", { class: "peligro", onclick: borrarFn }, "Borrar") : null,
  h("button", { class: "sec", onclick: cerrarModal }, "Cancelar"));

async function persistir(ctx, msg) { await ctx.guardar("contabilidad", msg); cerrarModal(); ctx.refrescar(); }

// ------------------------------------------------------------------ paga semanal
function tarjetaPaga(ctx) {
  const c = ctx.S.privado.contabilidad;
  const importe = h("input", { inputmode: "decimal", value: c.config.pagaSemanal ?? "", placeholder: "€ por semana", style: { maxWidth: "130px" } });
  const guardarImporte = async () => {
    const v = parseNumero(importe.value);
    if (!(v > 0)) return toast("Escribe cuánto es la paga");
    c.config = { ...c.config, pagaSemanal: v };
    await persistir(ctx, `Paga semanal: ${v} €`);
  };
  const filas = semanasPaga(c, hoyISO(), 8).map((x) => {
    const check = h("input", { type: "checkbox", checked: x.cobrada, disabled: !(c.config.pagaSemanal > 0) && !x.cobrada });
    check.addEventListener("change", async () => {
      check.disabled = true;
      marcarPaga(c, x.lunes, check.checked, c.config.pagaSemanal, uid);
      await persistir(ctx, check.checked ? `Paga de la semana del ${x.lunes}: ${c.config.pagaSemanal} €` : `Quitar la paga de la semana del ${x.lunes}`);
    });
    return h("label", { class: "opcion" }, check, `Semana del ${fecha(x.lunes)}`, x.cobrada ? h("span", { class: "suave" }, ` · ${eur(x.importe)}`) : null);
  });
  return tarjeta("Paga",
    h("div", { class: "fila", style: { alignItems: "flex-end" } }, campo("Paga semanal (€)", importe), h("button", { class: "mini sec", onclick: guardarImporte }, "Guardar")),
    c.config.pagaSemanal > 0 ? h("p", { class: "suave pequeno" }, "Marca las semanas en que te han dado la paga: se suma al corto plazo.")
      : h("p", { class: "suave pequeno" }, "Primero escribe cuánto es tu paga y pulsa Guardar."),
    h("div", {}, filas));
}

// ------------------------------------------------------------------ gastos
function tarjetaGastos(ctx) {
  const c = ctx.S.privado.contabilidad;
  const l = listaGastos(c).slice(0, 12);
  return tarjeta("Gastos",
    l.length ? h("table", {}, l.map((g) => h("tr", { style: { cursor: "pointer" }, onclick: () => (g.suelto ? modalGasto(ctx, g.suelto) : modalSemana(ctx, g.semana)) },
      h("td", {}, fecha(g.fecha), h("div", { class: "suave pequeno" }, `${g.concepto || "Gasto"} · ${BLOQUES[g.bloque].toLowerCase()}`)),
      h("td", { class: "num neg" }, eur(-g.importe)))))
      : h("p", { class: "suave" }, "Sin gastos todavía."),
    h("button", { onclick: () => modalGasto(ctx) }, "+ Gasto"));
}

function modalGasto(ctx, g = null) {
  const c = ctx.S.privado.contabilidad;
  const fechaI = h("input", { type: "date", value: g?.fecha || hoyISO() });
  const importe = h("input", { inputmode: "decimal", value: g?.importe ?? "", placeholder: "€" });
  const concepto = h("input", { value: g?.concepto ?? "", placeholder: "Opcional" });
  const bloque = h("select", {}, ["corto", "medio", "largo"].map((k) => h("option", { value: k, selected: (g?.bloque || "corto") === k }, BLOQUES[k])));
  abrirModal(h("h2", {}, g ? "Editar gasto" : "Gasto"), h("p", { class: "suave pequeno" }, "El dinero sale del bloque que elijas y desaparece de la cuenta."),
    h("div", { class: "form2" }, campo("Fecha", fechaI), campo("Importe (€)", importe)), campo("Concepto", concepto), campo("Sale de", bloque),
    botones(async () => {
      const n = { id: g?.id || uid(), fecha: fechaI.value || hoyISO(), importe: parseNumero(importe.value) || 0, concepto: concepto.value.trim(), bloque: bloque.value };
      if (!(n.importe > 0)) return toast("Escribe el importe");
      c.gastos = (c.gastos || []).filter((x) => x.id !== n.id).concat(n);
      await persistir(ctx, `Gasto ${n.fecha}: ${n.importe.toFixed(2)} €${n.concepto ? ` (${n.concepto})` : ""}`);
    }, g ? async () => { c.gastos = c.gastos.filter((x) => x.id !== g.id); await persistir(ctx, "Borrar gasto"); } : null));
}

// ------------------------------------------------------------------ dinero inicial a mano
function modalInicial(ctx) {
  const c = ctx.S.privado.contabilidad;
  const ini = c.saldosIniciales || {};
  const f = h("input", { type: "date", value: ini.incluyeAnteriores && ini.fecha ? ini.fecha : hoyISO() });
  const campos = Object.fromEntries(["corto", "medio", "largo"].map((k) => [k, h("input", { inputmode: "decimal", value: Number(ini[k]) || "", placeholder: "0" })]));
  const lista = h("div");
  const filaInv = () => {
    const nombre = h("input", { placeholder: "Nombre (p. ej. Letras del Tesoro)" });
    const valor = h("input", { inputmode: "decimal", placeholder: "Valor hoy (€)" });
    const tipo = h("select", {}, h("option", { value: "variable" }, "Renta variable"), h("option", { value: "fija" }, "Renta fija"));
    const plazo = h("select", {}, h("option", { value: "largo" }, "Largo plazo"), h("option", { value: "medio" }, "Medio plazo"));
    const fila = h("div", { class: "form2", style: { marginBottom: "8px" } }, nombre, valor, tipo, plazo);
    fila._leer = () => ({ nombre: nombre.value.trim(), valor: parseNumero(valor.value), tipo: tipo.value, largo: tipo.value === "fija" || plazo.value === "largo" });
    lista.append(fila);
  };
  const previos = c.semanas.length + c.transferencias.length + c.intereses.length + (c.gastos || []).length;
  abrirModal(h("h2", {}, "Poner mi dinero a mano"),
    h("p", { class: "suave pequeno" }, "Escribe cuánto tienes HOY en cada bloque (en tu Excel, la hoja General). No hace falta importar nada."),
    campo("Fecha de estos saldos", f),
    h("div", { class: "form2" }, campo("Corto plazo (€)", campos.corto), campo("Medio plazo (€)", campos.medio), campo("Largo plazo (€)", campos.largo)),
    h("h3", {}, "Inversiones que NO están en Cartera (opcional)"),
    h("p", { class: "suave pequeno" }, "Los ETF de Trade Republic van en la pestaña Cartera y se suman solos: no los pongas aquí."),
    lista, h("button", { class: "mini sec", onclick: filaInv }, "+ inversión"),
    h("p", { class: "suave pequeno" }, "Todo lo anterior a esa fecha (semanas, compras de Cartera…) se da por incluido en estos saldos, así que no se cuenta dos veces.",
      previos ? ` Ya tienes ${previos} movimientos apuntados: los anteriores a la fecha dejarán de sumarse (no se borran).` : ""),
    botones(async () => {
      const fechaSaldos = f.value || hoyISO();
      c.saldosIniciales = { fecha: fechaSaldos, incluyeAnteriores: true,
        corto: parseNumero(campos.corto.value) || 0, medio: parseNumero(campos.medio.value) || 0, largo: parseNumero(campos.largo.value) || 0 };
      const nuevas = [...lista.children].map((x) => x._leer()).filter((x) => x.valor > 0);
      for (const x of nuevas) {
        c.inversionesManuales.push({ id: uid(), nombre: x.nombre || "Inversión", tipo: x.tipo, inicial: x.valor, actual: x.valor, comisiones: 0,
          largoPlazo: x.largo, acabada: false, fecha: fechaSaldos, pagadoDesde: null, fechaFin: null, enCartera: false });
      }
      await persistir(ctx, `Dinero inicial a mano (${fechaSaldos})${nuevas.length ? ` y ${nuevas.length} inversiones` : ""}`);
    }));
}

// ------------------------------------------------------------------ semana
function modalSemana(ctx, s = null) {
  const c = ctx.S.privado.contabilidad;
  const fechaI = h("input", { type: "date", value: s?.fecha || hoyISO() });
  const paga = h("input", { inputmode: "decimal", value: s?.paga ?? "" });
  const extra = h("input", { inputmode: "decimal", value: s?.extra ?? "" });
  const lista = h("div");
  const filaGasto = (g = {}) => {
    const imp = h("input", { inputmode: "decimal", value: g.importe ?? "", placeholder: "€" });
    const con = h("input", { value: g.concepto ?? "", placeholder: "Concepto (opcional)" });
    const fila = h("div", { class: "form2", style: { marginBottom: "6px" } }, imp, con);
    fila._leer = () => ({ importe: parseNumero(imp.value), concepto: con.value.trim() });
    lista.append(fila);
  };
  (s?.gastos?.length ? s.gastos : [{}]).forEach(filaGasto);
  abrirModal(h("h2", {}, s ? "Editar semana" : "Nueva semana"), campo("Semana (fecha)", fechaI),
    h("div", { class: "form2" }, campo("Paga (€)", paga), campo("Extra (€)", extra)),
    h("label", {}, "Gastos"), lista, h("button", { class: "mini sec", onclick: () => filaGasto() }, "+ gasto"),
    botones(async () => {
      const nueva = { id: s?.id || uid(), fecha: fechaI.value, paga: parseNumero(paga.value) || 0, extra: parseNumero(extra.value) || 0,
        gastos: [...lista.children].map((f) => f._leer()).filter((g) => g.importe > 0) };
      c.semanas = c.semanas.filter((x) => x.id !== nueva.id).concat(nueva);
      await persistir(ctx, `Semana ${nueva.fecha}: ${incrementoSemana(nueva).toFixed(2)} €`);
      const a = avisoCorto(c, ctx.S.privado.cartera);
      if (a) toast(`Corto plazo en ${a.saldo.toFixed(0)} €: toca pasar ${a.traspaso} € a medio plazo`, 4500);
    }, s ? async () => { c.semanas = c.semanas.filter((x) => x.id !== s.id); await persistir(ctx, "Borrar semana"); } : null));
}

// ------------------------------------------------------------------ transferencia
export function modalTransferencia(ctx, t = {}) {
  const c = ctx.S.privado.contabilidad;
  const sel = (valor, conExtra) => h("select", {}, Object.entries(BLOQUES).filter(([k]) => conExtra || k !== "extraordinario")
    .map(([k, v]) => h("option", { value: k, selected: valor === k }, v)));
  const fechaI = h("input", { type: "date", value: t.fecha || hoyISO() });
  const cantidad = h("input", { inputmode: "decimal", value: t.cantidad ?? "" });
  const concepto = h("input", { value: t.concepto ?? "" });
  const de = sel(t.de || "extraordinario", true);
  const a = sel(t.a || "medio", false);
  abrirModal(h("h2", {}, t.id ? "Editar transferencia" : "Transferencia"), h("div", { class: "form2" }, campo("Fecha", fechaI), campo("Cantidad (€)", cantidad)),
    campo("Concepto", concepto), h("div", { class: "form2" }, campo("De", de), campo("A", a)),
    botones(async () => {
      const n = { id: t.id || uid(), fecha: fechaI.value, cantidad: parseNumero(cantidad.value) || 0, concepto: concepto.value.trim(), de: de.value, a: a.value };
      if (!(n.cantidad > 0) || n.de === n.a) return toast("Revisa la cantidad y los bloques");
      c.transferencias = c.transferencias.filter((x) => x.id !== n.id).concat(n);
      await persistir(ctx, `Transferencia ${n.cantidad} € ${n.de}→${n.a}`);
    }, t.id ? async () => { c.transferencias = c.transferencias.filter((x) => x.id !== t.id); await persistir(ctx, "Borrar transferencia"); } : null));
}

// ------------------------------------------------------------------ intereses
function modalInteres(ctx, i = null) {
  const c = ctx.S.privado.contabilidad;
  const mes = h("input", { type: "month", value: i?.mes || hoyISO().slice(0, 7) });
  const importe = h("input", { inputmode: "decimal", value: i?.importe ?? "" });
  const cuadrado = h("input", { type: "checkbox", checked: i?.cuadrado ?? true });
  const vista = h("p", { class: "suave pequeno" });
  const calcular = () => {
    const imp = parseNumero(importe.value) || 0;
    const otros = { ...c, intereses: c.intereses.filter((x) => x.id !== i?.id) };
    const r = repartirInteres(imp, saldos(otros, `${mes.value}-28`, ctx.S.privado.cartera));
    vista.textContent = `Reparto: ${r.largo.toFixed(2)} € a largo y ${r.medio.toFixed(2)} € a medio (${(r.pesoLargo * 100).toFixed(0)} % / ${(100 - r.pesoLargo * 100).toFixed(0)} %).`;
    return r;
  };
  importe.addEventListener("input", calcular); mes.addEventListener("change", calcular); calcular();
  abrirModal(h("h2", {}, "Intereses del mes"), h("div", { class: "form2" }, campo("Mes", mes), campo("Importe (€)", importe)), vista,
    h("label", { class: "opcion" }, cuadrado, "Cuadrado con el banco"),
    botones(async () => {
      const n = { id: i?.id || uid(), mes: mes.value, fecha: `${mes.value}-28`, importe: parseNumero(importe.value) || 0, reparto: calcular(), cuadrado: cuadrado.checked };
      c.intereses = c.intereses.filter((x) => x.id !== n.id).concat(n);
      await persistir(ctx, `Intereses ${n.mes}`);
    }, i ? async () => { c.intereses = c.intereses.filter((x) => x.id !== i.id); await persistir(ctx, "Borrar intereses"); } : null));
}

// ------------------------------------------------------------------ inversión manual
function modalInversion(ctx, inv = null) {
  const c = ctx.S.privado.contabilidad;
  const nombre = h("input", { value: inv?.nombre || "" });
  const tipo = h("select", {}, h("option", { value: "variable", selected: inv?.tipo !== "fija" }, "Renta variable"), h("option", { value: "fija", selected: inv?.tipo === "fija" }, "Renta fija"));
  const inicial = h("input", { inputmode: "decimal", value: inv?.inicial ?? "" });
  const actual = h("input", { inputmode: "decimal", value: inv?.actual ?? "" });
  const comisiones = h("input", { inputmode: "decimal", value: inv?.comisiones ?? "" });
  const largo = h("input", { type: "checkbox", checked: inv?.largoPlazo !== false });
  const acabada = h("input", { type: "checkbox", checked: !!inv?.acabada });
  const fechaI = h("input", { type: "date", value: inv?.fecha || (inv ? "" : hoyISO()) });
  const fechaFin = h("input", { type: "date", value: inv?.fechaFin || "" });
  const pagado = h("select", {}, h("option", { value: "", selected: !inv?.pagadoDesde }, "No descontar (ya estaba fuera de los saldos)"),
    ["largo", "medio", "corto"].map((k) => h("option", { value: k, selected: inv?.pagadoDesde === k }, `De ${BLOQUES[k].toLowerCase()}`)));
  if (!inv) pagado.value = "largo";
  const enCartera = h("input", { type: "checkbox", checked: !!inv?.enCartera });
  abrirModal(h("h2", {}, inv ? "Editar inversión" : "Nueva inversión manual"), campo("Nombre", nombre), campo("Tipo", tipo),
    h("div", { class: "form2" }, campo("Inversión inicial (€)", inicial), campo("Valor actual (€)", actual), campo("Comisiones (€)", comisiones)),
    h("label", { class: "opcion" }, largo, "Largo plazo (si no, medio plazo). La renta fija siempre cuenta como largo."),
    h("div", { class: "form2" }, campo("Fecha de compra", fechaI), campo("Se pagó con", pagado)),
    h("label", { class: "opcion" }, acabada, "Acabada (pasa al historial, mantiene su configuración de plazo)"),
    campo("Fecha en que acabó (el valor final vuelve al bloque que la pagó)", fechaFin),
    h("label", { class: "opcion" }, enCartera, "Ya está en Cartera (no sumarla dos veces)"),
    h("p", { class: "suave pequeno" }, "Si eliges un bloque, el dinero sale de ese bloque en la fecha de compra. Así no cuenta a la vez como saldo y como inversión."),
    botones(async () => {
      const n = { ...(inv || {}), id: inv?.id || uid(), nombre: nombre.value.trim() || "Inversión", tipo: tipo.value, inicial: parseNumero(inicial.value) || 0,
        actual: parseNumero(actual.value), comisiones: parseNumero(comisiones.value) || 0, largoPlazo: tipo.value === "fija" ? true : largo.checked, acabada: acabada.checked,
        fecha: fechaI.value || null, pagadoDesde: pagado.value || null, fechaFin: acabada.checked ? (fechaFin.value || hoyISO()) : null, enCartera: enCartera.checked };
      if (Number.isNaN(n.actual)) n.actual = n.inicial;
      c.inversionesManuales = c.inversionesManuales.filter((x) => x.id !== n.id).concat(n);
      await persistir(ctx, `Inversión ${n.nombre}`);
    }, inv ? async () => { c.inversionesManuales = c.inversionesManuales.filter((x) => x.id !== inv.id); await persistir(ctx, "Borrar inversión"); } : null));
}

// ------------------------------------------------------------------ ajustes de Diners
function modalAjustesDiners(ctx) {
  const c = ctx.S.privado.contabilidad;
  const ini = c.saldosIniciales;
  const f = h("input", { type: "date", value: ini.fecha || "" });
  const campos = Object.fromEntries(["corto", "medio", "largo"].map((k) => [k, h("input", { inputmode: "decimal", value: ini[k] ?? 0 })]));
  const umbral = h("input", { inputmode: "decimal", value: c.config.umbralCorto });
  const traspaso = h("input", { inputmode: "decimal", value: c.config.traspaso });
  const compras = h("select", {}, h("option", { value: "descontar", selected: (c.config.comprasCartera || "descontar") === "descontar" }, "Salen del bloque del ETF (largo o medio)"),
    h("option", { value: "no", selected: c.config.comprasCartera === "no" }, "No se descuentan (se pagan con dinero fuera de Diners)"));
  const recalc = h("input", { type: "checkbox", checked: true });
  abrirModal(h("h2", {}, "Saldos iniciales y reglas"),
    h("p", { class: "suave pequeno" }, "Saldo de cada bloque ANTES del primer movimiento registrado. Los saldos actuales se calculan solos sumando semanas, transferencias e intereses."),
    campo("Fecha de los saldos iniciales", f), h("div", { class: "form2" }, campo("Corto (€)", campos.corto), campo("Medio (€)", campos.medio), campo("Largo (€)", campos.largo)),
    h("h3", {}, "Regla del corto plazo"), h("div", { class: "form2" }, campo("Avisar al llegar a (€)", umbral), campo("Cantidad a traspasar (€)", traspaso)),
    h("h3", {}, "Compras de la Cartera"), campo("El dinero de las compras de ETF posteriores a la fecha inicial…", compras),
    h("p", { class: "suave pequeno" }, "Cada operación puede tener su propia opción en Cartera → Editar."),
    h("label", { class: "opcion" }, recalc, "Recalcular el reparto de los intereses ya guardados con estos saldos"),
    botones(async () => {
      c.saldosIniciales = { ...c.saldosIniciales, fecha: f.value || null, corto: parseNumero(campos.corto.value) || 0, medio: parseNumero(campos.medio.value) || 0, largo: parseNumero(campos.largo.value) || 0 };
      c.config = { ...c.config, umbralCorto: parseNumero(umbral.value) || 300, traspaso: parseNumero(traspaso.value) || 150, comprasCartera: compras.value };
      const n = recalc.checked ? recalcularRepartos(c, ctx.S.privado.cartera) : 0;
      await persistir(ctx, `Ajustes de Diners${n ? ` (${n} repartos de intereses recalculados)` : ""}`);
    }));
}

// ------------------------------------------------------------------ importar Excel
function modalImportarExcel(ctx) {
  const fichero = h("input", { type: "file", accept: ".xlsx" });
  const zona = h("div");
  fichero.addEventListener("change", async () => {
    zona.replaceChildren(h("p", { class: "suave" }, "Leyendo…"));
    try {
      const r = await importarDiners(await fichero.files[0].arrayBuffer(), ctx.S.privado.cartera);
      const s = saldos(r.contabilidad, null, ctx.S.privado.cartera);
      zona.replaceChildren(
        h("p", {}, `Encontrado: ${r.resumen.semanas} semanas con movimientos, ${r.resumen.transferencias} transferencias, ${r.resumen.intereses} meses de intereses, ${r.resumen.inversiones} inversiones y ${r.resumen.notas} instrucciones.`),
        h("p", {}, `Saldos resultantes: corto ${eur(s.corto)}, medio ${eur(s.medio)}, largo ${eur(s.largo)}.`),
        ...r.avisos.map((a) => h("div", { class: "aviso" }, a)),
        r.revision?.length ? h("details", {}, h("summary", {}, `Revisión de tu Excel (${r.revision.length} observaciones)`),
          h("ul", { class: "pequeno" }, r.revision.map((x) => h("li", {}, x)))) : null,
        h("div", { class: "aviso rojo" }, "Esto SUSTITUYE tu contabilidad actual de la app."),
        h("button", { onclick: async () => { ctx.S.privado.contabilidad = r.contabilidad; await persistir(ctx, "Importar Diners.xlsx"); } }, "Importar"));
    } catch (e) {
      zona.replaceChildren(h("div", { class: "aviso rojo" }, "No se pudo leer el Excel: " + e.message));
    }
  });
  abrirModal(h("h2", {}, "Importar Diners.xlsx"), h("p", { class: "suave" }, "El fichero se lee en tu dispositivo; solo se guarda el resultado en tu repositorio privado."),
    fichero, zona, h("div", { class: "fila", style: { marginTop: "10px" } }, h("button", { class: "sec", onclick: cerrarModal }, "Cerrar")));
}
