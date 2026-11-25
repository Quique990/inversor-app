// Predicción intradía en el navegador: combina la previsión pública de cada ETF (web/data/intradia.json)
// con TUS participaciones para dar la previsión de la cartera completa. Funciones puras (sin DOM ni red).

/** σ (en log) implícita en una banda inf/sup alrededor del esperado. */
const sigmaDe = (p, z) => (p && p.sup > 0 && p.esperado > 0 ? Math.log(p.sup / p.esperado) / z : 0);

export function activoPorIsin(intradia) {
  const m = {};
  for (const a of Object.values(intradia?.activos || {})) if (a.isin) m[a.isin] = a;
  return m;
}

function correlacion(intradia, a, b) {
  if (a === b) return 1;
  const c = intradia?.correlaciones;
  const i = c?.ids?.indexOf(a), j = c?.ids?.indexOf(b);
  const v = i >= 0 && j >= 0 ? c.matriz[i]?.[j] : null;
  return typeof v === "number" ? v : 0.6; // si no se conoce, correlación moderada (prudente)
}

/**
 * Une la previsión pública (ETF del universo) con la privada (tus activos fuera del universo, calculada en tu
 * repositorio privado). Solo se usa la privada si es del mismo día que la pública (o si no hay pública).
 * Las correlaciones entre un activo público y uno privado no se conocen: quedan a null (se usa 0,6).
 */
export function fusionarIntradia(publico, privado) {
  if (!privado?.activos || !Object.keys(privado.activos).length) return publico || null;
  if (!publico?.activos) return privado;
  if (privado.fecha !== publico.fecha) return publico;
  // Un ISIN calculado en tu repositorio privado sustituye a su versión pública (se actualiza con más puntualidad)
  const isinsPrivados = new Set(Object.values(privado.activos).map((a) => a.isin));
  const activos = Object.fromEntries(Object.entries(publico.activos).filter(([, a]) => !isinsPrivados.has(a.isin)));
  for (const [id, a] of Object.entries(privado.activos)) if (!activos[id]) activos[id] = { ...a, privado: true };
  const cp = publico.correlaciones || { ids: [], matriz: [] }, cq = privado.correlaciones || { ids: [], matriz: [] };
  const ids = [...cp.ids, ...cq.ids.filter((x) => !cp.ids.includes(x))];
  const matriz = ids.map((a) => ids.map((b) => {
    if (a === b) return 1;
    for (const c of [cp, cq]) {
      const i = c.ids.indexOf(a), j = c.ids.indexOf(b);
      if (i >= 0 && j >= 0) return c.matriz[i]?.[j] ?? null;
    }
    return null;
  }));
  return { ...publico, activos, correlaciones: { ids, matriz }, privadoGenerado: privado.generado };
}

/** Combina trayectorias {hora, esperado, inf, sup} ponderadas por participaciones; la banda usa las correlaciones. */
function combinarTrayectorias(intradia, partes, fijo, campo) {
  const z = intradia.z || 1.2816;
  const horas = intradia.horas || [];
  const salida = [];
  for (const hora of horas) {
    let v = fijo, ok = true;
    const comp = [];
    for (const { a, n } of partes) {
      const p = a[campo]?.find((x) => x.hora === hora);
      if (!p) { ok = false; break; }
      v += n * p.esperado;
      comp.push({ id: a.id, s: n * p.esperado * sigmaDe(p, z) });
    }
    if (!ok || !partes.length) continue;
    let var2 = 0;
    for (const x of comp) for (const y of comp) var2 += x.s * y.s * correlacion(intradia, x.id, y.id);
    const s = v > 0 ? Math.sqrt(var2) / v : 0;
    salida.push({ hora, esperado: v, inf: v * Math.exp(-z * s), sup: v * Math.exp(z * s) });
  }
  return salida;
}

/**
 * Previsión del valor de la cartera hoy, hora a hora.
 * @param intradia contenido de intradia.json
 * @param pos posiciones de finanzas.calcularPosiciones (participaciones y valor por ISIN)
 */
export function prediccionCartera(intradia, pos) {
  const porIsin = activoPorIsin(intradia);
  const partes = [];
  let fijo = 0;
  const sinPrediccion = [];
  for (const p of Object.values(pos || {})) {
    if (!(p.participaciones > 1e-9)) continue;
    const a = porIsin[p.isin];
    if (a) partes.push({ a, n: p.participaciones });
    else { fijo += p.valor ?? p.costeVivo ?? 0; sinPrediccion.push(p.isin); }
  }
  if (!partes.length) return null;
  // Lo que lleva la cartera hoy, hasta la última hora con algún dato. Si a un activo le falta esa hora (p. ej. tus
  // activos privados se actualizan en otro momento que los públicos), se usa su último valor conocido y la hora
  // cuenta como "estimado". Es "real" solo si todos los activos tienen precio real en esa hora.
  const actual = [];
  const horas = intradia.horas || [];
  const ultimaHora = Math.max(-1, ...partes.map(({ a }) => horas.indexOf(a.actual?.at(-1)?.hora)));
  for (let k = 0; k <= ultimaHora; k++) {
    const hora = horas[k];
    let v = fijo, estimado = false, ok = true;
    for (const { a, n } of partes) {
      const previos = (a.actual || []).filter((q) => horas.indexOf(q.hora) <= k);
      const x = previos.at(-1);
      if (!x) { ok = false; break; }
      v += n * x.valor;
      if (x.tipo !== "real" || x.hora !== hora) estimado = true;
    }
    if (ok) actual.push({ hora, valor: v, tipo: estimado ? "estimado" : "real" });
  }
  // Calidad: media ponderada por valor de la mejora de cada ETF
  let pesoTotal = 0, mejora = 0, cobertura = 0, dias = Infinity;
  for (const { a, n } of partes) {
    const q = a.calidad || {};
    const w = n * (a.ancla?.valor || 0);
    if (q.dias > 0 && q.mejora_pct !== null && q.mejora_pct !== undefined) {
      pesoTotal += w; mejora += w * q.mejora_pct; cobertura += w * (q.cobertura_pct || 0); dias = Math.min(dias, q.dias);
    } else dias = 0;
  }
  return {
    horas: intradia.horas, fecha: intradia.fecha,
    plan: combinarTrayectorias(intradia, partes, fijo, "plan"),
    prevision: combinarTrayectorias(intradia, partes, fijo, "prevision"),
    actual, sinPrediccion, incluidos: partes.map(({ a }) => a.id),
    calidad: pesoTotal > 0 ? { dias: dias === Infinity ? 0 : dias, mejora_pct: mejora / pesoTotal, cobertura_pct: cobertura / pesoTotal } : { dias: 0 },
  };
}

/** Resumen en lenguaje llano de la calidad del modelo. */
export function textoCalidad(q) {
  if (!q || !q.dias) return "Todavía no hay días evaluados: el modelo empieza a aprender a partir de mañana.";
  const base = q.dias < 10 ? ` Aún son pocos días (${q.dias}) para sacar conclusiones.` : "";
  const m = q.mejora_pct;
  const comp = m === null || m === undefined ? "" : m >= 1 ? `la línea esperada falló un ${m.toFixed(0)} % menos que suponer que el precio no cambia`
    : m <= -1 ? `la línea esperada falló un ${(-m).toFixed(0)} % MÁS que suponer que el precio no cambia (el sistema le irá quitando peso)`
      : "la línea esperada acertó prácticamente igual que suponer que el precio no cambia";
  return `En los últimos ${q.dias} días, ${comp}. La banda contuvo el precio real el ${Math.round(q.cobertura_pct ?? 0)} % de las horas (objetivo: 80 %).${base}`;
}

export const NOMBRE_VARIABLE = {
  constante: "Tendencia de fondo", geopolitica: "Tono geopolítico del día", vix: "Cambio del miedo (VIX)",
  nocturno: "Movimiento durante la noche", ayer: "Rentabilidad de ayer",
};
