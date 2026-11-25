import { abrirModal, campo, cerrarModal, claseSigno, eur, fecha, h, hoyISO, num, parseNumero, pct, tarjeta, toast, uid } from "../dom.js";
import { eficaciaSenales, esApalancado, fuentePrecio, gananciaPeriodo, historico, restarDias, tirCartera } from "../finanzas.js";
import { prediccionCartera } from "../intradia.js";
import { clasificarNombre } from "../reco.js";
import { destruirEn, donut, lineas } from "../graficas.js";
import { HUECOS, ROL_A_HUECO } from "../perfil.js";
import { convertir, detectarColumnas, fusionar, parsearCSV } from "../importar_tr.js";
import { PAGADO_DESDE } from "../diners.js";
import { tarjetaIntradia } from "./intradia.js";

const ORIGEN = { plan: "Plan", extra: "Extra (señal)", manual: "Manual", importado: "Importado" };

export function render(ctx) {
  const { S, calc } = ctx;
  const { cartera } = S.privado;
  const { pos, res } = calc;
  const nodos = [];
  const acciones = h("div", { class: "fila" },
    h("button", { onclick: () => modalOperacion(ctx) }, "+ Operación"),
    h("button", { class: "sec", onclick: () => modalImportarTR(ctx) }, "Importar CSV de Trade Republic"));

  if (!cartera.operaciones.length) {
    nodos.push(tarjeta("Tu cartera está vacía",
      h("p", {}, "Añade tus compras a mano o importa el CSV de Trade Republic (Perfil → Extractos → Exportar transacciones)."), acciones));
    nodos.push(tarjetaIntradia(ctx));
    return nodos;
  }

  const tir = tirCartera(cartera.operaciones, res.valor);
  nodos.push(tarjeta(null,
    h("div", { class: "rejilla" },
      kpi("Valor actual", eur(res.valor)), kpi("Invertido (vivo)", eur(res.coste)),
      kpi("Ganancia latente", eur(res.latente), claseSigno(res.latente)), kpi("Rentabilidad", pct(res.latentePct), claseSigno(res.latentePct)),
      kpi("TIR anual", tir === null ? "— (<3 meses)" : pct(tir), claseSigno(tir)), kpi("Realizado + dividendos", eur(res.realizado), claseSigno(res.realizado))),
    res.sinPrecio.length ? h("div", { class: "aviso" }, `Sin precio actualizado: ${res.sinPrecio.map((i) => cartera.activos[i]?.nombre || i).join(", ")}. El workflow privado “Precios de mi cartera” busca su ticker solo por el ISIN; si no lo encuentra, escríbelo o pon un precio manual tocando el activo.`) : null,
    h("div", { style: { marginTop: "10px" } }, acciones)));

  nodos.push(tarjetaIntradia(ctx));

  // Evolución (por periodos: día, semana, mes, año)
  nodos.push(tarjetaEvolucion(ctx));

  // Asignación
  const r = calc.reco;
  const etiquetas = Object.keys(r.actual.porHueco).map((k) => HUECOS[k]?.nombre || "Otros");
  nodos.push(tarjeta("Reparto de la cartera",
    donut(etiquetas, Object.values(r.actual.porHueco).map((v) => Math.round(v * 100) / 100)),
    r.desviaciones.length ? h("table", {}, h("tr", {}, h("th", {}, "Hueco"), h("th", { class: "num" }, "Actual"), h("th", { class: "num" }, "Objetivo"), h("th", { class: "num" }, "Dif.")),
      r.desviaciones.map((x) => h("tr", {}, h("td", {}, HUECOS[x.hueco]?.nombre || "Otros"), h("td", { class: "num" }, pct(x.real, 0, false)),
        h("td", { class: "num" }, pct(x.objetivo, 0, false)), h("td", { class: `num ${Math.abs(x.diferencia) >= 5 ? "neg" : ""}` }, pct(x.diferencia, 0))))) :
      h("p", { class: "suave" }, "Haz el test de perfil en Ajustes para ver tu reparto objetivo.")));

  // Posiciones
  const filas = Object.values(pos).filter((p) => p.participaciones > 1e-9).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  nodos.push(tarjeta("Posiciones",
    h("div", { class: "tabla-scroll" }, h("table", {},
      h("tr", {}, h("th", {}, "Activo"), h("th", { class: "num" }, "Valor"), h("th", { class: "num" }, "Ganancia")),
      filas.map((p) => h("tr", { onclick: () => modalPosicion(ctx, p), style: { cursor: "pointer" } },
        h("td", {}, cartera.activos[p.isin]?.nombre || p.isin, esApalancado(cartera.activos[p.isin]?.nombre) ? h("span", { class: "chip i2" }, "apalancado") : null,
          h("div", { class: "suave pequeno" }, `${num(p.participaciones, 4)} part. · ${HUECOS[calc.huecoDe(p.isin)]?.nombre || "Otros"}`)),
        h("td", { class: "num" }, eur(p.valor)),
        h("td", { class: `num ${claseSigno(p.latente)}` }, eur(p.latente), h("div", { class: "pequeno" }, pct(p.latentePct))))))),
    h("p", { class: "suave pequeno" }, "Toca un activo para ver la ganancia de cada compra según su momento.")));

  // Eficacia de las señales
  const ef = eficaciaSenales(cartera.operaciones);
  nodos.push(tarjeta("¿Te han servido las señales?",
    ef.n ? h("div", {},
      h("p", {}, `Tus ${ef.n} compras extra salieron de media un `, h("strong", { class: claseSigno(ef.ventajaMediaPct) }, pct(ef.ventajaMediaPct)),
        ` ${ef.ventajaMediaPct >= 0 ? "más baratas" : "más caras"} que tus compras del plan de los ±3 meses cercanos.`),
      h("table", {}, h("tr", {}, h("th", {}, "Fecha"), h("th", { class: "num" }, "Precio extra"), h("th", { class: "num" }, "Precio plan"), h("th", { class: "num" }, "Ventaja")),
        ef.filas.map((f) => h("tr", {}, h("td", {}, fecha(f.fecha)), h("td", { class: "num" }, num(f.precioExtra, 2)), h("td", { class: "num" }, num(f.precioPlan, 2)),
          h("td", { class: `num ${claseSigno(f.ventajaPct)}` }, pct(f.ventajaPct))))))
      : h("p", { class: "suave" }, "Cuando registres compras con origen “Extra (señal)” y tengas compras del plan del mismo ETF, aquí verás si comprar en las señales te salió más barato.")));

  // Operaciones
  const ops = [...cartera.operaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  nodos.push(tarjeta("Operaciones",
    h("div", { class: "tabla-scroll" }, h("table", {},
      h("tr", {}, h("th", {}, "Fecha"), h("th", {}, "Activo"), h("th", { class: "num" }, "Importe"), h("th", {}, "")),
      ops.slice(0, 60).map((o) => h("tr", {},
        h("td", {}, fecha(o.fecha), h("div", { class: "suave pequeno" }, `${o.tipo} · ${ORIGEN[o.origen] || o.origen}`)),
        h("td", {}, cartera.activos[o.isin]?.nombre || o.isin, h("div", { class: "suave pequeno" }, `${num(o.participaciones, 4)} × ${num(o.precio, 2)}`)),
        h("td", { class: "num" }, eur(o.importe)),
        h("td", {}, h("button", { class: "mini sec", onclick: () => modalOperacion(ctx, o) }, "Editar"))))))));
  return nodos;
}

/** Precio medio de compra frente a precio actual y de dónde sale este, para poder compararlo con Trade Republic. */
function resumenPrecio(ctx, p) {
  const medio = p.participaciones > 1e-9 ? p.costeVivo / p.participaciones : null;
  const f = fuentePrecio(ctx.calc.idx, p.isin);
  const tickerAuto = ctx.S.privado.precios?.tickers?.[p.isin];
  const origen = !f ? "sin precio" : f.tipo === "real" ? `Xetra, ${f.hora} de hoy` : f.tipo === "estimado" ? `estimado a las ${f.hora} del ${fecha(f.fecha)} (fuera del horario de Xetra)`
    : f.tipo === "manual" ? `precio manual del ${fecha(f.fecha)}` : `cierre del ${fecha(f.fecha)}`;
  return h("div", { class: "rejilla" },
    kpi("Precio medio de compra", medio === null ? "—" : `${num(medio, 2)} €`),
    kpi("Precio actual", p.precioActual === null ? "—" : `${num(p.precioActual, 2)} €`),
    kpi("Rentabilidad", pct(p.latentePct), claseSigno(p.latentePct)),
    h("p", { class: "suave pequeno", style: { gridColumn: "1 / -1" } }, `Precio actual: ${origen}${tickerAuto ? ` · ticker ${tickerAuto.ticker}${tickerAuto.origen === "automatico" ? " (encontrado por ISIN)" : ""}` : ""}. `,
      "El precio medio incluye comisiones. Trade Republic usa su precio en directo, así que puede haber una pequeña diferencia."));
}

// ------------------------------------------------------------------ evolución por periodos
const PERIODOS = { dia: "Día", semana: "Semana", mes: "Mes", ano: "Año" };
let periodo = "mes"; // se recuerda mientras la app está abierta

function tarjetaEvolucion(ctx) {
  const contenido = h("div");
  const botones = h("div", { class: "fila segmentos" });
  const pintar = () => {
    botones.replaceChildren(...Object.entries(PERIODOS).map(([k, v]) =>
      h("button", { class: `mini ${k === periodo ? "" : "sec"}`, onclick: () => { periodo = k; pintar(); } }, v)));
    destruirEn(contenido);
    contenido.replaceChildren(...graficaEvolucion(ctx, periodo));
  };
  pintar();
  return tarjeta("Evolución: valor vs dinero aportado", botones, contenido);
}

function graficaEvolucion(ctx, clave) {
  const { S, calc } = ctx;
  const ops = S.privado.cartera.operaciones;
  const hoy = new Date().toISOString().slice(0, 10);
  const redondo = (v) => Math.round(v * 100) / 100;
  let etiquetas, valores, aportado, puntos, nota = null;
  if (clave === "dia") {
    // Hora a hora con la previsión intradía (lo que lleva hoy la cartera)
    const pred = calc.intradia ? prediccionCartera(calc.intradia, calc.pos) : null;
    if (!pred?.actual?.length) return [h("p", { class: "suave" }, "Todavía no hay datos de hoy hora a hora (se calculan los días laborables de 7:30 a 23:00).")];
    const ap = historico(ops, calc.idx, hoy).at(-1)?.aportado ?? 0;
    etiquetas = pred.actual.map((x) => x.hora);
    valores = pred.actual.map((x) => redondo(x.valor));
    aportado = etiquetas.map(() => redondo(ap));
    puntos = pred.actual.map((x) => ({ valor: x.valor, aportado: ap }));
    if (pred.fecha !== hoy) nota = `Datos del ${fecha(pred.fecha)} (hoy aún no hay mercado o no se ha calculado).`;
    else if (pred.actual.some((x) => x.tipo !== "real")) nota = "Las horas fuera del horario de bolsa de alguno de tus activos son estimadas.";
  } else {
    const dias = { semana: 7, mes: 31, ano: 365 }[clave];
    const hist = historico(ops, calc.idx, hoy, { desde: restarDias(hoy, dias), pasoDias: clave === "ano" ? 7 : 1 });
    if (hist.length < 2) return [h("p", { class: "suave" }, "Aún no hay datos suficientes para este periodo.")];
    etiquetas = hist.map((p) => p.fecha.slice(5).split("-").reverse().join("/"));
    valores = hist.map((p) => redondo(p.valor));
    aportado = hist.map((p) => redondo(p.aportado));
    puntos = hist;
    if (hist.some((p) => !p.completo)) nota = "Algunos días no tienen precio de todos los activos; la línea de valor puede quedar por debajo de la real.";
  }
  const g = gananciaPeriodo(puntos);
  const textoPeriodo = { dia: "Hoy", semana: "En la última semana", mes: "En el último mes", ano: "En el último año" }[clave];
  return [
    g ? h("p", {}, `${textoPeriodo}: `, h("strong", { class: claseSigno(g.ganancia) }, `${g.ganancia >= 0 ? "+" : ""}${eur(g.ganancia)}`),
      g.pct === null ? "" : ` (${pct(g.pct)})`, h("span", { class: "suave pequeno" }, " sin contar el dinero que has metido o sacado")) : null,
    lineas(etiquetas, [
      { nombre: "Valor", valores, relleno: "rgba(30,142,90,.08)" },
      { nombre: "Aportado", valores: aportado, discontinua: true },
    ], { formatoY: (v) => `${num(v, 0)} €`, zoom: {} }),
    nota ? h("p", { class: "suave pequeno" }, nota) : null,
  ];
}

function kpi(etiqueta, valor, clase = "") { return h("div", { class: "kpi" }, h("div", { class: "eti" }, etiqueta), h("div", { class: `val ${clase}` }, valor)); }

// ------------------------------------------------------------------ detalle de posición
function modalPosicion(ctx, p) {
  const { S } = ctx;
  const a = S.privado.cartera.activos[p.isin] || {};
  abrirModal(
    h("h2", {}, a.nombre || p.isin),
    h("p", { class: "suave" }, p.isin, " · ", HUECOS[ctx.calc.huecoDe(p.isin)]?.nombre || "Otros (acción, temático…)"),
    resumenPrecio(ctx, p),
    h("div", { class: "tabla-scroll" }, h("table", {},
      h("tr", {}, h("th", {}, "Compra"), h("th", { class: "num" }, "Precio"), h("th", { class: "num" }, "Ganancia"), h("th", { class: "num" }, "Anual")),
      p.lotes.filter((l) => l.participaciones > 0).map((l) => h("tr", {},
        h("td", {}, fecha(l.fecha), h("div", { class: "suave pequeno" }, `${ORIGEN[l.origen] || l.origen}${l.restantes < l.participaciones - 1e-9 ? " · vendida en parte" : ""}`)),
        h("td", { class: "num" }, num(l.precio, 2)),
        h("td", { class: `num ${claseSigno(l.ganancia)}` }, eur(l.ganancia), h("div", { class: "pequeno" }, pct(l.gananciaPct))),
        h("td", { class: `num ${claseSigno(l.anualizada)}` }, l.anualizada === null ? "—" : pct(l.anualizada)))))),
    h("p", { class: "suave pequeno" }, "La rentabilidad anualizada solo se muestra para compras con más de 3 meses."),
    h("div", { class: "fila" }, h("button", { onclick: () => modalActivo(ctx, p.isin) }, "Editar activo"), h("button", { class: "sec", onclick: cerrarModal }, "Cerrar")));
}

export function modalActivo(ctx, isin) {
  const { S, guardar, refrescar } = ctx;
  const a = (S.privado.cartera.activos[isin] ||= { nombre: isin });
  const nombre = h("input", { value: a.nombre || "" });
  const detectado = S.privado.precios?.tickers?.[isin];
  const yahoo = h("input", { value: a.yahoo || "", placeholder: detectado?.origen === "automatico" ? `Encontrado: ${detectado.ticker} (déjalo vacío para usarlo)` : "Vacío = se busca solo por el ISIN" });
  const auto = HUECOS[ROL_A_HUECO[ctx.calc?.universoPorIsin?.[isin]?.rol] || clasificarNombre(a.nombre)]?.nombre || "Otros";
  const hueco = h("select", {}, h("option", { value: "" }, `Automático (${auto})`), Object.entries(HUECOS).map(([k, v]) => h("option", { value: k, selected: a.hueco === k }, v.nombre)),
    h("option", { value: "otros", selected: a.hueco === "otros" }, "Otros (acción, temático…)"));
  const bloque = h("select", {}, h("option", { value: "largo", selected: a.bloque !== "medio" }, "Largo plazo"), h("option", { value: "medio", selected: a.bloque === "medio" }, "Medio plazo"));
  const precio = h("input", { inputmode: "decimal", value: a.precioManual?.valor ?? "", placeholder: "Solo si no hay ticker" });
  abrirModal(h("h2", {}, "Activo"), h("p", { class: "suave" }, isin),
    campo("Nombre", nombre), campo("Ticker de Yahoo Finance (para actualizar el precio a diario)", yahoo),
    h("div", { class: "form2" }, campo("Hueco de la cartera", hueco), campo("Bloque en Diners", bloque)),
    campo("Precio manual (€)", precio),
    h("div", { class: "fila", style: { marginTop: "12px" } },
      h("button", { onclick: async () => {
        a.nombre = nombre.value.trim() || isin; a.yahoo = yahoo.value.trim() || undefined; a.hueco = hueco.value || undefined; a.bloque = bloque.value;
        const pm = parseNumero(precio.value);
        a.precioManual = pm > 0 ? { valor: pm, fecha: hoyISO() } : undefined;
        await guardar("cartera", `Editar activo ${isin}`); cerrarModal(); refrescar();
      } }, "Guardar"), h("button", { class: "sec", onclick: cerrarModal }, "Cancelar")));
}

// ------------------------------------------------------------------ alta/edición de operación
export function modalOperacion(ctx, preset = {}) {
  const { S, guardar, refrescar } = ctx;
  const cartera = S.privado.cartera;
  const editando = !!preset.id;
  const universo = S.publico.universo?.info || {};
  const opcionesActivo = new Map();
  for (const [id, i] of Object.entries(universo)) if (i.isin) opcionesActivo.set(i.isin, `${i.nombre} (${id})`);
  for (const [isin, a] of Object.entries(cartera.activos)) opcionesActivo.set(isin, a.nombre || isin);

  const fechaI = h("input", { type: "date", value: preset.fecha || hoyISO() });
  const tipo = h("select", {}, ["compra", "venta", "dividendo"].map((t) => h("option", { value: t, selected: (preset.tipo || "compra") === t }, t)));
  const activo = h("select", {}, h("option", { value: "" }, "— Elige —"), [...opcionesActivo].map(([isin, n]) => h("option", { value: isin, selected: preset.isin === isin }, n)),
    h("option", { value: "__otro" }, "Otro (escribir ISIN)"));
  const isinI = h("input", { placeholder: "ISIN", value: "", hidden: true });
  const nombreI = h("input", { placeholder: "Nombre del activo", hidden: true });
  activo.addEventListener("change", () => { isinI.hidden = nombreI.hidden = activo.value !== "__otro"; });
  const part = h("input", { inputmode: "decimal", value: preset.participaciones ?? "", placeholder: "0,1234" });
  const precio = h("input", { inputmode: "decimal", value: preset.precio ?? "", placeholder: "€ por participación" });
  const importe = h("input", { inputmode: "decimal", value: preset.importe ?? "", placeholder: "€ invertidos (sin comisión)" });
  const comision = h("input", { inputmode: "decimal", value: preset.comision ?? (preset.origen === "plan" ? 0 : 1) });
  const origen = h("select", {}, Object.entries(ORIGEN).map(([k, v]) => h("option", { value: k, selected: (preset.origen || "manual") === k }, v)));
  const pagado = h("select", {}, Object.entries(PAGADO_DESDE).map(([k, v]) => h("option", { value: k, selected: (preset.pagadoDesde || "auto") === k }, v)));
  const autocompletar = () => {
    const p = parseNumero(part.value), pr = parseNumero(precio.value), im = parseNumero(importe.value);
    if (p > 0 && pr > 0 && !(im > 0)) importe.value = (p * pr).toFixed(2);
    else if (im > 0 && pr > 0 && !(p > 0)) part.value = (im / pr).toFixed(6);
    else if (im > 0 && p > 0 && !(pr > 0)) precio.value = (im / p).toFixed(4);
  };
  [part, precio, importe].forEach((x) => x.addEventListener("blur", autocompletar));
  const error = h("p", { class: "neg pequeno" });

  const guardarOp = async () => {
    autocompletar();
    const isin = activo.value === "__otro" ? isinI.value.trim().toUpperCase() : activo.value;
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) { error.textContent = "ISIN no válido (12 caracteres, p. ej. IE00BK5BQT80)."; return; }
    const op = { id: preset.id || uid(), fecha: fechaI.value, tipo: tipo.value, isin, participaciones: parseNumero(part.value) || 0,
      precio: parseNumero(precio.value) || 0, importe: parseNumero(importe.value) || 0, comision: parseNumero(comision.value) || 0, origen: origen.value,
      pagadoDesde: pagado.value === "auto" ? undefined : pagado.value };
    if (op.tipo !== "dividendo" && !(op.participaciones > 0 && op.importe > 0)) { error.textContent = "Faltan participaciones o importe."; return; }
    if (!cartera.activos[isin]) {
      const u = Object.entries(universo).find(([, i]) => i.isin === isin);
      cartera.activos[isin] = { nombre: u ? u[1].nombre : (nombreI.value.trim() || isin), yahoo: u ? u[1].yahoo : undefined };
    }
    cartera.operaciones = cartera.operaciones.filter((o) => o.id !== op.id).concat(op);
    await guardar("cartera", `${editando ? "Editar" : "Añadir"} ${op.tipo} ${isin} ${op.fecha}`);
    cerrarModal(); refrescar();
  };
  const borrar = async () => {
    if (!confirm("¿Borrar esta operación?")) return;
    cartera.operaciones = cartera.operaciones.filter((o) => o.id !== preset.id);
    await guardar("cartera", "Borrar operación"); cerrarModal(); refrescar();
  };
  abrirModal(h("h2", {}, editando ? "Editar operación" : "Nueva operación"),
    h("div", { class: "form2" }, campo("Fecha", fechaI), campo("Tipo", tipo)),
    campo("Activo", activo), isinI, nombreI,
    h("div", { class: "form2" }, campo("Participaciones", part), campo("Precio (€)", precio), campo("Importe (€)", importe), campo("Comisión (€)", comision)),
    h("div", { class: "form2" }, campo("Origen", origen), campo("Dinero en Diners", pagado)),
    h("p", { class: "suave pequeno" }, "“Dinero en Diners”: de qué bloque sale el dinero de la compra (o adónde vuelve el de una venta). Así no cuenta dos veces, como saldo y como inversión. Rellena dos de los tres (participaciones, precio, importe) y se calcula el tercero. Marca “Extra (señal)” si la compra la hiciste por una recomendación de la app."),
    error,
    h("div", { class: "fila" }, h("button", { onclick: guardarOp }, "Guardar"), editando ? h("button", { class: "peligro", onclick: borrar }, "Borrar") : null,
      h("button", { class: "sec", onclick: cerrarModal }, "Cancelar")));
}

// ------------------------------------------------------------------ importación CSV Trade Republic
function modalImportarTR(ctx) {
  const { S, guardar, refrescar } = ctx;
  const fichero = h("input", { type: "file", accept: ".csv,text/csv" });
  const zona = h("div");
  fichero.addEventListener("change", async () => {
    const texto = await fichero.files[0].text();
    const datos = parsearCSV(texto);
    const mapa = detectarColumnas(datos.cabecera);
    const selects = {};
    const pintar = () => {
      const r = convertir(datos, Object.fromEntries(Object.entries(selects).map(([k, s]) => [k, s.value === "" ? undefined : Number(s.value)])));
      const f = fusionar(S.privado.cartera.operaciones, r.operaciones);
      zona.replaceChildren(
        h("details", {}, h("summary", {}, "Columnas detectadas (cámbialas si algo no cuadra)"),
          h("div", { class: "form2" }, Object.entries(selects).map(([k, s]) => campo(k, s)))),
        h("p", {}, `${r.operaciones.length} operaciones reconocidas (${f.añadidas} nuevas, ${f.repetidas} ya estaban) · ${r.descartadas.length} filas ignoradas (ingresos, tarjeta, intereses…).`),
        h("div", { class: "tabla-scroll" }, h("table", {}, r.operaciones.slice(0, 8).map((o) => h("tr", {}, h("td", {}, o.fecha), h("td", {}, o.tipo), h("td", {}, r.activos[o.isin]?.nombre),
          h("td", { class: "num" }, num(o.participaciones, 4)), h("td", { class: "num" }, eur(o.importe)))))),
        h("div", { class: "fila", style: { marginTop: "10px" } }, h("button", { disabled: !f.añadidas, onclick: async () => {
          const c = S.privado.cartera;
          c.operaciones = f.operaciones;
          for (const [isin, a] of Object.entries(r.activos)) {
            if (c.activos[isin]) continue;
            const u = Object.values(S.publico.universo?.info || {}).find((i) => i.isin === isin);
            c.activos[isin] = { nombre: u?.nombre || a.nombre, yahoo: u?.yahoo };
          }
          await guardar("cartera", `Importar ${f.añadidas} operaciones de Trade Republic`);
          toast(`${f.añadidas} operaciones importadas`); cerrarModal(); refrescar();
        } }, `Importar ${f.añadidas}`)));
    };
    for (const campoNombre of ["fecha", "tipo", "isin", "nombre", "participaciones", "precio", "importe", "comision"]) {
      const s = h("select", {}, h("option", { value: "" }, "—"), datos.cabecera.map((c, i) => h("option", { value: i, selected: mapa[campoNombre] === i }, c || `col ${i + 1}`)));
      s.addEventListener("change", pintar);
      selects[campoNombre] = s;
    }
    pintar();
  });
  abrirModal(h("h2", {}, "Importar de Trade Republic"),
    h("p", { class: "suave" }, "En la app de Trade Republic: Perfil → Extractos → Exportar transacciones → CSV. El fichero se procesa en tu móvil; solo se guardan las operaciones en tu repositorio privado."),
    fichero, zona, h("div", { class: "fila", style: { marginTop: "10px" } }, h("button", { class: "sec", onclick: cerrarModal }, "Cerrar")));
}
