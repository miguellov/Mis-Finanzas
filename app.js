// 🔥 IMPORTS FIREBASE
import { deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔥 CONFIG (USA LA TUYA)
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

    if (!desc || isNaN(monto)) {
      alert("Completa los datos");
      return;
    }

    // 🔥 GUARDAR
    await addDoc(collection(db, "finanzas"), {
      desc,
      monto,
      tipo,
      categoria,
      tipoGasto,
      fecha: new Date().toISOString(),
      mes: new Date().toISOString().slice(0, 7)
    });

    console.log("✅ Guardado correctamente");

    // limpiar inputs
    document.getElementById("descripcion").value = "";
    document.getElementById("monto").value = "";

    actualizarUI();

  } catch (error) {
    console.error("❌ ERROR AL GUARDAR:", error);
    alert("Error guardando datos");
  }
};

// ==========================
// 🔄 ACTUALIZAR UI
// ==========================
async function actualizarUI() {
  let lista = document.getElementById("lista");

  let ingresos = 0;
  let gastos = 0;

  lista.innerHTML = "";

  const snapshot = await getDocs(collection(db, "finanzas"));

  snapshot.forEach(docSnap => {
  let t = docSnap.data();
  let id = docSnap.id;

  let li = document.createElement("li");

  li.innerHTML = `
  <span>
    ${t.desc} 
    ${t.tipo === "ingreso" && t.fuenteIngreso ? `<small>(${t.fuenteIngreso})</small>` : ""}
  </span>
  <div class="item-right">
    <strong>RD$ ${t.monto}</strong>
    <button onclick="eliminar('${id}')" class="btn-delete">✖</button>
  </div>
`;

  lista.appendChild(li);

  if (t.tipo === "ingreso") ingresos += t.monto;
  else gastos += t.monto;
});

  document.getElementById("ingresos").innerText = "RD$ " + ingresos;
  document.getElementById("gastos").innerText = "RD$ " + gastos;
  document.getElementById("balance").innerText = "RD$ " + (ingresos - gastos);

// ==========================
// 📊 GRAFICA
// ==========================
let categorias = {};

snapshot.forEach(doc => {
  let t = doc.data();

  if (t.tipo === "gasto") {
    if (!categorias[t.categoria]) {
      categorias[t.categoria] = 0;
    }
    categorias[t.categoria] += t.monto;
  }
});

let labels = Object.keys(categorias);
let data = Object.values(categorias);

let canvas = document.getElementById("grafica");

if (canvas) {
  // destruir gráfica anterior si existe
  if (window.miGrafica) {
    window.miGrafica.destroy();
  }

  window.miGrafica = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: data
      }]
    }
  });
}

}

// ==========================
// 🚀 INICIO
// ==========================
actualizarUI();


// ==========================
// 📱 NAVEGACIÓN (MENÚ)
// ==========================
window.cambiarVista = function(vista) {
  const vistas = ["home", "reportes", "historial"];

  vistas.forEach(v => {
    let el = document.getElementById(v);
    if (el) el.style.display = "none";
  });

  let activa = document.getElementById(vista);
  if (activa) activa.style.display = "block";
};

window.eliminar = async function(id) {
  await deleteDoc(doc(db, "finanzas", id));
  actualizarUI();
};