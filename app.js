/*************************************************
 * Portal Oasis - Cliente (GitHub Pages)
 * Email Link Auth + Ver docs (FAC/COT/QTE) + PDF
 *************************************************/

/* =========================
   FIREBASE CONFIG
========================= */
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

/* =========================
   SETTINGS
========================= */
// UID del dueño/admin donde están guardados los docs y customers
// (según tus capturas)
const ADMIN_UID = "jUYNuEyjprSXHkved7CXwV33Bgq2";

// URL del Hub (pon la tuya)
const HUB_URL = "https://eliezelapolinaris2017-lab.github.io/";

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);

const loginCard  = $("loginCard");
const listCard   = $("listCard");
const detailCard = $("detailCard");

const emailInput  = $("emailInput");
const sendLinkBtn = $("sendLinkBtn");
const loginMsg    = $("loginMsg");

const whoami    = $("whoami");
const docsList  = $("docsList");

const logoutBtn = $("logoutBtn");
const hubLink   = $("hubLink");

const backBtn   = $("backBtn");
const pdfBtn    = $("pdfBtn");
const detailBox = $("detailBox");
const detailMeta= $("detailMeta");

const filterBtns = Array.from(document.querySelectorAll(".chip"));

/* =========================
   STATE
========================= */
let cachedDocs = [];     // [{id, data}]
let activeFilter = "ALL";
let currentDoc = null;
let currentDocId = null;

/* =========================
   UTIL
========================= */
function baseUrl(){
  // Para GitHub Pages: esta URL es donde debe volver el email-link
  return window.location.origin + window.location.pathname;
}

function cleanUrl(){
  // Quita parámetros del email-link del URL después de entrar
  window.history.replaceState({}, document.title, baseUrl());
}

function showLoginMsg(msg, isError=false){
  loginMsg.textContent = msg || "";
  loginMsg.style.color = isError ? "var(--bad)" : "";
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function fmtMoney(n){
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}

function docTypeLabel(type){
  if(type === "FAC") return "Factura";
  if(type === "COT") return "Cotización";
  if(type === "QTE") return "Cotización";
  return type || "Documento";
}

function normalizeItems(arr){
  return (arr || []).map(i=>({
    desc: (i?.desc ?? i?.description ?? "Servicio").toString(),
    price: Number(i?.price ?? 0),
    qty: Number(i?.qty ?? 1),
    total: Number(i?.total ?? (Number(i?.price ?? 0) * Number(i?.qty ?? 1)))
  }));
}

function getCreatedAt(data){
  const t = data?.createdAt || data?._createdAtServer || data?.updatedAt;
  if(!t) return null;

  // Firestore Timestamp
  if(typeof t === "object" && typeof t.toDate === "function"){
    return t.toDate();
  }

  // ISO / string
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d){
  if(!d) return "—";
  return d.toLocaleDateString("es-PR", { year:"numeric", month:"short", day:"2-digit" });
}

function setLoggedOut(){
  loginCard.classList.remove("hidden");
  listCard.classList.add("hidden");
  detailCard.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  whoami.textContent = "—";
  docsList.innerHTML = "";
  currentDoc = null;
  currentDocId = null;
}

function setLoggedIn(){
  loginCard.classList.add("hidden");
  listCard.classList.remove("hidden");
  detailCard.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
}

/* =========================
   EMAIL LINK AUTH
========================= */
async function sendLoginLink(){
  const email = (emailInput.value || "").trim().toLowerCase();
  if(!email){
    alert("Escribe tu email.");
    return;
  }

  try{
    sendLinkBtn.disabled = true;
    showLoginMsg("Enviando enlace…");

    const actionCodeSettings = {
      url: baseUrl(),
      handleCodeInApp: true
    };

    await auth.sendSignInLinkToEmail(email, actionCodeSettings);

    // Guardamos el email para completar el login si abre el link en el mismo navegador
    localStorage.setItem("oasis_emailForSignIn", email);

    showLoginMsg("Listo. Revisa tu email y abre el enlace.");
  }catch(err){
    console.error(err);
    showLoginMsg(err?.message || "Error enviando enlace.", true);
  }finally{
    sendLinkBtn.disabled = false;
  }
}

async function completeEmailLinkIfPresent(){
  const href = window.location.href;

  // Si no es un email-link, no hacemos nada
  if(!auth.isSignInWithEmailLink(href)) return;

  try{
    showLoginMsg("Validando enlace…");

    let email = (localStorage.getItem("oasis_emailForSignIn") || "").trim().toLowerCase();

    // Si abrió el link en otro dispositivo/navegador: no hay localStorage.
    if(!email){
      email = prompt("Confirma tu email para completar el acceso:") || "";
      email = email.trim().toLowerCase();
    }

    if(!email){
      showLoginMsg("No se pudo completar el acceso (falta email).", true);
      return;
    }

    await auth.signInWithEmailLink(email, href);

    localStorage.removeItem("oasis_emailForSignIn");
    cleanUrl();
    showLoginMsg("");
  }catch(err){
    console.error(err);
    showLoginMsg(err?.message || "Error completando el acceso.", true);
  }
}

/* =========================
   FIRESTORE - LOAD DOCS
========================= */
async function fetchDocsForEmail(email){
  docsList.innerHTML = `<div class="muted">Cargando documentos…</div>`;

  // Nota: where + orderBy puede pedir índice. Si sale, crea el índice.
  const ref = db
    .collection("users").doc(ADMIN_UID)
    .collection("docs")
    .where("client.contact", "==", email)
    .orderBy("createdAt", "desc")
    .limit(50);

  const snap = await ref.get();

  const rows = [];
  snap.forEach(doc => rows.push({ id: doc.id, data: doc.data() }));

  cachedDocs = rows;
  renderList();
}

function applyFilter(rows){
  if(activeFilter === "ALL") return rows;

  if(activeFilter === "COT"){
    // soporta COT o QTE
    return rows.filter(r => (r.data?.type === "COT" || r.data?.type === "QTE"));
  }

  return rows.filter(r => r.data?.type === activeFilter);
}

function renderList(){
  const rows = applyFilter(cachedDocs);

  if(!rows.length){
    docsList.innerHTML = `<div class="muted">No hay documentos para este email/filtro.</div>`;
    return;
  }

  docsList.innerHTML = "";
  rows.forEach(({id, data})=>{
    const type = data?.type || "DOC";
    const label = docTypeLabel(type);
    const name  = data?.client?.name || "Cliente";
    const total = fmtMoney(data?.totals?.grand ?? 0);
    const d     = getCreatedAt(data);
    const date  = formatDate(d);

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(label)}</strong><br/>
        <span class="muted">${escapeHtml(name)}</span><br/>
        <span class="muted">${escapeHtml(date)} · Total: ${escapeHtml(total)}</span>
      </div>

      <div style="text-align:right; display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
        <span class="badge">${escapeHtml(type)}</span>
        <button class="ghost">Ver</button>
      </div>
    `;

    el.querySelector("button").addEventListener("click", ()=> openDetail(id, data));
    docsList.appendChild(el);
  });
}

/* =========================
   DETAIL + PDF
========================= */
function openDetail(id, data){
  currentDocId = id;
  currentDoc = data;

  listCard.classList.add("hidden");
  detailCard.classList.remove("hidden");

  const type = docTypeLabel(data?.type);
  const d = getCreatedAt(data);
  detailMeta.textContent = `${type} · ${formatDate(d)}`;

  const client = data?.client || {};
  const items = normalizeItems(data?.items);
  const totals = data?.totals || {};

  detailBox.innerHTML = `
    <div class="kv"><b>Cliente</b><div>${escapeHtml(client.name || "—")}</div></div>
    <div class="kv"><b>Email</b><div>${escapeHtml(client.contact || "—")}</div></div>
    <div class="kv"><b>Dirección</b><div>${escapeHtml(client.addr || "—")}</div></div>

    <div class="hr"></div>

    <h3 style="margin:0 0 8px">Items</h3>
    ${
      items.length
      ? items.map(it=>`
        <div class="line">
          <div>
            <div><strong>${escapeHtml(it.desc)}</strong></div>
            <div class="muted">Cant: ${it.qty}</div>
          </div>
          <div style="text-align:right">
            <div>${escapeHtml(fmtMoney(it.price))}</div>
            <div class="muted">${escapeHtml(fmtMoney(it.total))}</div>
          </div>
        </div>
      `).join("")
      : `<div class="muted">Sin items.</div>`
    }

    <div class="hr"></div>

    <div class="between">
      <div class="muted">Subtotal</div>
      <div><strong>${escapeHtml(fmtMoney(totals.sub))}</strong></div>
    </div>
    <div class="between">
      <div class="muted">IVU</div>
      <div><strong>${escapeHtml(fmtMoney(totals.tax))}</strong></div>
    </div>
    <div class="between" style="margin-top:6px">
      <div class="muted">Total</div>
      <div style="font-size:18px"><strong>${escapeHtml(fmtMoney(totals.grand))}</strong></div>
    </div>

    ${data?.notes ? `<div class="hr"></div><div class="muted">${escapeHtml(data.notes)}</div>` : ""}
    ${data?.terms ? `<div class="hr"></div><div class="muted">${escapeHtml(data.terms)}</div>` : ""}
  `;
}

function backToList(){
  detailCard.classList.add("hidden");
  listCard.classList.remove("hidden");
}

function downloadPdf(){
  if(!currentDoc) return;

  if(!window.jspdf || !window.jspdf.jsPDF){
    alert("No cargó jsPDF. Verifica el script CDN en index.html");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });

  const data = currentDoc;
  const client = data?.client || {};
  const items = normalizeItems(data?.items);
  const totals = data?.totals || {};

  const typeLabel = docTypeLabel(data?.type);
  const created = getCreatedAt(data);
  const dateStr = created ? created.toLocaleString("es-PR") : "";

  let y = 54;
  const left = 48;
  const right = 564;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(`Oasis · ${typeLabel}`, left, y);

  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(dateStr, left, y);

  y += 22;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Cliente:", left, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${client.name || ""}`, left + 60, y);

  y += 16;
  pdf.setFont("helvetica", "bold");
  pdf.text("Email:", left, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${client.contact || ""}`, left + 60, y);

  y += 16;
  pdf.setFont("helvetica", "bold");
  pdf.text("Dirección:", left, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${client.addr || ""}`.slice(0, 80), left + 60, y);

  y += 22;
  pdf.setDrawColor(200);
  pdf.line(left, y, right, y);
  y += 18;

  pdf.setFont("helvetica", "bold");
  pdf.text("Descripción", left, y);
  pdf.text("Cant.", right - 120, y, { align:"right" });
  pdf.text("Total", right, y, { align:"right" });

  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  items.forEach((it)=>{
    if(y > 720){ pdf.addPage(); y = 54; }

    const lineDesc = `${it.desc}`.slice(0, 70);
    pdf.text(lineDesc, left, y);
    pdf.text(String(it.qty), right - 120, y, { align:"right" });
    pdf.text(fmtMoney(it.total), right, y, { align:"right" });
    y += 16;
  });

  y += 8;
  pdf.line(left, y, right, y);
  y += 18;

  pdf.setFont("helvetica", "bold");
  pdf.text("Subtotal", right - 120, y, { align:"right" });
  pdf.text(fmtMoney(totals.sub), right, y, { align:"right" });

  y += 16;
  pdf.text("IVU", right - 120, y, { align:"right" });
  pdf.text(fmtMoney(totals.tax), right, y, { align:"right" });

  y += 18;
  pdf.setFontSize(12);
  pdf.text("TOTAL", right - 120, y, { align:"right" });
  pdf.text(fmtMoney(totals.grand), right, y, { align:"right" });

  y += 22;
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");

  const notes = (data?.notes || "").toString().trim();
  if(notes){
    pdf.text("Notas:", left, y);
    y += 14;
    pdf.text(notes.slice(0, 140), left, y);
    y += 14;
  }

  const terms = (data?.terms || "").toString().trim();
  if(terms){
    pdf.text("Términos:", left, y);
    y += 14;
    pdf.text(terms.slice(0, 140), left, y);
  }

  const safeName = (client.name || "cliente").replace(/[^\w]+/g, "_");
  pdf.save(`${typeLabel}_${safeName}.pdf`);
}

/* =========================
   EVENTS
========================= */
hubLink.href = HUB_URL;

sendLinkBtn.addEventListener("click", sendLoginLink);

logoutBtn.addEventListener("click", async ()=>{
  try { await auth.signOut(); }
  catch(e){ console.error(e); }
});

backBtn.addEventListener("click", backToList);
pdfBtn.addEventListener("click", downloadPdf);

filterBtns.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    filterBtns.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderList();
  });
});

/* =========================
   BOOT
========================= */
(async function boot(){
  // Completa el login si el link está presente
  await completeEmailLinkIfPresent();

  // Escucha sesión
  auth.onAuthStateChanged(async (user)=>{
    if(!user){
      setLoggedOut();
      return;
    }

    setLoggedIn();

    const email = (user.email || "").trim().toLowerCase();
    whoami.textContent = `Sesión: ${email}`;

    try{
      await fetchDocsForEmail(email);
    }catch(err){
      console.error(err);
      docsList.innerHTML = `
        <div style="color:var(--bad)">
          Error cargando documentos: ${escapeHtml(err?.message || err)}
        </div>
      `;
    }
  });
})();
