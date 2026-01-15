/**********************
 * CONFIG FIREBASE
 **********************/
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

// TU ADMIN UID
const ADMIN_UID = "jUYNuEyjprSXHkved7CXwV33Bgq2";

/**********************
 * UI refs
 **********************/
const loginCard = document.getElementById('loginCard');
const listCard  = document.getElementById('listCard');
const detailCard= document.getElementById('detailCard');
const logoutBtn = document.getElementById('logoutBtn');

const emailInput = document.getElementById('emailInput');
const sendCodeBtn= document.getElementById('sendCodeBtn');
const codeBox    = document.getElementById('codeBox');
const codeInput  = document.getElementById('codeInput');
const verifyCodeBtn=document.getElementById('verifyCodeBtn');
const loginMsg   = document.getElementById('loginMsg');

const docsList   = document.getElementById('docsList');
const detailBox  = document.getElementById('detailBox');
const backBtn    = document.getElementById('backBtn');
const pdfBtn     = document.getElementById('pdfBtn');

let confirmationResult = null;
let currentDoc = null;

/**********************
 * AUTH (OTP EMAIL)
 * Usamos email-link como OTP simple (sin password)
 **********************/
sendCodeBtn.onclick = async () => {
  const email = emailInput.value.trim();
  if(!email) return alert("Escribe tu email");
  const actionCodeSettings = {
    url: window.location.href,
    handleCodeInApp: true
  };
  await auth.sendSignInLinkToEmail(email, actionCodeSettings);
  window.localStorage.setItem('emailForSignIn', email);
  loginMsg.textContent = "Código enviado. Revisa tu email.";
};

verifyCodeBtn.onclick = async () => {
  const email = window.localStorage.getItem('emailForSignIn');
  if(!email) return alert("Vuelve a enviar el código");
  if(auth.isSignInWithEmailLink(window.location.href)){
    await auth.signInWithEmailLink(email, window.location.href);
    window.localStorage.removeItem('emailForSignIn');
  }else{
    alert("Link inválido");
  }
};

logoutBtn.onclick = () => auth.signOut();

auth.onAuthStateChanged(async user=>{
  if(!user){
    loginCard.classList.remove('hidden');
    listCard.classList.add('hidden');
    detailCard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    return;
  }
  logoutBtn.classList.remove('hidden');
  loginCard.classList.add('hidden');
  await loadDocs(user.email);
});

/**********************
 * LOAD DOCS
 **********************/
async function loadDocs(email){
  listCard.classList.remove('hidden');
  detailCard.classList.add('hidden');
  docsList.innerHTML = "Cargando...";

  const snap = await db
    .collection("users").doc(ADMIN_UID)
    .collection("docs")
    .where("client.contact","==",email)
    .orderBy("createdAt","desc")
    .limit(50)
    .get();

  if(snap.empty){
    docsList.innerHTML = "<p class='muted'>No hay documentos asociados a este email.</p>";
    return;
  }

  docsList.innerHTML = "";
  snap.forEach(d=>{
    const data = d.data();
    const el = document.createElement('div');
    el.className = "item";
    el.innerHTML = `
      <div>
        <strong>${data.type==="FAC"?"Factura":"Cotización"}</strong><br/>
        <span class="muted">${data.client?.name||""}</span><br/>
        <span class="muted">Total: $${data.totals?.grand||0}</span>
      </div>
      <div>
        <span class="badge">${data.type}</span><br/>
        <button class="ghost">Ver</button>
      </div>
    `;
    el.querySelector('button').onclick=()=>openDetail(d.id,data);
    docsList.appendChild(el);
  });
}

/**********************
 * DETAIL
 **********************/
function openDetail(id,data){
  currentDoc = data;
  listCard.classList.add('hidden');
  detailCard.classList.remove('hidden');

  const items = normalizeItems(data.items||[]);
  detailBox.innerHTML = `
    <p><strong>Cliente:</strong> ${data.client?.name||""}</p>
    <p><strong>Email:</strong> ${data.client?.contact||""}</p>
    <hr/>
    ${items.map(i=>`
      <div class="between">
        <span>${i.desc}</span>
        <span>${i.qty} × $${i.price}</span>
      </div>
    `).join("")}
    <hr/>
    <p><strong>Total:</strong> $${data.totals?.grand||0}</p>
    <p class="muted">${data.notes||""}</p>
  `;
}

backBtn.onclick=()=> {
  detailCard.classList.add('hidden');
  listCard.classList.remove('hidden');
};

/**********************
 * PDF
 **********************/
pdfBtn.onclick=()=>{
  if(!currentDoc) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y=10;
  doc.text("Documento",10,y); y+=8;
  doc.text(`Cliente: ${currentDoc.client?.name||""}`,10,y); y+=6;
  doc.text(`Email: ${currentDoc.client?.contact||""}`,10,y); y+=8;

  const items = normalizeItems(currentDoc.items||[]);
  items.forEach(it=>{
    doc.text(`${it.qty} x ${it.desc} - $${it.price}`,10,y);
    y+=6;
  });

  y+=6;
  doc.text(`TOTAL: $${currentDoc.totals?.grand||0}`,10,y);
  doc.save("documento.pdf");
};

/**********************
 * HELPERS
 **********************/
function normalizeItems(arr){
  return arr.map(i=>({
    desc: i.desc || "Servicio",
    price: Number(i.price||0),
    qty: Number(i.qty||1)
  }));
}
