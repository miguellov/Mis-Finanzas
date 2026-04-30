import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBRTbU4OvZlDDwts9orgEalzlnXDSGuJzw",
  authDomain: "mis-finanzasml.firebaseapp.com",
  projectId: "mis-finanzasml"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let grafico;

// AGREGAR
window.agregar = async function(tipo) {
  let desc = document.getElementById("descripcion").value.trim();
  let monto = parseFloat(document.getElementById("monto").value);
  let categoria = document.getElementById("categoria").value;
  let tipoGasto = document.getElementById("tipoGasto").value;
  let tipoIngreso = document.getElementById("tipoIngreso").value;

  if (!desc || isNaN(monto)) {
    alert("Datos inválidos");
    return;
  }

  let fecha = new Date().toISOString().slice(0, 7);

  await addDoc(collection(db, "finanzas"), {
    desc,
    monto,
    tipo,
    categoria,
    tipoGasto,
    tipoIngreso,
    fecha
  });

  actualizarUI();
};

// ELIMINAR
window.eliminar = async function(id) {
  await deleteDoc(doc(db, "finanzas", id));
  actualizarUI();
};

// LEER
async function actualizarUI() {
  let lista = document.getElementById("lista");
  let listaCat = document.getElementById("listaCategorias");
  let listaIngresosTipo = document.getElementById("listaIngresosTipo");

  lista.innerHTML = "";
  listaCat.innerHTML = "";
  listaIngresosTipo.innerHTML = "";

  let ingresos = 0;
  let gastos = 0;
  let gastosFijos = 0;
  let gastosVariables = 0;

  let categorias = {};
  let ingresosTipo = {};

  const snapshot = await getDocs(collection(db, "finanzas"));

  snapshot.forEach(docSnap => {
    let t = docSnap.data();
    let id = docSnap.id;

    // LISTA CON BOTÓN ELIMINAR
    let li = document.createElement("li");
    li.innerHTML = `
      <span>${t.desc}</span>
      <strong>RD$ ${t.monto}</strong>
      <button class="delete-btn" onclick="eliminar('${id}')">✖</button>
    `;

    li.classList.add(t.tipo === "ingreso" ? "ingreso-item" : "gasto-item");
    lista.appendChild(li);

    if (t.tipo === "ingreso") {
      ingresos += t.monto;

      // INGRESOS POR TIPO (ML Studio, etc.)
      let tipo = t.tipoIngreso || "otro";
      if (!ingresosTipo[tipo]) ingresosTipo[tipo] = 0;
      ingresosTipo[tipo] += t.monto;

    } else {
      gastos += t.monto;

      if (t.tipoGasto === "fijo") {
        gastosFijos += t.monto;
      } else {
        gastosVariables += t.monto;
      }

      if (!categorias[t.categoria]) {
        categorias[t.categoria] = 0;
      }
      categorias[t.categoria] += t.monto;
    }
  });

  // RESUMEN
  document.getElementById("ingresos").innerText = "RD$ " + ingresos.toLocaleString();
  document.getElementById("gastos").innerText = "RD$ " + gastos.toLocaleString();
  document.getElementById("balance").innerText = "RD$ " + (ingresos - gastos).toLocaleString();
  document.getElementById("fijos").innerText = "RD$ " + gastosFijos.toLocaleString();
  document.getElementById("variables").innerText = "RD$ " + gastosVariables.toLocaleString();

  // CATEGORÍAS
  let totalGastos = Object.values(categorias).reduce((a, b) => a + b, 0);
  let labels = [];
  let data = [];

  for (let cat in categorias) {
    let valor = categorias[cat];
    let porcentaje = ((valor / totalGastos) * 100).toFixed(1);

    let li = document.createElement("li");
    li.innerHTML = `<span>${cat}</span><strong>RD$ ${valor} (${porcentaje}%)</strong>`;
    listaCat.appendChild(li);

    labels.push(cat);
    data.push(valor);
  }

  actualizarGrafica(labels, data);

  // INGRESOS POR TIPO (AQUÍ VERÁS ML STUDIO 🔥)
  for (let tipo in ingresosTipo) {
    let li = document.createElement("li");
    li.innerHTML = `<span>${tipo}</span><strong>RD$ ${ingresosTipo[tipo]}</strong>`;
    listaIngresosTipo.appendChild(li);
  }
}

// GRÁFICA
function actualizarGrafica(labels, data) {
  let ctx = document.getElementById("grafica").getContext("2d");

  if (grafico) grafico.destroy();

  grafico = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{ data }]
    }
  });
}

// INICIAR
actualizarUI();