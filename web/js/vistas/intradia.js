// Tarjeta "Hoy, hora a hora": previsión intradía de la cartera completa o de un ETF (se usa en la vista Cartera).
import { eur, fecha, h, num, pct, tarjeta } from "../dom.js";
import { lineas } from "../graficas.js";
import { activoPorIsin, NOMBRE_VARIABLE, prediccionCartera, textoCalidad } from "../intradia.js";
import { leerConfig } from "../store.js";

let seleccion = null; // "cartera" o id de ETF; se recuerda mientras la app está abierta

const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

export function tarjetaIntradia(ctx) {
  const { S, calc } = ctx;
  const intra = calc.intradia;
  const cartera = S.privado.cartera;
  const vivas = Object.values(calc.pos || {}).filter((p) => p.participaciones > 1e-9);
  const nombre = (isin) => cartera.activos[isin]?.nombre || isin;
  if (!intra || !Object.keys(intra.activos || {}).length) {
    return tarjeta("Hoy, hora a hora", h("p", { class: "suave" },
      "Todavía no hay previsión intradía. Se calcula cada hora en días laborables de 7:30 a 23:00 (Actions → Predicción intradía)."));
  }
  const pred = prediccionCartera(intra, calc.pos);
  const porIsin = activoPorIsin(intra);
  const propios = vivas.filter((p) => porIsin[p.isin]).map((p) => porIsin[p.isin]);
  const sinPrevision = vivas.filter((p) => !porIsin[p.isin]).map((p) => nombre(p.isin));
  // Si tienes activos, solo se enseñan los tuyos; los ETF del universo solo si la cartera está vacía.
  const otros = vivas.length ? [] : Object.values(intra.activos);
  const elegibles = [...propios, ...otros];
  if (!elegibles.length) {
    return tarjeta("Hoy, hora a hora", h("p", { class: "suave" }, `Ninguno de tus activos tiene previsión todavía (${sinPrevision.join(", ")}).`),
      ayudaPrivada(S));
  }
  if (!seleccion || (seleccion === "cartera" && !pred) || (seleccion !== "cartera" && !elegibles.some((a) => a.id === seleccion))) {
    seleccion = pred ? "cartera" : elegibles[0].id;
  }
  const etiqueta = (a) => (a.privado ? nombre(a.isin) : `${a.id} · ${nombre(a.isin)}`);

  const contenedor = h("div");
  const selector = h("select", { onchange: () => { seleccion = selector.value; pintar(); } },
    pred ? h("option", { value: "cartera", selected: seleccion === "cartera" }, "Mi cartera completa") : null,
    propios.length ? h("optgroup", { label: "Mis activos" }, propios.map((a) => h("option", { value: a.id, selected: seleccion === a.id }, etiqueta(a)))) : null,
    otros.length ? h("optgroup", { label: "ETF del universo (aún no tienes activos)" }, otros.map((a) => h("option", { value: a.id, selected: seleccion === a.id }, `${a.id} · ${a.nombre}`))) : null);

  const pintar = () => {
    const datos = seleccion === "cartera" ? { ...pred, nombre: "Tu cartera", esCartera: true } : intra.activos[seleccion];
    contenedor.replaceChildren(...contenidoGrafica(intra, datos));
  };
  pintar();

  return tarjeta("Hoy, hora a hora (previsión)",
    intra.fecha !== hoyMadrid() ? h("div", { class: "aviso" }, `La previsión es del ${fecha(intra.fecha)}. Hoy no hay mercado o todavía no se ha calculado.`) : null,
    h("div", { class: "fila", style: { alignItems: "center", marginBottom: "8px" } }, selector,
      h("button", { class: "mini sec", onclick: () => ctx.recargarIntradia() }, "Actualizar")),
    contenedor,
    sinPrevision.length ? h("div", {}, h("p", { class: "suave pequeno" }, `Sin previsión todavía (se cuentan con su último precio): ${sinPrevision.join(", ")}.`), ayudaPrivada(S)) : null,
    h("p", { class: "suave pequeno" }, `Actualizada: ${horaMadrid(intra.generado)}${intra.privadoGenerado ? ` · tus otros activos: ${horaMadrid(intra.privadoGenerado)}` : ""}. `, intra.nota, " ", h("a", { href: "#/como" }, "Cómo funciona")));
}

const horaMadrid = (iso) => (iso ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

function ayudaPrivada(S) {
  const usuario = leerConfig().owner || "tu usuario de GitHub";
  const sinTicker = Object.keys(S.privado.precios?.fallos || {}).filter((k) => !k.startsWith("__")).map((k) => S.privado.cartera.activos[k]?.nombre || k);
  return h("details", { class: "pequeno" }, h("summary", {}, "¿Cómo tener previsión de todos mis activos?"),
    h("p", {}, "Los activos que no están en la lista pública de la app se calculan en tu repositorio privado, para que nadie vea qué tienes. Hay que hacerlo una sola vez:"),
    h("ol", {},
      h("li", {}, "Conecta tu repositorio privado en Ajustes (si aún usas el modo local, tus activos no salen de este móvil y no se pueden calcular)."),
      h("li", {}, `En GitHub, en tu repositorio privado inversor-datos, crea el fichero .github/workflows/intradia.yml con el contenido de plantilla-datos/.github/workflows/intradia.yml de la app (cambiando TU_USUARIO por ${usuario}).`),
      h("li", {}, "Pestaña Actions → “Precios de mi cartera” → Run workflow (busca el ticker de cada activo por su ISIN). Después, “Previsión intradía de mi cartera” → Run workflow."),
      h("li", {}, "Vuelve aquí y pulsa Actualizar. A partir de ahí se recalcula sola cada hora.")),
    sinTicker.length ? h("p", { class: "neg" }, `No se encontró el ticker de: ${sinTicker.join(", ")}. Escríbelo a mano en Cartera → toca el activo → Editar activo.`) : null);
}

function contenidoGrafica(intra, d) {
  const horas = intra.horas;
  const idx = (hora) => horas.indexOf(hora);
  const serie = () => horas.map(() => null);
  const real = serie(), estimado = serie(), plan = serie(), prevision = serie(), inf = serie(), sup = serie();
  for (const p of d.plan || []) { const i = idx(p.hora); plan[i] = p.esperado; inf[i] = p.inf; sup[i] = p.sup; }
  const desde = d.prevision?.[0]?.hora;
  for (const p of d.prevision || []) { const i = idx(p.hora); prevision[i] = p.esperado; if (p.hora !== desde || !d.actual?.length) { inf[i] = p.inf; sup[i] = p.sup; } }
  const act = d.actual || [];
  act.forEach((p, k) => {
    const i = idx(p.hora);
    if (p.tipo === "real") real[i] = p.valor;
    // La línea de "estimado" incluye los vecinos reales para que no queden huecos
    if (p.tipo !== "real" || act[k - 1]?.tipo === "estimado" || act[k + 1]?.tipo === "estimado") estimado[i] = p.valor;
  });
  const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
  const grafica = lineas(horas, [
    { nombre: "Banda 80 %", valores: inf.map(r2), color: "rgba(98,125,152,.35)", ancho: 1 },
    { nombre: "Banda 80 % (sup.)", valores: sup.map(r2), color: "rgba(98,125,152,.35)", ancho: 1, fill: "-1", relleno: "rgba(98,125,152,.12)", sinLeyenda: true },
    { nombre: "Previsto a las 7:30", valores: plan.map(r2), color: "#8d99ae", discontinua: true, ancho: 1.5 },
    { nombre: "Previsión actual", valores: prevision.map(r2), discontinua: true, color: "#2f80ed" },
    { nombre: "Real", valores: real.map(r2), radio: 2, huecos: true, color: "#102a43" },
    { nombre: "Estimado (fuera de Xetra)", valores: estimado.map(r2), discontinua: true, huecos: true, color: "#e09f3e" },
  ], { formatoY: (v) => (d.esCartera ? `${v} €` : num(v, 2)) });

  const ultimo = act.at(-1);
  const fin = (d.prevision || d.plan || []).at(-1);
  const ancla = d.esCartera ? d.plan?.[0]?.esperado : d.ancla?.valor;
  const fmt = (v) => (d.esCartera ? eur(v) : `${num(v, 2)} €`);
  const conSigno = (v) => (v >= 0 ? `+${eur(v)}` : eur(v));
  const lineasTexto = [];
  if (ultimo) lineasTexto.push(`Último dato (${ultimo.hora}, ${ultimo.tipo}): ${fmt(ultimo.valor)}${ancla ? ` (${pct((ultimo.valor / ancla - 1) * 100)} desde las 7:30)` : ""}.`);
  if (fin) lineasTexto.push(`Previsión para las ${fin.hora}: ${fmt(fin.esperado)}, con un 80 % de probabilidad entre ${fmt(fin.inf)} y ${fmt(fin.sup)}.`);
  if (d.esCartera && ancla && fin) lineasTexto.push(`Es decir, tu cartera podría moverse hoy entre ${conSigno(fin.inf - ancla)} y ${conSigno(fin.sup - ancla)} respecto a las 7:30.`);

  const nodos = [grafica,
    h("div", { class: "leyenda-intradia" }, "Línea oscura: precio real (Xetra) · naranja: estimado fuera de Xetra · gris: previsto a las 7:30 · azul: previsión actual · zona sombreada: banda del 80 %"),
    ...lineasTexto.map((t) => h("p", { class: "pequeno" }, t)),
    h("p", { class: "pequeno" }, h("strong", {}, "¿Acierta? "), textoCalidad(d.calidad))];
  if (!d.esCartera && d.modelo) nodos.push(detalleModelo(d));
  if (d.esCartera) nodos.push(h("p", { class: "suave pequeno" }, "Elige un ETF en el desplegable para ver cómo se ha calculado su previsión."));
  return nodos;
}

function detalleModelo(d) {
  const m = d.modelo;
  const filas = Object.entries(m.variables || {}).map(([k, v]) => h("tr", {}, h("td", {}, NOMBRE_VARIABLE[k] || k), h("td", { class: "num" }, num(v, 4)),
    h("td", { class: "num" }, num((m.coeficientes?.[k] || 0) * v * 100, 3) + " %")));
  return h("details", {}, h("summary", {}, "Cómo se ha calculado"),
    h("ul", { class: "pequeno" },
      h("li", {}, `Volatilidad prevista para hoy (GARCH): ${num(m.volatilidad_dia_pct, 2)} % en un día.`),
      h("li", {}, `Rentabilidad esperada desde las 7:30: ${pct(m.rentabilidad_esperada_pct, 3)}. Peso del modelo frente a "no cambia": ${Math.round((m.pesos?.modelo || 0) * 100)} % / ${Math.round((m.pesos?.ingenuo || 0) * 100)} %.`),
      h("li", {}, m.indicador ? `Fuera del horario de Xetra se estima con ${m.indicador} (beta ${num(m.beta_indicador, 2)}, calculada con ${m.pares_beta} horas).` : "Fuera del horario de Xetra no hay indicador: se mantiene el último precio."),
      h("li", {}, `Ancho de la banda ajustado ×${num(m.escala_banda, 2)} según los aciertos pasados. Días aprendidos: ${m.dias_aprendidos}.`)),
    h("table", { class: "pequeno" }, h("tr", {}, h("th", {}, "Variable"), h("th", { class: "num" }, "Valor hoy"), h("th", { class: "num" }, "Aporta")), filas),
    d.historial?.length ? h("p", { class: "suave pequeno" }, "Últimos días evaluados: " + d.historial.slice(-5).map((x) =>
      `${fecha(x.fecha)} (error ${num(Math.sqrt(x.mse_modelo) * 100, 2)} % vs ${num(Math.sqrt(x.mse_ingenuo) * 100, 2)} % sin cambio)`).join(" · ")) : null);
}
