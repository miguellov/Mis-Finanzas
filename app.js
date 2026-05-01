import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBRTbU4OvZlDDwts9orgEalzlnXDSGuJzw",
  authDomain: "mis-finanzasml.firebaseapp.com",
  projectId: "mis-finanzasml"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHART_COLORS = [
  "#a78bfa", "#34d399", "#fb7185", "#38bdf8", "#fbbf24",
  "#f472b6", "#2dd4bf", "#818cf8", "#fcd34d", "#c084fc", "#4ade80"
];

function formatMoney(n) {
  const x = Number(n) || 0;
  return (
    "RD$ " +
    x.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function labelMes(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es", { month: "long", year: "numeric" });
}

/** YYYY-MM del calendario local (evita desfase vs UTC a última hora del día). */
function getMesCalendarioLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMesSeleccionado() {
  const el = document.getElementById("mesFiltro");
  if (el && el.value) return el.value;
  return getMesCalendarioLocal();
}

function docMes(t) {
  if (t.mes) return t.mes;
  if (t.fecha) return t.fecha.slice(0, 7);
  return null;
}

function filtrarPorMes(datos, mes) {
  return datos.filter((t) => docMes(t) === mes);
}

const HISTORIAL_PERIODO_KEY = "finanzas_historialPeriodo";

/** Lunes 00:00 (hora local) de la semana actual. */
function inicioSemanaLunesLocal() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0, 0);
  return mon.getTime();
}

function getHistorialPeriodo() {
  const active = document.querySelector(".mov-period-btn.is-active");
  const p = active?.getAttribute("data-periodo");
  if (p === "24h" || p === "semana" || p === "mes") return p;
  return "mes";
}

function filtrarMovimientosHistorial(datos) {
  const p = getHistorialPeriodo();
  if (p === "mes") return filtrarPorMes(datos, getMesSeleccionado());
  return datos.filter((t) => {
    if (!t.fecha) return false;
    const ts = new Date(t.fecha).getTime();
    if (Number.isNaN(ts)) return false;
    if (p === "24h") return ts >= Date.now() - 24 * 60 * 60 * 1000;
    if (p === "semana") return ts >= inicioSemanaLunesLocal();
    return false;
  });
}

function storageKeySaldo(mes) {
  return "finanzas_saldoRemanente_" + mes;
}

function getSaldoRemanente(mes) {
  const raw = localStorage.getItem(storageKeySaldo(mes));
  if (raw === null || raw === "") return 0;
  const v = parseFloat(raw);
  return isNaN(v) || v < 0 ? 0 : v;
}

function cargarSaldoEnInput() {
  const mes = getMesSeleccionado();
  const raw = localStorage.getItem(storageKeySaldo(mes));
  const input = document.getElementById("saldoRemanente");
  if (!input) return;
  input.value = raw !== null && raw !== "" ? raw : "";
}

/** Para gastos: una sola elección (método); ubicación se deduce para no duplicar en el formulario. */
function cuentaDesdeMetodoPago(metodo) {
  if (metodo === "Efectivo") return "efectivo";
  if (metodo === "Debito" || metodo === "Credito" || metodo === "Transferencia") {
    return "banco";
  }
  return "";
}

let uiAudioCtx = null;

function obtenerAudioUI() {
  if (!uiAudioCtx) {
    try {
      uiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return null;
    }
  }
  return uiAudioCtx;
}

/** Pitido breve al guardar ingreso (agudo) o gasto (grave). Sin archivos externos. */
function sonidoBotonMovimiento(tipo) {
  const ctx = obtenerAudioUI();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const t0 = ctx.currentTime;
  const dur = tipo === "ingreso" ? 0.1 : 0.12;
  const freq = tipo === "ingreso" ? 784 : 311;

  const g = ctx.createGain();
  g.connect(ctx.destination);
  g.gain.setValueAtTime(0.12, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur + 0.02);

  const o = ctx.createOscillator();
  o.type = tipo === "ingreso" ? "sine" : "triangle";
  o.frequency.setValueAtTime(freq, t0);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + dur);
}

// ============================================================
// Agregar
// ============================================================
window.agregar = async function (tipo) {
  try {
    const desc = document.getElementById("descripcion").value.trim();
    const monto = parseFloat(document.getElementById("monto").value);
    const categoria = document.getElementById("categoria").value;
    const tipoGasto = document.getElementById("tipoGasto").value;
    const fuenteIngreso = document.getElementById("fuenteIngreso").value;
    const metodoPago = document.getElementById("metodoPago").value;
    const cuenta =
      tipo === "ingreso"
        ? document.getElementById("cuentaIngreso").value
        : cuentaDesdeMetodoPago(metodoPago);
    const mes = getMesSeleccionado();

    if (!desc) {
      alert("Escribe una descripción");
      return;
    }
    if (isNaN(monto) || monto <= 0) {
      alert("Ingresa un monto válido mayor a 0");
      return;
    }

    await addDoc(collection(db, "finanzas"), {
      desc,
      monto,
      tipo,
      categoria,
      tipoGasto,
      fuenteIngreso,
      metodoPago,
      cuenta,
      fecha: new Date().toISOString(),
      mes
    });

    sonidoBotonMovimiento(tipo);

    document.getElementById("descripcion").value = "";
    document.getElementById("monto").value = "";
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("Hubo un error guardando los datos. Revisa la consola.");
  }
};

// ============================================================
// Totales
// ============================================================
function calcularTotales(datosMes) {
  let ingresos = 0;
  let gastos = 0;
  let fijos = 0;
  const categorias = {};
  const ingresosFuente = {};

  datosMes.forEach((t) => {
    if (t.tipo === "ingreso") {
      ingresos += t.monto;
      const fuente = t.fuenteIngreso && t.fuenteIngreso.trim() ? t.fuenteIngreso : "Otros";
      ingresosFuente[fuente] = (ingresosFuente[fuente] || 0) + t.monto;
    } else {
      gastos += t.monto;
      if (t.tipoGasto === "fijo") fijos += t.monto;
      const cat = t.categoria || "General";
      categorias[cat] = (categorias[cat] || 0) + t.monto;
    }
  });

  return { ingresos, gastos, fijos, categorias, ingresosFuente };
}

function renderTotales({ ingresos, gastos }, saldoRemanente, fijosEsperadoTabla) {
  const balance = saldoRemanente + ingresos - gastos;
  document.getElementById("ingresos").innerText = formatMoney(ingresos);
  document.getElementById("gastos").innerText = formatMoney(gastos);
  const fijosVal =
    typeof fijosEsperadoTabla === "number" ? fijosEsperadoTabla : 0;
  document.getElementById("fijos").innerText = formatMoney(fijosVal);
  document.getElementById("balance").innerText = formatMoney(balance);
}

function renderReporteSummaries({ ingresos, gastos }) {
  const ri = document.getElementById("reporteTotalIngresos");
  const rg = document.getElementById("reporteTotalGastos");
  if (ri) ri.textContent = formatMoney(ingresos);
  if (rg) rg.textContent = formatMoney(gastos);
}

// ============================================================
// Lista
// ============================================================
function renderLista(datosMes, periodo = "mes") {
  const lista = document.getElementById("lista");
  const emptyEl = document.getElementById("emptyHistorial");
  if (!lista) return;

  lista.innerHTML = "";

  const sorted = [...datosMes].sort((a, b) => {
    const fa = a.fecha || "";
    const fb = b.fecha || "";
    return fb.localeCompare(fa);
  });

  if (emptyEl) {
    const emptyMsgs = {
      mes: "No hay movimientos en este mes.",
      "24h": "No hay movimientos en las últimas 24 horas.",
      semana: "No hay movimientos esta semana (desde el lunes)."
    };
    emptyEl.textContent = emptyMsgs[periodo] || emptyMsgs.mes;
  }

  sorted.forEach((t) => {
    const li = document.createElement("li");
    const esIngreso = t.tipo === "ingreso";
    const meta = esIngreso
      ? `Ingreso${t.fuenteIngreso ? " · " + t.fuenteIngreso : ""}`
      : `Gasto ${t.tipoGasto === "fijo" ? "fijo" : "variable"} · ${t.categoria || "General"}`;

    li.innerHTML = `
      <div>
        <div class="mov-meta">${meta}</div>
        <span>${escapeHtml(t.desc)}</span>
        <small>${formatExtras(t)}</small>
      </div>
      <div class="item-right">
        <strong style="color:${esIngreso ? "var(--income)" : "var(--expense)"}">${esIngreso ? "+" : "−"} ${formatMoney(t.monto)}</strong>
        <button type="button" onclick="eliminar('${t.id}')" class="btn-delete" aria-label="Eliminar">✖</button>
      </div>
    `;
    lista.appendChild(li);
  });

  if (emptyEl) emptyEl.classList.toggle("hidden", sorted.length > 0);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function formatExtras(t) {
  const parts = [];
  if (t.metodoPago) parts.push(t.metodoPago);
  if (t.cuenta === "efectivo") parts.push("Efectivo");
  if (t.cuenta === "banco") parts.push("Banco");
  if (t.fecha) {
    try {
      const d = new Date(t.fecha);
      parts.push(d.toLocaleDateString("es", { day: "2-digit", month: "short" }));
    } catch (_) {}
  }
  return parts.join(" · ");
}

// ============================================================
// Gráficas
// ============================================================
function chartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#cbd5e1",
          padding: 12,
          font: { family: "'DM Sans', sans-serif", size: 11 }
        }
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleFont: { family: "'DM Sans', sans-serif" },
        bodyFont: { family: "'DM Sans', sans-serif" },
        padding: 12,
        callbacks: {
          label(ctx) {
            const data = ctx.dataset.data;
            const n = Number(data[ctx.dataIndex]) || 0;
            const total = data.reduce((a, b) => a + Number(b), 0) || 1;
            const pct = ((n / total) * 100).toFixed(1);
            return ` ${formatMoney(n)} (${pct}%)`;
          }
        }
      }
    }
  };
}

function renderGrafica(canvasId, labels, data, storageKey, emptyId, wrapId) {
  const canvas = document.getElementById(canvasId);
  const emptyEl = document.getElementById(emptyId);
  const wrap = wrapId ? document.getElementById(wrapId) : canvas?.closest(".chart-wrap");

  if (!canvas) return;

  const sum = data.reduce((a, b) => a + b, 0);
  const hasData = labels.length > 0 && sum > 0;

  if (emptyEl) emptyEl.classList.toggle("hidden", hasData);
  if (wrap) wrap.classList.toggle("hidden", !hasData);

  if (!hasData) {
    if (window[storageKey]) {
      try {
        window[storageKey].destroy();
      } catch (_) {}
      window[storageKey] = null;
    }
    return;
  }

  const bg = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  if (window[storageKey]) {
    window[storageKey].data.labels = labels;
    window[storageKey].data.datasets[0].data = data;
    window[storageKey].data.datasets[0].backgroundColor = bg;
    window[storageKey].update();
  } else {
    window[storageKey] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: bg,
            borderWidth: 2,
            borderColor: "#1e1a35",
            hoverOffset: 6
          }
        ]
      },
      options: chartOptions()
    });
  }
}

// ============================================================
// Objetivos financieros del mes
// ============================================================
let objetivosGlobal = [];

function renderObjetivos() {
  const mes = getMesSeleccionado();
  const ul = document.getElementById("listaObjetivos");
  const emptyEl = document.getElementById("emptyObjetivos");
  const mesLabelEl = document.getElementById("objetivosMesLabel");
  const progEl = document.getElementById("objetivosProgreso");
  if (!ul) return;

  const mesLabel = labelMes(mes);
  const mesTitulo = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  if (mesLabelEl) mesLabelEl.textContent = mesTitulo;

  const lista = objetivosGlobal
    .filter((o) => o.mes === mes)
    .sort((a, b) => (a.creado || 0) - (b.creado || 0));

  let cumplidos = 0;
  lista.forEach((o) => {
    if (o.hecho) cumplidos++;
  });
  if (progEl) {
    progEl.textContent =
      lista.length === 0
        ? "0 / 0"
        : `${cumplidos} / ${lista.length} objetivos cumplidos`;
  }

  ul.innerHTML = "";
  lista.forEach((o) => {
    const li = document.createElement("li");
    if (o.hecho) li.classList.add("is-done");

    const span = document.createElement("span");
    span.className = "objetivos-concepto";
    span.textContent = o.concepto || "";

    const wrap = document.createElement("div");
    wrap.className = "objetivos-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!o.hecho;
    cb.title = "Marcar como cumplido";
    cb.addEventListener("change", () => {
      toggleObjetivoHecho(o.id, cb.checked);
    });
    wrap.appendChild(cb);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "objetivos-del";
    del.setAttribute("aria-label", "Eliminar objetivo");
    del.textContent = "✕";
    del.addEventListener("click", () => eliminarObjetivo(o.id));

    li.appendChild(span);
    li.appendChild(wrap);
    li.appendChild(del);
    ul.appendChild(li);
  });

  if (emptyEl) emptyEl.classList.toggle("hidden", lista.length > 0);
}

async function toggleObjetivoHecho(id, hecho) {
  try {
    await updateDoc(doc(db, "objetivos", id), { hecho: !!hecho });
  } catch (e) {
    console.error(e);
    alert("No se pudo actualizar el objetivo.");
    renderObjetivos();
  }
}

async function eliminarObjetivo(id) {
  try {
    await deleteDoc(doc(db, "objetivos", id));
  } catch (e) {
    console.error(e);
    alert("No se pudo eliminar el objetivo.");
  }
}

async function agregarObjetivo() {
  const input = document.getElementById("nuevoObjetivo");
  const texto = input?.value?.trim() ?? "";
  if (!texto) {
    alert("Escribe el concepto del objetivo.");
    return;
  }
  try {
    await addDoc(collection(db, "objetivos"), {
      mes: getMesSeleccionado(),
      concepto: texto,
      hecho: false,
      creado: Date.now()
    });
    input.value = "";
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar el objetivo.");
  }
}

// ============================================================
// Gastos fijos del mes (tabla tipo Excel)
// ============================================================
let gastosFijosGlobal = [];

function mesesRangoInclusivo(ymA, ymB) {
  let a = ymA;
  let b = ymB;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  const out = [];
  let y = ya;
  let m = ma;
  while (y < yb || (y === yb && m <= mb)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function clampDayToMonth(year, month1to12, day) {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const last = new Date(year, month1to12, 0).getDate();
  if (day > last) return null;
  return day;
}

function fijoYaExiste(mes, concepto, fechaYYYYMMDD) {
  const c = concepto.trim().toLowerCase();
  return gastosFijosGlobal.some((o) => {
    if (o.mes !== mes) return false;
    if ((o.concepto || "").trim().toLowerCase() !== c) return false;
    return toInputDate(o.fechaCobro) === fechaYYYYMMDD;
  });
}

function fijoFilaUrgente(o) {
  if (o.pagado) return false;
  const r = o.real;
  if (r == null || r === undefined) return true;
  if (typeof r === "number" && r <= 0) return true;
  if (typeof r === "string" && (r === "" || Number(r) <= 0)) return true;
  return false;
}

function toInputDate(v) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return "";
}

/** Monto del movimiento: gasto real si hay; si no, gasto esperado. */
function montoDesdeGastoFijo(o) {
  const r = o.real;
  if (r != null && r !== "" && !isNaN(Number(r)) && Number(r) > 0) return Number(r);
  const e = o.esperado;
  if (e != null && e !== "" && !isNaN(Number(e)) && Number(e) > 0) return Number(e);
  return 0;
}

async function syncFinanzasDesdeGastoFijo(o) {
  if (!o.pagado || !o.movimientoId) return;
  const monto = montoDesdeGastoFijo(o);
  if (!monto || monto <= 0) return;
  const patch = {
    monto,
    desc: (o.concepto || "Gasto fijo").trim() || "Gasto fijo",
    metodoPago: o.metodoPago || ""
  };
  if (o.fechaCobro && /^\d{4}-\d{2}-\d{2}/.test(String(o.fechaCobro))) {
    const d = String(o.fechaCobro).slice(0, 10);
    patch.fecha = new Date(d + "T12:00:00").toISOString();
  }
  try {
    await updateDoc(doc(db, "finanzas", o.movimientoId), patch);
  } catch (e) {
    console.error(e);
  }
}

async function togglePagadoGastoFijo(fijoId, checked, cbEl) {
  const o = gastosFijosGlobal.find((x) => x.id === fijoId);
  if (!o) {
    if (cbEl) cbEl.checked = false;
    return;
  }

  if (checked) {
    const monto = montoDesdeGastoFijo(o);
    if (!monto || monto <= 0) {
      alert(
        "Para registrar el pago necesitás un monto: indicá gasto real o un gasto esperado mayor a 0."
      );
      if (cbEl) cbEl.checked = false;
      return;
    }
    if (o.movimientoId) {
      try {
        await updateDoc(doc(db, "gastos_fijos", o.id), { pagado: true });
      } catch (e) {
        console.error(e);
        if (cbEl) cbEl.checked = false;
        alert("No se pudo actualizar el estado.");
      }
      return;
    }

    let nuevoMovId = null;
    try {
      let fechaMov = new Date().toISOString();
      if (o.fechaCobro && /^\d{4}-\d{2}-\d{2}/.test(String(o.fechaCobro))) {
        fechaMov = new Date(
          String(o.fechaCobro).slice(0, 10) + "T12:00:00"
        ).toISOString();
      }
      const ref = await addDoc(collection(db, "finanzas"), {
        desc: (o.concepto || "Gasto fijo").trim() || "Gasto fijo",
        monto,
        tipo: "gasto",
        tipoGasto: "fijo",
        categoria: "General",
        fuenteIngreso: "",
        metodoPago: o.metodoPago || "",
        cuenta: "",
        fecha: fechaMov,
        mes: o.mes || getMesSeleccionado(),
        gastoFijoId: o.id
      });
      nuevoMovId = ref.id;
      await updateDoc(doc(db, "gastos_fijos", o.id), {
        pagado: true,
        movimientoId: ref.id
      });
    } catch (e) {
      console.error(e);
      if (nuevoMovId) {
        try {
          await deleteDoc(doc(db, "finanzas", nuevoMovId));
        } catch (_) {}
      }
      if (cbEl) cbEl.checked = false;
      alert("No se pudo crear el movimiento. Revisa la consola o las reglas de Firestore.");
    }
    return;
  }

  try {
    if (o.movimientoId) {
      try {
        await deleteDoc(doc(db, "finanzas", o.movimientoId));
      } catch (e) {
        console.warn("Movimiento vinculado no encontrado o ya borrado:", e);
      }
    }
    await updateDoc(doc(db, "gastos_fijos", o.id), {
      pagado: false,
      movimientoId: deleteField()
    });
  } catch (e) {
    console.error(e);
    if (cbEl) cbEl.checked = true;
    alert("No se pudo quitar el pago del listado de movimientos.");
  }
}

async function updateGastoFijo(id, patch) {
  try {
    await updateDoc(doc(db, "gastos_fijos", id), patch);
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar el cambio.");
    renderGastosFijos();
  }
}

async function eliminarGastoFijo(id) {
  const o = gastosFijosGlobal.find((x) => x.id === id);
  try {
    if (o?.movimientoId) {
      try {
        await deleteDoc(doc(db, "finanzas", o.movimientoId));
      } catch (_) {}
    }
    await deleteDoc(doc(db, "gastos_fijos", id));
  } catch (e) {
    console.error(e);
    alert("No se pudo eliminar la fila.");
  }
}

async function agregarGastoFijo() {
  const concepto = document.getElementById("fijoNuevoConcepto")?.value?.trim() ?? "";
  const esp = parseFloat(document.getElementById("fijoNuevoEsperado")?.value);
  if (!concepto) {
    alert("Escribe el concepto del gasto fijo.");
    return;
  }
  if (isNaN(esp) || esp < 0) {
    alert("Ingresa un gasto esperado válido (0 o mayor).");
    return;
  }
  try {
    await addDoc(collection(db, "gastos_fijos"), {
      mes: getMesSeleccionado(),
      concepto,
      esperado: esp,
      real: null,
      metodoPago: "",
      fechaCobro: "",
      pagado: false,
      creado: Date.now()
    });
    const ic = document.getElementById("fijoNuevoConcepto");
    const ie = document.getElementById("fijoNuevoEsperado");
    if (ic) ic.value = "";
    if (ie) ie.value = "";
  } catch (e) {
    console.error(e);
    alert("No se pudo añadir el gasto fijo.");
  }
}

async function generarGastosFijosRecurrentes() {
  const concepto = document.getElementById("fijoRecConcepto")?.value?.trim() ?? "";
  const esp = parseFloat(document.getElementById("fijoRecEsperado")?.value);
  const d1 = parseInt(document.getElementById("fijoRecDia1")?.value, 10);
  const d2Raw = document.getElementById("fijoRecDia2")?.value?.trim() ?? "";
  const d2 = d2Raw === "" ? null : parseInt(d2Raw, 10);
  const mesDesde = document.getElementById("fijoRecMesDesde")?.value;
  const mesHasta = document.getElementById("fijoRecMesHasta")?.value;
  const metodo = document.getElementById("fijoRecMetodo")?.value ?? "";

  if (!concepto) {
    alert("Escribe el concepto (ej. Pago de casa).");
    return;
  }
  if (isNaN(esp) || esp < 0) {
    alert("Indica un monto esperado por cuota válido.");
    return;
  }
  if (!mesDesde || !mesHasta) {
    alert("Elige el mes inicial y el mes final del rango.");
    return;
  }
  if (!Number.isInteger(d1) || d1 < 1 || d1 > 31) {
    alert("Día de cobro 1 debe ser entre 1 y 31.");
    return;
  }
  if (
    d2 != null &&
    d2Raw !== "" &&
    (!Number.isInteger(d2) || d2 < 1 || d2 > 31)
  ) {
    alert("Día 2 debe ser entre 1 y 31 o déjalo vacío.");
    return;
  }
  if (d2 != null && d2 === d1) {
    alert("Los dos días no pueden ser el mismo.");
    return;
  }

  const dias =
    d2 == null || d2Raw === "" || !Number.isInteger(d2)
      ? [d1]
      : [...new Set([d1, d2])].sort((x, y) => x - y);
  const meses = mesesRangoInclusivo(mesDesde, mesHasta);
  const grupoId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "rec_" + Date.now();

  let creados = 0;
  let omitidos = 0;

  for (const ym of meses) {
    const [y, mo] = ym.split("-").map(Number);
    for (const d of dias) {
      const diaOk = clampDayToMonth(y, mo, d);
      if (diaOk == null) {
        omitidos++;
        continue;
      }
      const fechaStr = `${ym}-${String(diaOk).padStart(2, "0")}`;
      if (fijoYaExiste(ym, concepto, fechaStr)) {
        omitidos++;
        continue;
      }
      try {
        await addDoc(collection(db, "gastos_fijos"), {
          mes: ym,
          concepto,
          esperado: esp,
          real: null,
          metodoPago: metodo,
          fechaCobro: fechaStr,
          pagado: false,
          creado: Date.now() + creados,
          recurrenciaGrupoId: grupoId
        });
        creados++;
      } catch (e) {
        console.error(e);
        alert("Error al guardar. Revisa la consola o las reglas de Firestore.");
        return;
      }
    }
  }

  alert(
    `Listo: ${creados} cuota(s) creada(s). ${omitidos} omitida(s) (ya existían o ese día no existe en el mes).`
  );
}

function renderGastosFijos() {
  const mes = getMesSeleccionado();
  const mesLabelEl = document.getElementById("fijosMesLabel");
  const tb = document.getElementById("gastosFijosBody");
  const emptyEl = document.getElementById("emptyGastosFijos");
  const totalEspEl = document.getElementById("fijosTotalEsperado");
  const totalRealEl = document.getElementById("fijosTotalReal");
  if (!tb) return;

  const mesLabel = labelMes(mes);
  if (mesLabelEl) {
    mesLabelEl.textContent =
      mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  }

  const lista = gastosFijosGlobal
    .filter((o) => o.mes === mes)
    .sort((a, b) => (a.creado || 0) - (b.creado || 0));

  let sumE = 0;
  let sumR = 0;
  lista.forEach((o) => {
    sumE += Number(o.esperado) || 0;
    const r = o.real;
    if (r != null && r !== "" && !isNaN(Number(r))) sumR += Number(r);
  });

  if (totalEspEl) totalEspEl.innerHTML = "<strong>" + formatMoney(sumE) + "</strong>";
  if (totalRealEl) totalRealEl.innerHTML = "<strong>" + formatMoney(sumR) + "</strong>";

  tb.innerHTML = "";
  lista.forEach((o) => {
    const tr = document.createElement("tr");
    if (fijoFilaUrgente(o)) tr.classList.add("fijos-row--alert");

    const tdC = document.createElement("td");
    const inpC = document.createElement("input");
    inpC.type = "text";
    inpC.className = "fijos-inp";
    inpC.value = o.concepto || "";
    inpC.maxLength = 100;
    inpC.addEventListener("blur", async () => {
      const v = inpC.value.trim();
      if (v !== (o.concepto || "")) {
        await updateGastoFijo(o.id, { concepto: v });
        await syncFinanzasDesdeGastoFijo({ ...o, concepto: v });
      }
    });
    tdC.appendChild(inpC);

    const tdE = document.createElement("td");
    const inpE = document.createElement("input");
    inpE.type = "number";
    inpE.className = "fijos-inp fijos-inp--num";
    inpE.step = "0.01";
    inpE.min = "0";
    inpE.value =
      o.esperado != null && o.esperado !== "" ? String(o.esperado) : "";
    inpE.addEventListener("blur", async () => {
      const v = parseFloat(inpE.value);
      if (isNaN(v) || v < 0) {
        inpE.value =
          o.esperado != null ? String(o.esperado) : "";
        return;
      }
      if (v !== Number(o.esperado)) {
        await updateGastoFijo(o.id, { esperado: v });
        await syncFinanzasDesdeGastoFijo({ ...o, esperado: v });
      }
    });
    tdE.appendChild(inpE);

    const tdR = document.createElement("td");
    const inpR = document.createElement("input");
    inpR.type = "number";
    inpR.className = "fijos-inp fijos-inp--num";
    inpR.step = "0.01";
    inpR.min = "0";
    inpR.placeholder = "—";
    if (o.real != null && o.real !== "") inpR.value = String(o.real);
    inpR.addEventListener("blur", async () => {
      const raw = inpR.value.trim();
      const patch = { real: raw === "" ? null : parseFloat(raw) };
      if (patch.real !== null && (isNaN(patch.real) || patch.real < 0)) {
        inpR.value = o.real != null ? String(o.real) : "";
        return;
      }
      const prev =
        o.real == null || o.real === ""
          ? null
          : Number(o.real);
      const next = patch.real;
      if (prev !== next) {
        await updateGastoFijo(o.id, patch);
        await syncFinanzasDesdeGastoFijo({ ...o, real: patch.real });
      }
    });
    tdR.appendChild(inpR);

    const tdM = document.createElement("td");
    const selM = document.createElement("select");
    selM.className = "fijos-inp fijos-select";
    [
      ["", "Método"],
      ["Efectivo", "Efectivo"],
      ["Transferencia", "Transferencia"],
      ["Debito", "Tarjeta débito"],
      ["Credito", "Tarjeta crédito"]
    ].forEach(([val, lab]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = lab;
      selM.appendChild(opt);
    });
    selM.value = o.metodoPago || "";
    selM.addEventListener("change", async () => {
      const v = selM.value;
      await updateGastoFijo(o.id, { metodoPago: v });
      await syncFinanzasDesdeGastoFijo({ ...o, metodoPago: v });
    });
    tdM.appendChild(selM);

    const tdF = document.createElement("td");
    const inpF = document.createElement("input");
    inpF.type = "date";
    inpF.className = "fijos-inp fijos-inp--date";
    inpF.value = toInputDate(o.fechaCobro);
    inpF.addEventListener("change", async () => {
      const val = inpF.value || "";
      await updateGastoFijo(o.id, { fechaCobro: val });
      await syncFinanzasDesdeGastoFijo({ ...o, fechaCobro: val });
    });
    tdF.appendChild(inpF);

    const tdP = document.createElement("td");
    tdP.className = "fijos-td-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!o.pagado;
    cb.title = "Pagado (crea o quita el gasto en Movimientos)";
    cb.addEventListener("change", () => {
      togglePagadoGastoFijo(o.id, cb.checked, cb);
    });
    tdP.appendChild(cb);

    const tdX = document.createElement("td");
    tdX.className = "fijos-td-del";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fijos-del";
    btn.setAttribute("aria-label", "Eliminar fila");
    btn.textContent = "✕";
    btn.addEventListener("click", () => eliminarGastoFijo(o.id));
    tdX.appendChild(btn);

    tr.appendChild(tdC);
    tr.appendChild(tdE);
    tr.appendChild(tdR);
    tr.appendChild(tdM);
    tr.appendChild(tdF);
    tr.appendChild(tdP);
    tr.appendChild(tdX);
    tb.appendChild(tr);
  });

  if (emptyEl) emptyEl.classList.toggle("hidden", lista.length > 0);
}

// ============================================================
// UI
// ============================================================
let datosGlobal = [];

function aplicarUI() {
  const mes = getMesSeleccionado();
  const datosMes = filtrarPorMes(datosGlobal, mes);
  const datosHistorialLista = filtrarMovimientosHistorial(datosGlobal);
  const saldoRemanente = getSaldoRemanente(mes);
  const totales = calcularTotales(datosMes);

  const mesLabel = labelMes(mes);
  const rl = document.getElementById("reportesMesLabel");
  const hl = document.getElementById("historialMesLabel");
  const hHelp = document.getElementById("historialMesHelp");
  const periodo = getHistorialPeriodo();
  if (rl) rl.textContent = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  if (hl) {
    if (periodo === "24h") hl.textContent = "Últimas 24 horas";
    else if (periodo === "semana") hl.textContent = "Esta semana (desde el lunes)";
    else hl.textContent = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  }
  if (hHelp) hHelp.classList.toggle("hidden", periodo !== "mes");

  const fijosEsperadoTabla = gastosFijosGlobal
    .filter((o) => o.mes === mes)
    .reduce((s, o) => s + (Number(o.esperado) || 0), 0);

  renderTotales(totales, saldoRemanente, fijosEsperadoTabla);
  renderReporteSummaries(totales);
  renderLista(datosHistorialLista, periodo);
  renderObjetivos();
  renderGastosFijos();

  const catKeys = Object.keys(totales.categorias);
  const catVals = catKeys.map((k) => totales.categorias[k]);
  renderGrafica("grafica", catKeys, catVals, "miGrafica", "emptyGastos", "wrapGraficaGastos");

  const ingKeys = Object.keys(totales.ingresosFuente);
  const ingVals = ingKeys.map((k) => totales.ingresosFuente[k]);
  renderGrafica(
    "graficaIngresos",
    ingKeys,
    ingVals,
    "graficaIngresosChart",
    "emptyIngresos",
    "wrapGraficaIngresos"
  );
}

function syncNavActive(vista) {
  document.querySelectorAll("[data-vista]").forEach((el) => {
    const match = el.getAttribute("data-vista") === vista;
    el.classList.toggle("is-active", match);
  });
}

function actualizarCalcPersonas() {
  const total = parseFloat(document.getElementById("calcGastoTotal")?.value);
  const n = parseInt(document.getElementById("calcNumPersonas")?.value, 10);
  const out = document.getElementById("calcPorPersona");
  if (!out) return;
  if (!n || n < 1 || isNaN(total) || total < 0) {
    out.textContent = formatMoney(0);
    return;
  }
  out.textContent = formatMoney(total / n);
}

window.cambiarVista = function (vista) {
  const vistas = ["home", "reportes", "historial", "objetivos", "gastosFijos", "calcPersonas"];
  vistas.forEach((v) => {
    const el = document.getElementById(v);
    if (el) el.classList.remove("active");
  });
  const target = document.getElementById(vista);
  if (target) target.classList.add("active");
  syncNavActive(vista);
  aplicarUI();
  if (vista === "calcPersonas") actualizarCalcPersonas();
};

window.irVista = function (vista) {
  window.cambiarVista(vista);
  cerrarMenu();
};

function abrirMenu() {
  document.getElementById("navDrawer")?.classList.add("is-open");
  document.getElementById("menuBackdrop")?.classList.add("is-open");
  document.getElementById("menuBackdrop")?.setAttribute("aria-hidden", "false");
}

function cerrarMenu() {
  document.getElementById("navDrawer")?.classList.remove("is-open");
  document.getElementById("menuBackdrop")?.classList.remove("is-open");
  document.getElementById("menuBackdrop")?.setAttribute("aria-hidden", "true");
}

window.eliminar = async function (id) {
  try {
    const mov = datosGlobal.find((t) => t.id === id);
    if (mov?.gastoFijoId) {
      await updateDoc(doc(db, "gastos_fijos", mov.gastoFijoId), {
        pagado: false,
        movimientoId: deleteField()
      });
    }
    await deleteDoc(doc(db, "finanzas", id));
  } catch (error) {
    console.error("Error al eliminar:", error);
    alert("No se pudo eliminar el registro.");
  }
};

// ============================================================
// Init
// ============================================================
function sincronizarMesDesdeRecurrencia() {
  const md = document.getElementById("fijoRecMesDesde");
  if (md) md.value = getMesSeleccionado();
}

function inicializarCamposRecurrenciaFijos() {
  const mh = document.getElementById("fijoRecMesHasta");
  sincronizarMesDesdeRecurrencia();
  if (mh && !mh.value) {
    const y = parseInt(getMesSeleccionado().split("-")[0], 10);
    mh.value = `${y}-12`;
  }
}

const mesFiltro = document.getElementById("mesFiltro");
if (mesFiltro && !mesFiltro.value) {
  mesFiltro.value = getMesCalendarioLocal();
}

try {
  const saved = localStorage.getItem(HISTORIAL_PERIODO_KEY);
  if (saved === "24h" || saved === "semana" || saved === "mes") {
    document.querySelectorAll(".mov-period-btn").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-periodo") === saved);
    });
  }
} catch (_) {}

document.querySelectorAll(".mov-period-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mov-period-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const v = btn.getAttribute("data-periodo");
    if (v) {
      try {
        localStorage.setItem(HISTORIAL_PERIODO_KEY, v);
      } catch (_) {}
    }
    aplicarUI();
  });
});

cargarSaldoEnInput();
inicializarCamposRecurrenciaFijos();

mesFiltro?.addEventListener("change", () => {
  cargarSaldoEnInput();
  sincronizarMesDesdeRecurrencia();
  aplicarUI();
});

document.getElementById("btnGuardarSaldo")?.addEventListener("click", () => {
  const mes = getMesSeleccionado();
  const input = document.getElementById("saldoRemanente");
  const raw = input?.value?.trim() ?? "";
  if (raw === "") {
    localStorage.removeItem(storageKeySaldo(mes));
    aplicarUI();
    return;
  }
  const v = parseFloat(raw);
  if (isNaN(v) || v < 0) {
    alert("Ingresa un saldo válido (0 o mayor).");
    return;
  }
  localStorage.setItem(storageKeySaldo(mes), String(v));
  aplicarUI();
});

document.getElementById("btnMenu")?.addEventListener("click", abrirMenu);
document.getElementById("menuBackdrop")?.addEventListener("click", cerrarMenu);

document.getElementById("btnAddObjetivo")?.addEventListener("click", agregarObjetivo);
document.getElementById("nuevoObjetivo")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    agregarObjetivo();
  }
});

syncNavActive("home");

onSnapshot(collection(db, "finanzas"), (snapshot) => {
  datosGlobal = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  aplicarUI();
});

onSnapshot(collection(db, "objetivos"), (snapshot) => {
  objetivosGlobal = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  aplicarUI();
});

onSnapshot(collection(db, "gastos_fijos"), (snapshot) => {
  gastosFijosGlobal = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  aplicarUI();
});

document.getElementById("btnAddGastoFijo")?.addEventListener("click", agregarGastoFijo);
document
  .getElementById("btnGenerarFijosRecurrentes")
  ?.addEventListener("click", generarGastosFijosRecurrentes);

document.getElementById("calcGastoTotal")?.addEventListener("input", actualizarCalcPersonas);
document.getElementById("calcNumPersonas")?.addEventListener("input", actualizarCalcPersonas);
document.getElementById("fijoNuevoConcepto")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    agregarGastoFijo();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./service-worker.js", { scope: "./" })
    .catch(() => {});
}
