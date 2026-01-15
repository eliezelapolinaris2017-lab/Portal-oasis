/**********************
 * PORTAL OASIS v1
 * Email Link Auth + Docs list + PDF
 **********************/

/* ========== FIREBASE CONFIG ========== */
const firebaseConfig = {
  apiKey: "AIzaSyBm67RjL0QzMRLfo6zUYCI0bak1eGJAR-U",
  authDomain: "oasis-facturacion.firebaseapp.com",
  projectId: "oasis-facturacion",
  storageBucket: "oasis-facturacion.firebasestorage.app",
  messagingSenderId: "84422038905",
  appId: "1:84422038905:web:b0eef65217d2bfc3298ba8"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// TU ADMIN UID (donde viven los docs)
const ADMIN_UID = "jUYNuEyjprSXHkved7CXwV33Bgq2";

/* ========== UI REFS ========== */
const loginCard = document.getElementById('loginCard');
const listCard  = document.getElementById('listCard');
const detailCard= document.getElementById('detailCard');
const logoutBtn = document.getElementById('logoutBtn');

const emailInput = document.getElementById('emailInput');
const sendLinkBtn = document.getElementById('sendLinkBtn'); // <- IMPORTANT
const loginMsg   = document.getElementById('loginMsg');

const docsList   = document.getElementById('docsList');
const detailBox  = document.getElementById('detailBox');
const backBtn    = document.getElementById('backBtn');
const pdfBtn     = document.getElementById('pdfBtn');

let currentDoc = null;

/* ========== HELPERS ========== */
function showMsg(msg, isError=false){
  loginMsg.textContent = msg || "";
  loginMsg.style.color = isError ? "#b91c1c" : "";
}

function baseUrl(){
  // URL limpia sin query/hash (clave para email-link)
  return window.location.origin + window.location.pathname;
}

function cleanUrl(){
  // Quita el oobCode/params del link para evitar loops
  window.history.replaceState({}, document.title, baseUrl());
}

/* ========== AUTH FLOW (EMAIL LINK) ========== */
sendLinkBtn.onclick = async () => {
  const email = (emailInput.value || "").trim().toLowerCase();
  if(!email) return alert("Escribe tu email");

  try{
    sendLinkBtn.disabled = true;
    showMsg("Enviando enlace…");

    const actionCodeSettings = {
      url: baseUrl(),
      handleCodeInApp: true
    };

    await auth.sendSignInLinkToEmail(email, actionCodeSettings);
    localStorage.setItem("emailForSignIn", email);

    showMsg("Listo. Revisa tu email y abre el enlace.");
  }catch(err){
    console.error(err);
    showMsg(err?.message || "Error enviando enlace.", true);
  }finally{
    sendLinkBtn.disabled = false;
  }
};

async function completeEmailLinkSignInIfPresent(){
  // Si abriste un email link, aquí se completa el login
  const href = window.location.href;

  if(!auth.isSignInWithEmailLink(href)) return;

  try{
    showMsg("Validando enlace…");

    let email = (localStorage.getItem("emailForSignIn") || "").trim().toLowerCase();

    // Si el link se abrió en otro navegador/dispositivo, no hay localStorage:
    if(!email){
      email = prompt("Confirma tu email para completar el acceso:") || "";
      email = email.trim().toLowerCase();
    }

    if(!email){
      showMsg("No se pudo completar el acceso: falta el email.", true);
      return;
    }

    await auth.signInWithEmailLink(email, href);

    localStorage.removeItem("emailForSignIn");
    cleanUrl();
    showMsg(""); // limpia
  }catch(err){
    console.error(err);
    showMsg(err?.message || "Error completando acceso.", true);
  }
}

/* ========== STATE UI ========== */
function setLoggedOut(){
  loginCard.classList.remove('hidden');
  listCard.classList.add('hidden');
  detailCard.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

function setLoggedIn(){
  loginCard.classList.add('hidden');
  listCard.classList.remove('hidden');
  detailCard.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
}

logoutBtn.onclick = async () => {
  await auth.signOut();
};

/* ========== LOAD DOCS ========== */
async function loadDocs(email){
  docsList.innerHTML = "Cargando…";

  try{
    const snap = await db
      .collection("users").doc(ADMIN_UID)
      .collection("docs")
      .where("client.contact", "==", email)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    if(snap.empty){
      docsList.innerHTML = `<p class="muted">No hay documentos asociados a <b>${email}</b>.</p>`;
      return;
    }

    docsList.innerHTML = "";
    snap.forEach(d=>{
      const data = d.data();
      const grand = Number(data?.totals?.grand || 0).toFixed(2);

      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div>
          <strong>${data.type === "FAC" ? "Factura" : "Cotización"}</strong><br/>
          <span class="muted">${data.client?.name || ""}</span><br/>
          <span class="muted">Total: $${grand}</span>
        </div>
        <div style="text-align:right">
          <span class="badge">${data.type || "DOC"}</span><br/>
          <button class="ghost">Ver</button>
        </div>
      `;

      el.querySelector("button").onclick = () => openDetail(d.id, data);
      docsList.appendChild(el);
    });

  }catch(err){
    console.error(err);
    docsList.innerHTML = `<p class="muted" style="color:#b91c1c">Error cargando docs: ${err?.message || err}</p>`;
  }
}

/* ========== DETAIL + PDF ========== */
function normalizeItems(arr){
  return (arr || []).map(i=>({
    desc: (i?.desc || "Servicio").toString(),
    price: Number(i?.price || 0),
    qty: Number(i?.qty || 1)
  }));
}

function openDetail(id, data){
  currentDoc = data;

  listCard.classList.add('hidden');
  detailCard.classList.remove('hidden');

  const items = normalizeItems(data.items);
  const grand = Number(data?.totals?.grand || 0).toFixed(2);

  detailBox.innerHTML = `
    <p><strong>Cliente:</strong> ${data.client?.name || ""}</p>
    <p><strong>Email:</strong> ${data.client?.contact || ""}</p>
    <p><strong>Tipo:</strong> ${data.type || ""}</p>
    <hr/>
    ${items.map(i=>`
      <div class="between">
        <span>${escapeHtml(i.desc)}</span>
        <span>${i.qty} × $${i.price.toFixed(2)}</span>
      </div>
    `).join("")}
    <hr/>
    <p><strong>Total:</strong> $${grand}</p>
    ${data.notes ? `<p class="muted">${escapeHtml(data.notes)}</p>` : ""}
  `;
}

backBtn.onclick = () => {
  detailCard.classList.add('hidden');
  listCard.classList.remove('hidden');
};

pdfBtn.onclick = () => {
  if(!currentDoc) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const email = currentDoc?.client?.contact || "";
  const name  = currentDoc?.client?.name || "";
  const type  = currentDoc?.type === "FAC" ? "Factura" : "Cotización";
  const items = normalizeItems(currentDoc.items);
  const totals = currentDoc?.totals || {};
  const grand = Number(totals?.grand || 0).toFixed(2);
  const sub   = Number(totals?.sub || 0).toFixed(2);
  const tax   = Number(totals?.tax || 0).toFixed(2);

  let y = 14;
  pdf.setFontSize(14);
  pdf.text(`Oasis · ${type}`, 12, y); y += 10;

  pdf.setFontSize(11);
  pdf.text(`Cliente: ${name}`, 12, y); y += 6;
  pdf.text(`Email: ${email}`, 12, y); y += 8;

  pdf.text(`Items:`, 12, y); y += 6;

  items.forEach(it=>{
    const line = `${it.qty} x ${it.desc}`.slice(0, 70);
    pdf.text(line, 12, y);
    pdf.text(`$${(it.price * it.qty).toFixed(2)}`, 170, y, { align: "right" });
    y += 6;
    if(y > 270){ pdf.addPage(); y = 14; }
  });

  y += 6;
  pdf.text(`Subtotal: $${sub}`, 170, y, { align: "right" }); y += 6;
  pdf.text(`IVU: $${tax}`, 170, y, { align: "right" }); y += 6;
  pdf.setFontSize(12);
  pdf.text(`TOTAL: $${grand}`, 170, y, { align: "right" }); y += 10;

  const filename = `${type}_${(name || "cliente").replace(/\s+/g,"_")}.pdf`;
  pdf.save(filename);
};

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

/* ========== BOOT ========== */
(async function boot(){
  // 1) si hay email-link, complétalo antes de escuchar el state
  await completeEmailLinkSignInIfPresent();

  // 2) state listener
  auth.onAuthStateChanged(async (user)=>{
    if(!user){
      setLoggedOut();
      return;
    }

    setLoggedIn();

    // IMPORTANTE: normaliza email a lowercase para matchear exacto
    const email = (user.email || "").trim().toLowerCase();
    await loadDocs(email);
  });
})();
