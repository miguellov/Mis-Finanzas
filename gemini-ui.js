// ============================================================
// gemini-ui.js — Controlador de la UI del asistente Gemini
// Este archivo orquesta el chat y lo conecta con los datos
// de Firebase que ya maneja tu app.js
// ============================================================

import { enviarMensaje, construirContexto, limpiarConversacion, generarAnalisisAutomatico } from "./gemini.js";

// ── API KEY desde localStorage ──────────────────────────────
const API_KEY_STORAGE = "finanzas_gemini_api_key";

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

function saveApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
  // Inyectar la key en el módulo gemini.js dinámicamente
  window._geminiApiKey = key.trim();
}

// Patch: sobreescribir la URL de Gemini con la key guardada
// (gemini.js lee window._geminiApiKey si existe)
const savedKey = getApiKey();
if (savedKey) window._geminiApiKey = savedKey;

// ── Referencias al DOM ───────────────────────────────────────
const panel      = document.getElementById("geminiPanel");
const fab        = document.getElementById("geminiBtn");
const messages   = document.getElementById("geminiMessages");
const input      = document.getElementById("geminiInput");
const sendBtn    = document.getElementById("geminiSend");
const badge      = document.getElementById("geminiBadge");
const apiModal   = document.getElementById("geminiApiKeyModal");
const apiInput   = document.getElementById("geminiApiKeyInput");

// ── Contexto financiero (se llena desde datos globales de app.js) ──
function obtenerContextoActual() {
  // Acceder a las variables globales que expone app.js
  const datos     = window._datosGlobal || [];
  const fijos     = window._gastosFijosGlobal || [];
  const objetivos = window._objetivosGlobal || [];

  // Mes seleccionado
  const mesEl = document.getElementById("mesFiltro");
  const mes   = mesEl?.value || new Date().toISOString().slice(0, 7);

  // Filtrar por mes
  const datosMes = datos.filter(t => (t.mes || (t.fecha || "").slice(0, 7)) === mes);

  let ingresos = 0, gastos = 0;
  const categorias = {};

  datosMes.forEach(t => {
    if (t.tipo === "ingreso") {
      ingresos += t.monto || 0;
    } else {
      gastos += t.monto || 0;
      const cat = t.categoria || "General";
      categorias[cat] = (categorias[cat] || 0) + (t.monto || 0);
    }
  });

  const saldoKey = "finanzas_saldoRemanente_" + mes;
  const saldoRaw = localStorage.getItem(saldoKey);
  const saldoAnterior = parseFloat(saldoRaw) || 0;
  const balance = saldoAnterior + ingresos - gastos;

  const fijosMes = fijos.filter(f => (f.mes || "") === mes);
  const objMes   = objetivos.filter(o => (o.mes || "") === mes);

  return construirContexto({ ingresos, gastos, balance, categorias, gastosFijos: fijosMes, objetivos: objMes, mes });
}

// ── Render de mensajes ───────────────────────────────────────
function appendMsg(texto, tipo) {
  // Quitar sugerencias después del primer mensaje del usuario
  if (tipo === "user") {
    document.getElementById("geminiSuggs")?.remove();
  }

  const div = document.createElement("div");
  div.className = `gemini-msg gemini-msg--${tipo}`;
  div.textContent = texto;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function appendTyping() {
  const div = document.createElement("div");
  div.className = "gemini-msg gemini-msg--typing";
  div.id = "geminiTyping";
  div.textContent = "Gemini está pensando…";
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function removeTyping() {
  document.getElementById("geminiTyping")?.remove();
}

// ── Enviar mensaje ───────────────────────────────────────────
let enviando = false;

async function enviar(textoOverride) {
  if (enviando) return;
  const texto = (textoOverride || input.value).trim();
  if (!texto) return;

  input.value = "";
  input.style.height = "auto";
  enviando = true;
  sendBtn.disabled = true;

  appendMsg(texto, "user");
  const typing = appendTyping();

  // Usar la API key guardada
  const key = getApiKey();
  if (key) window._geminiApiKey = key;

  const ctx = obtenerContextoActual();
  const respuesta = await enviarMensaje(texto, ctx);

  typing.remove();
  appendMsg(respuesta, "bot");

  enviando = false;
  sendBtn.disabled = false;
  input.focus();

  // Mostrar badge si el panel está cerrado
  if (!panel.classList.contains("is-open")) {
    badge.classList.add("visible");
  }
}

// ── Eventos ──────────────────────────────────────────────────

// Abrir/cerrar panel
fab.addEventListener("click", () => {
  const open = panel.classList.toggle("is-open");
  if (open) {
    badge.classList.remove("visible");
    input.focus();
  }
});

document.getElementById("geminiBtnCerrar")?.addEventListener("click", () => {
  panel.classList.remove("is-open");
});

// Enviar
sendBtn.addEventListener("click", () => enviar());
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviar();
  }
});

// Autoexpand textarea
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 80) + "px";
});

// Chips de sugerencias
document.getElementById("geminiSuggs")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".gemini-suggestions__chip");
  if (!chip) return;
  const texto = chip.textContent.replace(/^[^\w]+/, "").trim();
  enviar(chip.textContent.trim());
});

// Botón analizar
document.getElementById("geminiBtnAnalizar")?.addEventListener("click", async () => {
  if (enviando) return;
  enviando = true;
  sendBtn.disabled = true;
  appendMsg("📊 Analiza mis finanzas del mes actual", "user");
  const typing = appendTyping();
  const ctx = obtenerContextoActual();
  const resp = await generarAnalisisAutomatico(ctx);
  typing.remove();
  appendMsg(resp, "bot");
  enviando = false;
  sendBtn.disabled = false;
});

// Botón limpiar conversación
document.getElementById("geminiBtnLimpiar")?.addEventListener("click", () => {
  limpiarConversacion();
  messages.innerHTML = `<div class="gemini-msg gemini-msg--bot">🔄 Conversación reiniciada. ¿En qué te ayudo?</div>`;
});

// ── Modal API Key ────────────────────────────────────────────
document.getElementById("geminiBtnKey")?.addEventListener("click", () => {
  apiInput.value = getApiKey();
  apiModal.classList.add("is-open");
});

document.getElementById("btnApiKeyCancel")?.addEventListener("click", () => {
  apiModal.classList.remove("is-open");
});

document.getElementById("btnApiKeySave")?.addEventListener("click", () => {
  const key = apiInput.value.trim();
  if (!key) {
    alert("Pega tu API Key de Gemini primero.");
    return;
  }
  saveApiKey(key);
  apiModal.classList.remove("is-open");
  appendMsg("✅ API Key guardada. ¡Ya puedo ayudarte con tu análisis financiero!", "bot");
  panel.classList.add("is-open");
});

// Cerrar modal al hacer clic fuera
apiModal.addEventListener("click", (e) => {
  if (e.target === apiModal) apiModal.classList.remove("is-open");
});

// ── Exponer datos globales desde app.js ──────────────────────
// app.js ya usa variables locales. Para que gemini-ui.js las lea,
// añade estas líneas al final de tu app.js (ver instrucciones):
//
//   window._datosGlobal       = datosGlobal;
//   window._gastosFijosGlobal = gastosFijosGlobal;
//   window._objetivosGlobal   = objetivosGlobal;
//
// (Están en los onSnapshot al final de app.js)

console.log("✨ Gemini AI assistant loaded for Mis Finanzas");
