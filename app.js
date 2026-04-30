// 🔥 IMPORTS FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔥 CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyBRTbU4OvZlDDwts9orgEalzlnXDSGuJzw",
  authDomain: "mis-finanzasml.firebaseapp.com",
  projectId: "mis-finanzasml"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================
// ➕ AGREGAR
// ==========================
window.agregar = async function(tipo) {
  try {
    let desc = document.getElementById("descripcion").value.trim();
    let monto = parseFloat(document.getElementById("monto").value);
    let categoria = document.getElementById("categoria").value;
    let tipoGasto = document.getElementById("tipoGasto").value;
    let fuenteIngreso = document.getElementById("fuenteIngreso").value;

    if (!desc || isNaN(monto)) {
      alert("Completa los datos");
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
  mes: new Date().toISOString().slice(0, 7)
});

    // limpiar inputs
    document.getElementById("descripcion").value = "";
    document.getElementById("monto").value = "";

    actualizarUI();

  } catch (error) {
    console.error("ERROR:", error);
    alert("Error guardando datos");
  }

  let metodoPago = document.getElementById("metodoPago").value;
let cuenta = document.getElementById("cuenta").value;  
};

// ==========================
// 🔄 ACTUALIZAR UI
// ==========================
async function actualizarUI() {

  let lista = document.getElementById("lista");

  let ingresos = 0;
  let gastos = 0;
  let fijos = 0;

  lista.innerHTML = "";

  const snapshot = await getDocs(collection(db, "finanzas"));

  let categorias = {};
  let ingresosFuente = {};

  snapshot.forEach(docSnap => {
    let t = docSnap.data();
    let id = docSnap.id;

    // 👉 LISTA
    let li = document.createElement("li");

    li.innerHTML = `
  <span>
    ${t.desc}
    ${t.fuenteIngreso ? `<small>(${t.fuenteIngreso})</small>` : ""}
    ${t.metodoPago ? `<small> - ${t.metodoPago}</small>` : ""}
  </span>

  <div class="item-right">
    <strong>RD$ ${t.monto}</strong>
    <button onclick="eliminar('${id}')" class="btn-delete">✖</button>
  </div>
`;

    lista.appendChild(li);

    // 👉 TOTALES
    if (t.tipo === "ingreso") {
      ingresos += t.monto;

      let fuente = t.fuenteIngreso || "Otros";

      if (!ingresosFuente[fuente]) ingresosFuente[fuente] = 0;
      ingresosFuente[fuente] += t.monto;

    } else {
      gastos += t.monto;

      if (t.tipoGasto === "fijo") {
        fijos += t.monto;
      }

      if (!categorias[t.categoria]) categorias[t.categoria] = 0;
      categorias[t.categoria] += t.monto;
    }

  });

  // 👉 ACTUALIZAR UI
  document.getElementById("ingresos").innerText = "RD$ " + ingresos;
  document.getElementById("gastos").innerText = "RD$ " + gastos;
  document.getElementById("fijos").innerText = "RD$ " + fijos;
  document.getElementById("balance").innerText = "RD$ " + (ingresos - gastos);

  // ==========================
  // 📊 GRAFICA GASTOS
  // ==========================
  let canvas = document.getElementById("grafica");

  if (canvas) {

    if (window.miGrafica) {
      window.miGrafica.destroy();
    }

    window.miGrafica = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: Object.keys(categorias),
        datasets: [{
          data: Object.values(categorias)
        }]
      }
    });
  }

  // ==========================
  // 💰 GRAFICA INGRESOS
  // ==========================
  let canvasIngresos = document.getElementById("graficaIngresos");

  if (canvasIngresos) {

    if (window.graficaIngresos) {
      window.graficaIngresos.destroy();
    }

    window.graficaIngresos = new Chart(canvasIngresos, {
      type: "doughnut",
      data: {
        labels: Object.keys(ingresosFuente),
        datasets: [{
          data: Object.values(ingresosFuente)
        }]
      }
    });
  }

}

// ==========================
// 🗑️ ELIMINAR
// ==========================
window.eliminar = async function(id) {
  await deleteDoc(doc(db, "finanzas", id));
  actualizarUI();
};

// ==========================
// 📱 NAVEGACIÓN
// ==========================
window.cambiarVista = function(vista) {

  const vistas = ["home", "reportes", "historial"];

  vistas.forEach(v => {
    document.getElementById(v).classList.remove("active");
  });

  document.getElementById(vista).classList.add("active");

  if (vista === "reportes") {
    actualizarUI(); // recarga gráfica
  }
};

// ==========================
// 🚀 INICIO
// ==========================
actualizarUI();