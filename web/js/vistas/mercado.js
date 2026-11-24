import { claseSigno, eur, fecha, h, num, pct, tarjeta } from "../dom.js";
import { lineas } from "../graficas.js";
import { NOMBRE_POSTURA } from "./hoy.js";

const ETIQUETA_METRICA = {
  caida_52s: ["Bolsa mundial desde máximos", (v) => pct(v)], vix: ["VIX", (v) => num(v, 1)], vstoxx: ["VSTOXX", (v) => num(v, 1)],
  brent_3m: ["Brent (3 meses)", (v) => pct(v)], sahm: ["Regla de Sahm", (v) => num(v, 2)], curva_10a3m: ["Curva EE. UU. 10a-3m", (v) => `${num(v, 2)} pp`],
  high_yield: ["Diferencial high yield", (v) => `${num(v, 2)} pp`], ipc_eeuu: ["Inflación EE. UU.", (v) => pct(v, 1, false)],
  ipca_euro: ["Inflación eurozona", (v) => pct(v, 1, false)], tipo_bce: ["Tipo depósito BCE", (v) => pct(v, 2, false)], gpr: ["Riesgo geopolítico (GPR)", (v) => num(v, 0)],
};

export function render({ S }) {
  const { mercado: m, universo: u, backtest: bt, salud, indice } = S.publico;
  const nodos = [];
  if (!m) return [tarjeta("Sin datos de mercado", h("p", {}, "Todavía no se ha ejecutado el análisis diario."))];

  // Macro
  const met = m.decision.metricas;
  nodos.push(tarjeta("Termómetro macro",
    h("table", {}, Object.entries(ETIQUETA_METRICA).filter(([k]) => met[k] !== null && met[k] !== undefined)
      .map(([k, [n, f]]) => h("tr", {}, h("td", {}, n), h("td", { class: "num" }, f(met[k]))))),
    h("p", { class: "suave pequeno" }, `Regla de Sahm ≥ 0,5 = recesión en EE. UU. · Curva negativa = aviso de recesión a 1-2 años · GPR media últimos 12 meses: ${num(met.gpr_media_1a, 0)}`)));

  // Activos
  const filas = Object.entries(m.activos || {}).filter(([, a]) => a.ultimo !== undefined);
  nodos.push(tarjeta("Activos",
    h("div", { class: "tabla-scroll" }, h("table", {},
      h("tr", {}, h("th", {}, "Activo"), h("th", { class: "num" }, "Último"), h("th", { class: "num" }, "1 mes"), h("th", { class: "num" }, "1 año"), h("th", { class: "num" }, "Desde máx.")),
      filas.map(([id, a]) => h("tr", {},
        h("td", {}, id, a.sobre_mm200 === false ? h("span", { class: "chip i2", title: "Por debajo de la media de 200 sesiones" }, "< MM200") : null,
          h("div", { class: "suave pequeno" }, a.nombre || "")),
        h("td", { class: "num" }, num(a.ultimo, 2)), h("td", { class: `num ${claseSigno(a.var_1m)}` }, pct(a.var_1m)),
        h("td", { class: `num ${claseSigno(a.var_1a)}` }, pct(a.var_1a)), h("td", { class: "num" }, pct(a.caida_max_52s))))))));

  // Gráfica de un activo
  if (u?.series) {
    const sel = h("select", {}, Object.keys(u.series).map((k) => h("option", { value: k, selected: k === "VWCE" }, `${k} · ${u.info?.[k]?.nombre || ""}`)));
    const caja = h("div");
    const pintar = () => {
      const s = u.series[sel.value] || [];
      caja.replaceChildren(lineas(s.map((p) => p[0]), [{ nombre: sel.value, valores: s.map((p) => p[1]) }], { baja: true }));
    };
    sel.addEventListener("change", pintar);
    pintar();
    nodos.push(tarjeta("Gráfica (semanal)", sel, caja));
  }

  // Histórico de posturas
  if (indice?.length > 1) {
    nodos.push(tarjeta("Puntuación de oportunidad (histórico)",
      lineas(indice.map((x) => x.fecha), [{ nombre: "Puntuación", valores: indice.map((x) => x.puntuacion) }], { baja: true }),
      h("p", { class: "suave pequeno" }, indice.slice(-5).reverse().map((x) => `${fecha(x.fecha)}: ${NOMBRE_POSTURA[x.postura] || x.postura}`).join(" · "))));
  }

  // Backtest
  if (bt && !bt.error && bt.valor_plan_puro) {
    const gana = bt.diferencia_pct > 0;
    nodos.push(tarjeta("¿Funciona la parte táctica? (backtest)",
      h("p", {}, `Con ${bt.activo} desde ${fecha(bt.desde)} y 100 €/mes: plan puro ${eur(bt.valor_plan_puro)} frente a plan + reserva táctica del ${bt.parametros.pct_reserva * 100} % ${eur(bt.valor_plan_tactico)} (`,
        h("strong", { class: claseSigno(bt.diferencia_pct) }, pct(bt.diferencia_pct)), `, ${bt.num_disparos} compras tácticas).`),
      h("div", { class: `aviso ${gana ? "verde" : "azul"}` }, gana
        ? "En el histórico, guardar una parte para invertirla en las caídas ha sumado algo de rentabilidad."
        : "En el histórico, guardar dinero esperando caídas NO ha mejorado al plan puro: el tiempo invertido pesa más. Por eso la app no te pide retener tu plan; solo te avisa de cuándo usar ahorro que ya tenías fuera (medio plazo) para una aportación extra."),
      bt.variantes?.length ? h("p", { class: "suave pequeno" }, "Otras reservas: " + bt.variantes.map((v) => `${v.pct_reserva * 100} % → ${pct(v.diferencia_pct)}`).join(" · ")) : null,
      h("p", { class: "suave pequeno" }, bt.nota)));
  }

  // Titulares
  nodos.push(tarjeta(`Titulares (${m.num_titulares})`,
    h("ul", { class: "lista-titulares" }, (m.titulares || []).slice(0, 40).map((t) =>
      h("li", {}, h("a", { href: t.url, target: "_blank", rel: "noopener noreferrer" }, t.titulo), h("span", { class: "suave" }, ` · ${t.fuente}`))))));

  // Salud de fuentes
  if (salud) {
    nodos.push(tarjeta("Estado de las fuentes",
      h("p", {}, `${salud.total_ok} fuentes OK · ${salud.total_fallos} con fallos · ${fecha(salud.fecha)}`),
      salud.total_fallos ? h("details", {}, h("summary", {}, "Ver fallos"), h("ul", { class: "pequeno" }, Object.entries(salud.fallos).map(([k, v]) => h("li", {}, `${k}: ${v}`)))) : null));
  }
  return nodos;
}
