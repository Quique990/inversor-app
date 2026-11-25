import { abrirModal, campo, cerrarModal, descargar, h, hoyISO, parseNumero, tarjeta, toast } from "../dom.js";
import * as store from "../store.js";
import { calcularPerfil, HUECOS, PERFILES, PREGUNTAS, ROL_A_HUECO } from "../perfil.js";

export function render(ctx) {
  const { S } = ctx;
  const p = S.privado.perfil;
  const cfg = store.leerConfig();
  const nodos = [];

  nodos.push(tarjeta(null, h("p", { style: { margin: 0 } }, "¿Quieres saber qué hace la app y cómo decide? ", h("a", { href: "#/como" }, "Cómo funciona"))));

  // Conexión
  nodos.push(tarjeta("Dónde se guardan tus datos",
    cfg.modo === "github"
      ? h("p", {}, "Repositorio privado: ", h("strong", {}, `${cfg.owner}/${cfg.repo}`), cfg.tokenCifrado ? " · clave cifrada con PIN" : " · clave sin PIN")
      : h("div", { class: "aviso" }, "Modo local: los datos solo están en este navegador. Conecta tu repositorio privado para tenerlos a salvo y en todos tus dispositivos."),
    S.errores.length ? h("div", { class: "aviso rojo" }, "Errores al cargar: " + S.errores.join(" · ")) : null,
    h("div", { class: "fila" }, h("button", { onclick: () => modalConexion(ctx) }, cfg.modo === "github" ? "Cambiar conexión" : "Conectar GitHub"),
      cfg.modo === "github" ? h("button", { class: "sec", onclick: () => { store.usarModoLocal(); location.reload(); } }, "Pasar a modo local") : null)));

  // Perfil
  nodos.push(tarjeta("Perfil de riesgo",
    p.perfil ? h("div", {},
      h("p", {}, "Tu perfil: ", h("strong", {}, p.perfil.nombre), ` (${p.perfil.puntos} puntos)`), h("p", { class: "suave pequeno" }, p.perfil.descripcion),
      p.perfil.limites?.length ? h("div", { class: "aviso" }, "Perfil limitado por: " + p.perfil.limites.join("; ")) : null,
      h("table", {}, Object.entries(p.asignacion || {}).map(([k, v]) => h("tr", {}, h("td", {}, HUECOS[k]?.nombre || k), h("td", { class: "num" }, `${v} %`)))))
      : h("p", {}, "Aún no has hecho el test. Con él la app sabe qué reparto de cartera te corresponde."),
    h("div", { class: "fila" }, h("button", { onclick: () => modalTest(ctx) }, p.perfil ? "Repetir test" : "Hacer test"),
      p.asignacion ? h("button", { class: "sec", onclick: () => modalAsignacion(ctx) }, "Ajustar reparto") : null)));

  // ETF por hueco
  const info = S.publico.universo?.info || {};
  nodos.push(tarjeta("ETF de cada hueco",
    h("p", { class: "suave pequeno" }, "Dónde van tus aportaciones. Comprueba en Trade Republic que el ETF admite plan de inversión."),
    ...Object.entries(HUECOS).map(([k, hu]) => {
      const opciones = Object.values(info).filter((i) => i.isin && ROL_A_HUECO[i.rol] === k);
      const sel = h("select", {}, opciones.map((i) => h("option", { value: i.isin, selected: (p.huecos?.[k] || hu.etfPorDefecto) === i.isin }, `${i.nombre} (TER ${i.ter ?? "?"} %)`)));
      sel.addEventListener("change", async () => { p.huecos = { ...(p.huecos || {}), [k]: sel.value }; await ctx.guardar("perfil", `ETF para ${k}`); });
      return campo(hu.nombre, sel);
    })));

  // Plan
  const pl = p.plan;
  const f = {
    aportacionMensual: h("input", { inputmode: "decimal", value: pl.aportacionMensual }),
    dia: h("input", { inputmode: "numeric", value: pl.dia }),
    maxExtraMes: h("input", { inputmode: "decimal", value: pl.maxExtraMes }),
    minOrdenManual: h("input", { inputmode: "decimal", value: pl.minOrdenManual }),
    comision: h("input", { inputmode: "decimal", value: pl.comision }),
    colchonMinimo: h("input", { inputmode: "decimal", value: pl.colchonMinimo }),
  };
  nodos.push(tarjeta("Tu plan",
    h("div", { class: "form2" }, campo("Aportación mensual del plan (€)", f.aportacionMensual), campo("Día del mes", f.dia),
      campo("Máximo extra en un mes (€)", f.maxExtraMes), campo("Mínimo para orden manual (€)", f.minOrdenManual),
      campo("Comisión orden manual (€)", f.comision), campo("Colchón mínimo corto+medio (€)", f.colchonMinimo)),
    h("p", { class: "suave pequeno" }, "Con órdenes manuales de 1 €, por debajo de 100 € la comisión supera el 1 %: en ese caso la app te propone subir el plan ese mes (gratis). El colchón evita que una señal te haga invertir dinero que podrías necesitar."),
    h("button", { onclick: async () => {
      for (const [k, i] of Object.entries(f)) pl[k] = parseNumero(i.value) || 0;
      await ctx.guardar("perfil", "Actualizar plan"); ctx.refrescar();
    } }, "Guardar plan")));

  // Copias
  nodos.push(tarjeta("Copia de seguridad",
    h("div", { class: "fila" },
      h("button", { class: "sec", onclick: () => descargar(`inversor-copia-${hoyISO()}.json`, new Blob([JSON.stringify(store.exportarCopia(), null, 1)], { type: "application/json" })) }, "Descargar copia (JSON)"),
      h("button", { class: "sec", onclick: () => importarCopia(ctx) }, "Restaurar copia")),
    h("p", { class: "suave pequeno" }, "Con GitHub conectado, cada cambio queda además en el historial de commits del repositorio privado.")));

  nodos.push(tarjeta("Este dispositivo",
    h("button", { class: "peligro", onclick: () => { if (confirm("Se borrarán la clave y la caché de ESTE dispositivo (no el repositorio).")) { store.olvidarTodo(); location.reload(); } } }, "Olvidar este dispositivo"),
    h("p", { class: "suave pequeno" }, "Herramienta personal de apoyo a la decisión. No es asesoramiento financiero: las decisiones de inversión son tuyas. Rentabilidades pasadas no garantizan rentabilidades futuras.")));
  return nodos;
}

function modalConexion(ctx) {
  const cfg = store.leerConfig();
  const owner = h("input", { value: cfg.owner || "", placeholder: "tu-usuario", autocapitalize: "none" });
  const repo = h("input", { value: cfg.repo || "inversor-datos", autocapitalize: "none" });
  const token = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" });
  const pin = h("input", { type: "password", inputmode: "numeric", placeholder: "Opcional, recomendado" });
  const pin2 = h("input", { type: "password", inputmode: "numeric", placeholder: "Repite el PIN" });
  const estado = h("p", { class: "pequeno" });
  abrirModal(h("h2", {}, "Conectar repositorio privado"),
    h("ol", { class: "pequeno" },
      h("li", {}, "En GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token."),
      h("li", {}, "Repository access: Only select repositories → solo tu repositorio de datos (privado)."),
      h("li", {}, "Permissions → Contents: Read and write. Nada más."),
      h("li", {}, "Caducidad: la máxima que te deje; cuando caduque, crea otra y pégala aquí.")),
    h("div", { class: "form2" }, campo("Usuario de GitHub", owner), campo("Repositorio de datos", repo)),
    campo("Clave (fine-grained token)", token), h("div", { class: "form2" }, campo("PIN", pin), campo("Confirmar PIN", pin2)),
    h("p", { class: "suave pequeno" }, "Con PIN, la clave se guarda cifrada (AES-256) y te la pedirá al abrir la app."), estado,
    h("div", { class: "fila" }, h("button", { onclick: async () => {
      if (pin.value !== pin2.value) { estado.textContent = "Los PIN no coinciden."; return; }
      if (pin.value && pin.value.length < 4) { estado.textContent = "El PIN debe tener al menos 4 cifras."; return; }
      if (!owner.value || !repo.value || !token.value) { estado.textContent = "Rellena usuario, repositorio y clave."; return; }
      estado.textContent = "Probando…";
      await store.configurarGithub({ owner: owner.value, repo: repo.value, token: token.value, pin: pin.value || null });
      try {
        const r = await store.probarConexion();
        if (!r.privado) { estado.textContent = `⚠ ${r.nombre} es PÚBLICO. Tus datos serían visibles: hazlo privado antes de seguir.`; return; }
        toast(`Conectado a ${r.nombre}`);
        // Si el repositorio está vacío, sube los datos que tuvieras en modo local
        for (const n of ["perfil", "cartera", "contabilidad"]) {
          const remoto = await store.leer(n, { forzar: true });
          const local = localStorage.getItem(`inversor.datos.${n}`);
          const vacio = n === "cartera" ? !remoto.operaciones?.length : n === "contabilidad" ? !remoto.semanas?.length : !remoto.perfil;
          if (local && vacio) { ctx.S.privado[n] = JSON.parse(local); await store.guardar(n, ctx.S.privado[n], `Migrar ${n} desde el navegador`); }
        }
        cerrarModal(); location.reload();
      } catch (e) { estado.textContent = e.message; }
    } }, "Conectar"), h("button", { class: "sec", onclick: cerrarModal }, "Cancelar")));
}

function modalTest(ctx) {
  const respuestas = {};
  const preguntas = PREGUNTAS.map((q) => h("fieldset", { style: { border: 0, padding: 0, margin: "0 0 10px" } }, h("legend", { style: { fontWeight: 600 } }, q.texto),
    q.opciones.map(([t, v], i) => {
      const r = h("input", { type: "radio", name: q.id, value: v });
      r.addEventListener("change", () => (respuestas[q.id] = v));
      return h("label", { class: "opcion", for: `${q.id}-${i}` }, Object.assign(r, { id: `${q.id}-${i}` }), t);
    })));
  const error = h("p", { class: "neg pequeno" });
  abrirModal(h("h2", {}, "Test de perfil de riesgo"), ...preguntas, error,
    h("div", { class: "fila" }, h("button", { onclick: async () => {
      if (Object.keys(respuestas).length < PREGUNTAS.length) { error.textContent = "Responde todas las preguntas."; return; }
      const r = calcularPerfil(respuestas);
      const p = ctx.S.privado.perfil;
      p.cuestionario = { fecha: hoyISO(), respuestas };
      p.perfil = r;
      p.asignacion = r.asignacion;
      await ctx.guardar("perfil", `Perfil de riesgo: ${r.nombre}`);
      cerrarModal(); ctx.refrescar();
    } }, "Ver mi perfil"), h("button", { class: "sec", onclick: cerrarModal }, "Cancelar")));
}

function modalAsignacion(ctx) {
  const p = ctx.S.privado.perfil;
  const entradas = Object.fromEntries(Object.keys(HUECOS).map((k) => [k, h("input", { inputmode: "decimal", value: p.asignacion?.[k] ?? 0 })]));
  const error = h("p", { class: "neg pequeno" });
  abrirModal(h("h2", {}, "Ajustar reparto objetivo"),
    h("p", { class: "suave pequeno" }, "Referencias: " + PERFILES.map((x) => `${x.nombre} ${x.asignacion.renta_variable_global}% RV`).join(" · ")),
    ...Object.entries(entradas).map(([k, i]) => campo(`${HUECOS[k].nombre} (%)`, i)), error,
    h("div", { class: "fila" }, h("button", { onclick: async () => {
      const a = Object.fromEntries(Object.entries(entradas).map(([k, i]) => [k, parseNumero(i.value) || 0]).filter(([, v]) => v > 0));
      const suma = Object.values(a).reduce((s, v) => s + v, 0);
      if (Math.abs(suma - 100) > 0.01) { error.textContent = `Suma ${suma} %: debe sumar 100 %.`; return; }
      p.asignacion = a;
      await ctx.guardar("perfil", "Ajustar reparto"); cerrarModal(); ctx.refrescar();
    } }, "Guardar"), h("button", { class: "sec", onclick: cerrarModal }, "Cancelar")));
}

function importarCopia(ctx) {
  const f = h("input", { type: "file", accept: ".json,application/json" });
  f.addEventListener("change", async () => {
    try {
      const d = JSON.parse(await f.files[0].text());
      if (!confirm("Esto sustituye tus datos actuales por los de la copia. ¿Seguir?")) return;
      for (const n of ["perfil", "cartera", "contabilidad"]) if (d[n]) { ctx.S.privado[n] = d[n]; await ctx.guardar(n, `Restaurar ${n} desde copia`); }
      cerrarModal(); ctx.refrescar();
    } catch (e) { toast("Copia no válida: " + e.message); }
  });
  abrirModal(h("h2", {}, "Restaurar copia"), f, h("div", { class: "fila", style: { marginTop: "10px" } }, h("button", { class: "sec", onclick: cerrarModal }, "Cerrar")));
}
