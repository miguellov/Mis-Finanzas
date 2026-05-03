// ============================================================
// gemini.js — Asistente IA con Gemini para Mis Finanzas
// La API Key se guarda en localStorage (clave finanzas_gemini_api_key)
// desde el modal del chat (gemini-ui.js).
// ============================================================

// Historial de conversación (multi-turno)
let conversacion = [];

/**
 * Construye el contexto financiero actual del usuario
 * para pasárselo a Gemini en cada mensaje.
 */
export function construirContexto({ ingresos, gastos, balance, categorias, gastosFijos, objetivos, mes }) {
  const catTexto = Object.entries(categorias || {})
    .map(([k, v]) => `  - ${k}: RD$ ${v.toFixed(2)}`)
    .join("\n") || "  (sin datos)";

  const fijosTexto = (gastosFijos || [])
    .slice(0, 10)
    .map(f => `  - ${f.concepto}: esperado RD$ ${f.esperado ?? 0}, pagado: ${f.pagado ? "sí" : "no"}`)
    .join("\n") || "  (sin datos)";

  const objTexto = (objetivos || [])
    .slice(0, 8)
    .map(o => `  - ${o.texto} [${o.cumplido ? "cumplido" : "pendiente"}]`)
    .join("\n") || "  (sin datos)";

  return `Eres un asistente financiero personal amigable y conciso para la app "Mis Finanzas".
El usuario lleva su control de gastos mensual en pesos dominicanos (RD$).

DATOS ACTUALES (mes: ${mes || "no especificado"}):
- Ingresos del mes: RD$ ${(ingresos || 0).toFixed(2)}
- Gastos del mes:   RD$ ${(gastos || 0).toFixed(2)}
- Balance actual:   RD$ ${(balance || 0).toFixed(2)}

Gastos por categoría:
${catTexto}

Gastos fijos registrados:
${fijosTexto}

Objetivos del mes:
${objTexto}

INSTRUCCIONES:
- Responde siempre en español, de forma clara y breve (máx. 3 párrafos salvo que pidan más detalle).
- Usa los datos de arriba para personalizar tus análisis y consejos.
- Si te preguntan por análisis de gastos, categorías o recomendaciones, usa los datos reales.
- Si el usuario quiere registrar o eliminar algo, indícale cómo hacerlo en la app (no puedes modificar datos directamente).
- Sé positivo, motivador y práctico.`;
}

/**
 * Envía un mensaje a Gemini y devuelve la respuesta en texto.
 * Mantiene historial de conversación multi-turno.
 */
export async function enviarMensaje(mensajeUsuario, contexto) {
  const key = localStorage.getItem("finanzas_gemini_api_key") || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`;

  if (!key.trim()) {
    return "⚠️ Necesitas configurar tu API Key de Gemini. Ábrela con el botón 🔑 en el chat.";
  }

  // Añadir el mensaje del usuario al historial
  conversacion.push({ role: "user", parts: [{ text: mensajeUsuario }] });

  const body = {
    system_instruction: { parts: [{ text: contexto }] },
    contents: conversacion,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  const fetchOpts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };

  try {
    let res = await fetch(url, fetchOpts);

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 8000));
      res = await fetch(url, fetchOpts);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `Error ${res.status}`;
      conversacion.pop(); // revertir si falló
      if (res.status === 400) return `❌ API Key inválida o request incorrecto: ${msg}`;
      if (res.status === 429) return "⏳ Demasiadas solicitudes. Espera un momento e intenta de nuevo.";
      return `❌ Error al contactar Gemini: ${msg}`;
    }

    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      conversacion.pop();
      return "No obtuve respuesta de Gemini. Intenta de nuevo.";
    }

    // Guardar respuesta del asistente en el historial
    conversacion.push({ role: "model", parts: [{ text: texto }] });

    // Limitar historial a los últimos 20 turnos (10 intercambios)
    if (conversacion.length > 20) {
      conversacion = conversacion.slice(conversacion.length - 20);
    }

    return texto;
  } catch (e) {
    conversacion.pop();
    return `❌ Error de red: ${e.message}`;
  }
}

/**
 * Limpia el historial de conversación.
 */
export function limpiarConversacion() {
  conversacion = [];
}

/**
 * Genera un análisis automático de los gastos del mes.
 * La URL y la key se resuelven en cada llamada dentro de enviarMensaje.
 */
export async function generarAnalisisAutomatico(contexto) {
  const prompt = "Analiza brevemente mis finanzas del mes actual. ¿En qué gasto más? ¿Mi balance es saludable? Dame 2 consejos concretos y cortos.";
  return await enviarMensaje(prompt, contexto);
}
