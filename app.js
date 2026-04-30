// 🔥 FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyBRTbU4OvZlDDwts9orgEalzlnXDSGuJzw",
  authDomain: "mis-finanzasml.firebaseapp.com",
  projectId: "mis-finanzasml"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===============================
// 🚀 NAVEGACIÓN (BOTONES)
// ===============================
window.cambiarPantalla = function(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};

// ===============================
// ➕ AGREGAR
// ===============================
window.agregar = async function(tipo) {
  let desc = document.getElementById("descripcion").value.trim();
  let monto = parseFloat(document.getElementById("monto").value);
  let categoria = document.getElementById("categoria").value;
  let tipoGasto = document.getElementById("tipoGasto").value;

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
    fecha: new Date().toISOString()
  });

  // limpiar inputs
  document.getElementById("descripcion").value = "";
  document.getElementById("monto").value = "";

  actualizarUI();
};

// ===============================
// ❌ ELIMINAR
// ===============================
window.eliminar = async function(id) {
  await deleteDoc(doc(db, "finanzas", id));
  actualizarUI();
};

// ===============================
// 🔄 ACTUALIZAR UI
// ===============================
async function actualizarUI() {
  const lista = document.getElementById("lista");

  let ingresos = 0;
  let gastos = 0;
  let fijos = 0;
  let variables = 0;

  let categorias = {};

  lista.innerHTML = "";

  const snapshot = await getDocs(collection(db, "finanzas"));

  snapshot.forEach(docSnap => {
    let t = docSnap.data();
    let id = docSnap.id;

    // SUMAS
    if (t.tipo === "ingreso") ingresos += t.monto;
    else {
      gastos += t.monto;

      if (t.tipoGasto === "fijo") fijos += t.monto;
      else variables += t.monto;

      // categorías
      if (!categorias[t.categoria]) categorias[t.categoria] = 0;
      categorias[t.categoria] += t.monto;
    }

    // LISTA
    let li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${t.desc}</strong><br>
        <small>${t.categoria}</small>
      </div>
      <div>
        RD$ ${t.monto}
        <button onclick="eliminar('${id}')" class="delete-btn">❌</button>
      </div>
    `;

    li.classList.add(t.tipo === "ingreso" ? "ingreso-item" : "gasto-item");
    lista.appendChild(li);
  });

  // RESUMEN
  document.getElementById("ingresos").innerText = "RD$ " + ingresos.toLocaleString();
  document.getElementById("gastos").innerText = "RD$ " + gastos.toLocaleString();
  document.getElementById("fijos").innerText = "RD$ " + fijos.toLocaleString();
  document.getElementById("balance").innerText = "RD$ " + (ingresos - gastos).toLocaleString();

  // ===============================
  // 📊 GRÁFICA
  // ===============================
  let labels = Object.keys(categorias);
  let data = Object.values(categorias);

  if (window.miGrafica) {
    window.miGrafica.destroy();
  }

  const ctx = document.getElementById("grafica");

  if (ctx && labels.length > 0) {
    window.miGrafica = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: [
            "#22c55e",
            "#ef4444",
            "#3b82f6",
            "#f59e0b",
            "#a855f7"
          ]
        }]
      }
    });
  }
}

// ===============================
// 📅 FECHA BONITA
// ===============================
const fecha = document.getElementById("fechaActual");
if (fecha) {
  fecha.innerText = new Date().toLocaleDateString("es-DO", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

// ===============================
// 🚀 INICIO
// ===============================
actualizarUI();