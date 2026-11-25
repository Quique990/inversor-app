// Cálculos de la cartera: posiciones (FIFO), ganancia por compra, TIR (XIRR), histórico y
// eficacia de las compras tácticas. Funciones puras: se pueden testear con Node (tests/web).

export const DIA = 86400000;
const t = (iso) => new Date(iso + "T12:00:00Z").getTime();

// ---------------------------------------------------------------- precios
/** Índice isin -> {puntos:[[fecha,valor]], ultimo:[fecha,valor], moneda, intradia?} a partir de los datos públicos y
 * privados. Si hay previsión intradía del día (se actualiza cada hora), su último valor es el precio actual: el
 * cierre diario solo se descarga una vez al día y con mercados moviéndose la rentabilidad quedaría desfasada. */
export function indicePrecios(precios, universo, activos = {}, intradia = null) {
  const idx = {};
  const uni = universo || { series: {}, info: {}, ultimo: {} };
  for (const [id, info] of Object.entries(uni.info || {})) {
    if (!info.isin || !uni.series[id]) continue;
    idx[info.isin] = { puntos: uni.series[id], ultimo: uni.ultimo?.[id] || uni.series[id].at(-1), moneda: info.moneda || "EUR" };
  }
  for (const [clave, s] of Object.entries(precios?.series || {})) {
    if (clave.startsWith("__")) continue;
    idx[clave] = { puntos: unirPuntos(s.puntos, s.diario), ultimo: s.ultimo || s.puntos.at(-1), moneda: s.moneda || "EUR" };
  }
  for (const [isin, a] of Object.entries(activos)) {
    const m = a.precioManual;
    if (m && m.valor > 0 && (!idx[isin] || m.fecha >= idx[isin].ultimo[0])) {
      idx[isin] = { puntos: [...(idx[isin]?.puntos || []), [m.fecha, m.valor]], ultimo: [m.fecha, m.valor], moneda: "EUR", manual: true };
    }
  }
  for (const a of Object.values(intradia?.activos || {})) {
    const u = a.actual?.at(-1);
    if (!a.isin || !u || !(u.valor > 0) || !intradia.fecha) continue;
    const base = idx[a.isin];
    if (base && base.ultimo?.[0] > intradia.fecha) continue; // hay un dato más reciente (p. ej. precio manual)
    idx[a.isin] = { puntos: [], moneda: "EUR", ultimo: [intradia.fecha, u.valor], ...base,
      intradia: { fecha: intradia.fecha, hora: u.hora, valor: u.valor, tipo: u.tipo } }; // valores ya en euros
  }
  const fx = precios?.series?.__EURUSD?.puntos || uni.series?.EURUSD || null;
  idx.__EURUSD = fx;
  idx.__EURGBP = precios?.series?.__EURGBP?.puntos || null; // libras por euro (solo si tienes algo en libras)
  return idx;
}

/** De dónde sale el precio actual de un activo, para enseñarlo al usuario. */
export function fuentePrecio(idx, isin) {
  const p = idx[isin];
  if (!p) return null;
  if (p.intradia) return { fecha: p.intradia.fecha, hora: p.intradia.hora, tipo: p.intradia.tipo === "real" ? "real" : "estimado" };
  return { fecha: p.ultimo?.[0], hora: null, tipo: p.manual ? "manual" : "cierre" };
}

/** Une la serie semanal con los precios diarios recientes (sin fechas repetidas, ordenado). */
function unirPuntos(semanal = [], diario = []) {
  if (!diario?.length) return semanal;
  const m = new Map(semanal);
  for (const [f, v] of diario) m.set(f, v);
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}

function valorEn(puntos, fecha) {
  // Último valor con fecha <= fecha (búsqueda binaria)
  if (!puntos || !puntos.length || puntos[0][0] > fecha) return null;
  let lo = 0, hi = puntos.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (puntos[m][0] <= fecha) lo = m; else hi = m - 1; }
  return puntos[lo][1];
}

export function precioEUR(idx, isin, fecha = null) {
  const p = idx[isin];
  if (!p) return null;
  if (!fecha && p.intradia) return p.intradia.valor;
  const v = fecha ? valorEn(p.puntos, fecha) : p.ultimo?.[1];
  if (v === null || v === undefined) return null;
  if (p.moneda === "USD" && idx.__EURUSD) {
    const fx = fecha ? valorEn(idx.__EURUSD, fecha) : idx.__EURUSD.at(-1)[1];
    return fx ? v / fx : v;
  }
  if (p.moneda === "GBp" || p.moneda === "GBP") {
    const libras = p.moneda === "GBp" ? v / 100 : v; // GBp = peniques
    const fx = idx.__EURGBP ? (fecha ? valorEn(idx.__EURGBP, fecha) : idx.__EURGBP.at(-1)[1]) : null;
    return fx ? libras / fx : libras;
  }
  return v;
}

// ---------------------------------------------------------------- posiciones FIFO
export function calcularPosiciones(operaciones, idx) {
  const ops = [...operaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pos = {};
  for (const op of ops) {
    const p = (pos[op.isin] ||= { isin: op.isin, lotes: [], realizado: 0, dividendos: 0, comisiones: 0, aportadoNeto: 0 });
    const com = Number(op.comision || 0);
    p.comisiones += com;
    if (op.tipo === "compra") {
      const coste = Number(op.importe) + com;
      p.lotes.push({ id: op.id, fecha: op.fecha, participaciones: Number(op.participaciones), restantes: Number(op.participaciones),
        precio: Number(op.precio), coste, origen: op.origen || "manual" });
      p.aportadoNeto += coste;
    } else if (op.tipo === "venta") {
      let quedan = Number(op.participaciones);
      const ingreso = Number(op.importe) - com;
      const precioNetoUnit = ingreso / quedan;
      p.aportadoNeto -= ingreso;
      for (const l of p.lotes) {
        if (quedan <= 1e-12) break;
        if (l.restantes <= 1e-12) continue;
        const usa = Math.min(l.restantes, quedan);
        const costeUnit = l.coste / l.participaciones;
        p.realizado += usa * (precioNetoUnit - costeUnit);
        l.restantes -= usa;
        quedan -= usa;
      }
    } else if (op.tipo === "dividendo") {
      p.dividendos += Number(op.importe) - com;
      p.aportadoNeto -= Number(op.importe) - com;
    }
  }
  const hoy = new Date().toISOString().slice(0, 10);
  for (const p of Object.values(pos)) {
    const precio = precioEUR(idx, p.isin);
    p.precioActual = precio;
    p.participaciones = p.lotes.reduce((s, l) => s + l.restantes, 0);
    p.costeVivo = p.lotes.reduce((s, l) => s + (l.coste / l.participaciones) * l.restantes, 0);
    p.valor = precio === null ? null : p.participaciones * precio;
    p.latente = p.valor === null ? null : p.valor - p.costeVivo;
    p.latentePct = p.valor === null || !p.costeVivo ? null : (p.valor / p.costeVivo - 1) * 100;
    for (const l of p.lotes) {
      const costeVivo = (l.coste / l.participaciones) * l.restantes;
      l.valor = precio === null ? null : l.restantes * precio;
      l.ganancia = l.valor === null ? null : l.valor - costeVivo;
      l.gananciaPct = l.valor === null || !costeVivo ? null : (l.valor / costeVivo - 1) * 100;
      const anos = Math.max((t(hoy) - t(l.fecha)) / (365.25 * DIA), 1 / 365);
      l.anualizada = l.gananciaPct === null || anos < 0.25 ? null : (Math.pow(l.valor / costeVivo, 1 / anos) - 1) * 100;
    }
  }
  return pos;
}

export function resumenCartera(pos) {
  const lista = Object.values(pos);
  const valor = lista.reduce((s, p) => s + (p.valor ?? p.costeVivo), 0);
  const coste = lista.reduce((s, p) => s + p.costeVivo, 0);
  const realizado = lista.reduce((s, p) => s + p.realizado + p.dividendos, 0);
  const sinPrecio = lista.filter((p) => p.valor === null && p.participaciones > 1e-9).map((p) => p.isin);
  return { valor, coste, latente: valor - coste, latentePct: coste ? (valor / coste - 1) * 100 : null, realizado, sinPrecio };
}

// ---------------------------------------------------------------- TIR (XIRR)
export function xirr(flujos) {
  // flujos: [{fecha, importe}] con al menos un negativo y un positivo. Devuelve % anual o null.
  if (flujos.length < 2 || !flujos.some((f) => f.importe < 0) || !flujos.some((f) => f.importe > 0)) return null;
  const t0 = t(flujos[0].fecha);
  const vpn = (r) => flujos.reduce((s, f) => s + f.importe / Math.pow(1 + r, (t(f.fecha) - t0) / (365 * DIA)), 0);
  let lo = -0.9999, hi = 10;
  let flo = vpn(lo), fhi = vpn(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2, fm = vpn(m);
    if (Math.abs(fm) < 1e-7) return m * 100;
    if (flo * fm < 0) { hi = m; fhi = fm; } else { lo = m; flo = fm; }
  }
  return ((lo + hi) / 2) * 100;
}

export function tirCartera(operaciones, valorActual, hoy = new Date().toISOString().slice(0, 10)) {
  const f = operaciones.map((o) => ({
    fecha: o.fecha,
    importe: o.tipo === "compra" ? -(Number(o.importe) + Number(o.comision || 0))
      : (Number(o.importe) - Number(o.comision || 0)),
  })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!f.length) return null;
  // Con menos de ~3 meses la TIR anualizada no tiene sentido
  if (t(hoy) - t(f[0].fecha) < 90 * DIA) return null;
  f.push({ fecha: hoy, importe: valorActual });
  return xirr(f);
}

// ---------------------------------------------------------------- histórico para la gráfica
/** Fecha ISO `dias` días antes de `hoy`. */
export const restarDias = (hoy, dias) => new Date(t(hoy) - dias * DIA).toISOString().slice(0, 10);

/**
 * Valor de la cartera y dinero aportado en el tiempo.
 * @param desde  primera fecha que se devuelve (null = desde la primera operación). El aportado se acumula igual desde el principio.
 * @param pasoDias  1 = un punto por día laborable; 7 = semanal.
 */
export function historico(operaciones, idx, hoy = new Date().toISOString().slice(0, 10), { desde = null, pasoDias = 7 } = {}) {
  if (!operaciones.length) return [];
  const ops = [...operaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const inicio = desde && desde > ops[0].fecha ? desde : ops[0].fecha;
  // Fechas: cada `pasoDias` desde el inicio + cada fecha de operación + hoy (sin fines de semana si es diario)
  const fechas = new Set(ops.map((o) => o.fecha).filter((f) => f >= inicio));
  for (let d = t(inicio); d <= t(hoy); d += pasoDias * DIA) {
    const dia = new Date(d).getUTCDay();
    if (pasoDias === 1 && (dia === 0 || dia === 6)) continue;
    fechas.add(new Date(d).toISOString().slice(0, 10));
  }
  fechas.add(inicio);
  fechas.add(hoy);
  const orden = [...fechas].sort();
  const participaciones = {};
  let aportado = 0, i = 0;
  const salida = [];
  for (const f of orden) {
    if (f > hoy) continue;
    while (i < ops.length && ops[i].fecha <= f) {
      const o = ops[i++];
      const n = Number(o.participaciones || 0);
      if (o.tipo === "compra") { participaciones[o.isin] = (participaciones[o.isin] || 0) + n; aportado += Number(o.importe) + Number(o.comision || 0); }
      if (o.tipo === "venta") { participaciones[o.isin] = (participaciones[o.isin] || 0) - n; aportado -= Number(o.importe) - Number(o.comision || 0); }
    }
    let valor = 0, completo = true;
    for (const [isin, n] of Object.entries(participaciones)) {
      if (n <= 1e-12) continue;
      const p = f === hoy ? precioEUR(idx, isin) : precioEUR(idx, isin, f);
      if (p === null) { completo = false; continue; }
      valor += n * p;
    }
    salida.push({ fecha: f, valor, aportado, completo });
  }
  return salida;
}

/** Ganancia en un periodo: lo que ha cambiado el valor menos lo que has metido (o sacado) en ese tiempo. */
export function gananciaPeriodo(puntos) {
  if (!puntos || puntos.length < 2) return null;
  const a = puntos[0], b = puntos.at(-1);
  const ganancia = (b.valor - a.valor) - (b.aportado - a.aportado);
  const base = a.valor + Math.max(0, b.aportado - a.aportado);
  return { ganancia, pct: base > 0 ? (ganancia / base) * 100 : null };
}

// ---------------------------------------------------------------- ¿sirven las señales?
/** Compara el precio de cada compra "extra" con el precio medio de las compras del plan del mismo
 * activo en una ventana de ±90 días. Positivo = la compra extra fue más barata que el plan. */
export function eficaciaSenales(operaciones) {
  const compras = operaciones.filter((o) => o.tipo === "compra" && Number(o.participaciones) > 0);
  const extras = compras.filter((o) => o.origen === "extra");
  const filas = [];
  for (const e of extras) {
    const plan = compras.filter((o) => o.origen === "plan" && o.isin === e.isin && Math.abs(t(o.fecha) - t(e.fecha)) <= 90 * DIA);
    if (!plan.length) continue;
    const precioPlan = plan.reduce((s, o) => s + Number(o.importe), 0) / plan.reduce((s, o) => s + Number(o.participaciones), 0);
    const precioExtra = Number(e.importe) / Number(e.participaciones);
    filas.push({ fecha: e.fecha, isin: e.isin, importe: Number(e.importe), precioExtra, precioPlan,
      ventajaPct: (precioPlan / precioExtra - 1) * 100 });
  }
  const total = filas.reduce((s, f) => s + f.importe, 0);
  const media = total ? filas.reduce((s, f) => s + f.ventajaPct * f.importe, 0) / total : null;
  return { filas, ventajaMediaPct: media, n: filas.length };
}

export function esApalancado(nombre = "") {
  return /(\b[2-5]x\b|\bx[2-5]\b|leverag|lev\b|ultra|daily|short|inverse|bear|bull\b|apalanc)/i.test(nombre);
}
