/* ============================================================================
   SISTEMA GERENCIAL DE RECICLAGEM
   ----------------------------------------------------------------------------
   1) COLE SUAS CREDENCIAIS DO FIREBASE ABAIXO (Console Firebase > Configurações
      do projeto > Seus apps > Configuração do SDK).
   2) Ative "Authentication > E-mail/senha" e crie o usuário admin@admin.com.
   3) Ative o "Realtime Database" e publique as regras do arquivo
      database.rules.json (fornecido junto com este projeto).
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDueOpl3tlLcv_EIvFjI2RoAy9yVKJMMyg",
  authDomain: "ssj2-f526f.firebaseapp.com",
  projectId: "ssj2-f526f",
  storageBucket: "ssj2-f526f.firebasestorage.app",
  messagingSenderId: "496833025593",
  appId: "1:496833025593:web:7f82b5eab3c5dcd0e19fe8"
};

const ADMIN_EMAIL = "admin@admin.com"; // único usuário com permissão de escrita

/* ------------------------------ imports ---------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, push, set, update, remove, onValue, get, child,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ------------------------------ helpers ---------------------------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
let MOEDA = "R$";
const money = (v) => `${MOEDA} ` + num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = (v) => num(v).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const un = (v) => num(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const prodUnid = (id) => (state.produtos[id] && state.produtos[id].unidade === "un" ? "un" : "kg");
/* formata quantidade respeitando a unidade do produto/lancamento */
const qtd = (v, u) => (u === "un" ? un(v) + " un" : kg(v) + " kg");
const unidDe = (o) => (o && o.unidade === "un" ? "un" : (o && o.unidade === "kg" ? "kg" : prodUnid(o && o.produtoId)));
/* string combinada "1.000,000 kg . 12 un" */
const dual = (k, u2) => {
  const parts = [];
  if (k || !u2) parts.push(kg(k) + " kg");
  if (u2) parts.push(un(u2) + " un");
  return parts.join(" \u00b7 ");
};
const dtLocal = (iso) => new Date(iso).toLocaleString("pt-BR");
const toInputDT = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = "toast"), 3200);
}
function loader(on, text = "Carregando sistema...") {
  $("#loaderText").textContent = text;
  $("#loader").classList.toggle("open", on);
}

/* ------------------------------ estado ----------------------------------- */
const state = { produtos: {}, lancamentos: {}, ajustes: {}, contas: {}, financeiro: {}, ui: {}, usuarios: {}, perfil: null, user: null, editLanc: null, editProd: null, editMov: null, editConta: null, editUser: null, fotoTmp: "", usrFoto: "", carrinho: [] };
/* fracionamento de pagamentos: definidos cedo pois são usados pelos
   renderizadores iniciais da tela */
const cent = (v) => Math.round(num(v) * 100) / 100;
const splitState = { lanc: [], cx: [] };
const SPLIT_CFG = {
  lanc: {
    main: "#lancConta", mainVal: "#lancPagValor", wrap: "#lancPagExtra", resumo: "#lancPagResumo",
    total: () => num($("#lancPeso").value) * num($("#lancPreco").value),
  },
  cx: {
    main: "#cxConta", mainVal: "#cxPagValor", wrap: "#cxPagExtra", resumo: "#cxPagResumo",
    total: () => state.carrinho.reduce((s, i) => s + num(i.total), 0),
  },
};

const isAdmin = () => !!(state.user && (state.user.email === ADMIN_EMAIL || (state.perfil && state.perfil.cargo === "admin")));
/* todos os acessos possiveis marcados (usado para o administrador) */
function acessosTotais() {
  const o = { escrita: true, usuarios: true };
  (typeof VIEWS_DISPONIVEIS !== "undefined" ? VIEWS_DISPONIVEIS : []).forEach((v) => { o[v.id] = true; });
  return o;
}
function guard() {
  if (typeof podeEscrever === "function" ? !podeEscrever() : !isAdmin()) {
    toast("Seu usuário não tem permissão para gravar dados.", true); return false;
  }
  return true;
}

/* ------------------------------ tema ------------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}
applyTheme(localStorage.getItem("theme") || "dark");
$("#themeFabLogin").onclick = toggleTheme;
$("#themeBtn").onclick = toggleTheme;

/* ------------------------------ interface editável ----------------------- */
const UI_DEFAULT = {
  brand: "Sistema Gerencial Sucata São José",
  loginTitle: "Sucata São José",
  loginSubtitle: "Entre com suas credenciais",
  logo: "logo.png",
  primary: "#22c55e",
  accent: "#38bdf8",
  radius: 12,
  font: 15,
  theme: "dark",
  moeda: "R$",
  menu: "Painel,Lançamentos,Estoque,Produtos,Relatórios,Import/Export,Interface,Compra/Venda,Financeiro",
};
function applyUI(ui) {
  const u = { ...UI_DEFAULT, ...(ui || {}) };
  state.ui = u;
  MOEDA = u.moeda || "R$";
  const r = document.documentElement.style;
  r.setProperty("--primary", u.primary);
  r.setProperty("--accent", u.accent);
  r.setProperty("--radius", u.radius + "px");
  r.setProperty("--fs", u.font + "px");
  $("#brandName").textContent = u.brand;
  $("#loginTitle").textContent = u.loginTitle;
  $("#loginSubtitle").textContent = u.loginSubtitle;
  if (u.logo) { $("#logoImg").src = u.logo; $("#brandLogo") && ($("#brandLogo").src = u.logo); }
  const labels = String(u.menu).split(",");
  $$(".nav-item").filter((b) => !["perfil", "usuarios"].includes(b.dataset.view))
    .forEach((b, i) => { if (labels[i]) b.querySelector("span").textContent = labels[i].trim(); });
  if (!localStorage.getItem("theme")) applyTheme(u.theme);
  // preencher formulário admin
  $("#uiBrand").value = u.brand; $("#uiLoginTitle").value = u.loginTitle;
  $("#uiLoginSubtitle").value = u.loginSubtitle; $("#uiLogo").value = u.logo;
  $("#uiPrimary").value = u.primary; $("#uiAccent").value = u.accent;
  $("#uiRadius").value = u.radius; $("#uiFont").value = u.font;
  $("#uiTheme").value = u.theme; $("#uiMoeda").value = u.moeda; $("#uiMenu").value = u.menu;
}
applyUI(JSON.parse(localStorage.getItem("uiCache") || "null"));

$("#uiForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  const ui = {
    brand: $("#uiBrand").value, loginTitle: $("#uiLoginTitle").value,
    loginSubtitle: $("#uiLoginSubtitle").value, logo: $("#uiLogo").value,
    primary: $("#uiPrimary").value, accent: $("#uiAccent").value,
    radius: num($("#uiRadius").value) || 12, font: num($("#uiFont").value) || 15,
    theme: $("#uiTheme").value, moeda: $("#uiMoeda").value || "R$", menu: $("#uiMenu").value,
  };
  await set(ref(db, "config/ui"), ui);
  toast("Interface atualizada.");
});
$("#uiReset").onclick = async () => { if (!guard()) return; await set(ref(db, "config/ui"), UI_DEFAULT); toast("Interface restaurada."); };

/* ------------------------------ login ------------------------------------ */
$("#pwToggle").onclick = () => {
  const p = $("#password"); p.type = p.type === "password" ? "text" : "password";
};
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); // Enter também dispara este submit
  const msg = $("#loginMsg");
  msg.className = "msg"; msg.textContent = "";
  loader(true, "Autenticando...");
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
  } catch (err) {
    loader(false);
    msg.className = "msg error";
    msg.textContent = traduzErro(err.code);
  }
});
$("#forgotBtn").onclick = () => {
  $("#resetEmail").value = $("#email").value.trim();
  $("#resetModal").classList.add("open");
};
$$("[data-close]").forEach((b) => (b.onclick = () => $("#" + b.dataset.close).classList.remove("open")));
$("#resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#resetMsg"); msg.className = "msg"; msg.textContent = "Enviando...";
  try {
    await sendPasswordResetEmail(auth, $("#resetEmail").value.trim());
    msg.className = "msg ok"; msg.textContent = "Link enviado! Verifique seu e-mail.";
  } catch (err) { msg.className = "msg error"; msg.textContent = traduzErro(err.code); }
});
function traduzErro(code) {
  const m = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tente mais tarde.",
    "auth/network-request-failed": "Falha de conexão.",
    "auth/missing-password": "Informe a senha.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "Senha muito fraca (mínimo 6 caracteres).",
    "auth/operation-not-allowed": "Ative o provedor E-mail/senha no Firebase.",
  };
  return m[code] || "Erro: " + code;
}
$("#logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
  state.user = user;
  if (user) {
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#userBadge").textContent = user.email;
    loader(true, "Carregando sistema...");
    try { startListeners(); }
    catch (err) {
      console.error("Falha ao iniciar os listeners:", err);
      loader(false);
      toast("Erro ao carregar o sistema: " + (err && err.message ? err.message : err), true);
    }
  } else {
    stopListeners();
    state.perfil = null;
    $("#app").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
    $("#password").value = "";
    loader(false);
  }
});

/* ------------------------------ relógio ---------------------------------- */
setInterval(() => { $("#clock").textContent = new Date().toLocaleString("pt-BR"); }, 1000);

/* ------------------------------ navegação -------------------------------- */
$$(".nav-item").forEach((btn) => {
  btn.onclick = () => {
    const alvo = $("#view-" + btn.dataset.view);
    if (!alvo) { console.warn("View inexistente:", btn.dataset.view); return; }
    $$(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".view").forEach((v) => v.classList.add("hidden"));
    alvo.classList.remove("hidden");
    closeSidebar();
  };
});
const openSidebar = () => { $("#sidebar").classList.add("open"); $("#sidebarBackdrop").classList.add("open"); };
const closeSidebar = () => { $("#sidebar").classList.remove("open"); $("#sidebarBackdrop").classList.remove("open"); };
$("#menuBtn").onclick = openSidebar;
$("#sidebarBackdrop").onclick = closeSidebar;

/* ------------------------------ listeners RTDB --------------------------- */
let loadedOnce = false;
let loaderTimer = null;
let unsubs = [];
let usuariosWatching = false;

function stopListeners() {
  unsubs.forEach((u) => { try { u(); } catch (e) {} });
  unsubs = [];
  usuariosWatching = false;
  clearTimeout(loaderTimer);
}

/* observa um caminho de forma tolerante a falhas: qualquer erro (permissão,
   conexão ou exceção de renderização) nunca deixa a tela de carregamento presa */
function watch(path, handler) {
  const un = onValue(
    ref(db, path),
    (snap) => {
      try { handler(snap.val()); }
      catch (err) { console.error("Erro ao processar '" + path + "':", err); }
      finally { done(); }
    },
    (err) => {
      console.warn("Sem acesso a '" + path + "':", (err && err.code) || err);
      done();
    }
  );
  unsubs.push(un);
}

function startListeners() {
  stopListeners();
  loadedOnce = false;
  /* rede de segurança: se nada responder em 10s, libera a tela mesmo assim */
  loaderTimer = setTimeout(() => {
    if (!loadedOnce) {
      loadedOnce = true;
      loader(false);
      toast("Não foi possível carregar todos os dados. Verifique sua conexão.", true);
    }
  }, 10000);

  watch("config/ui", (v) => {
    if (v) localStorage.setItem("uiCache", JSON.stringify(v));
    applyUI(v);
  });
  watch("produtos", (v) => { state.produtos = v || {}; renderProdutos(); fillProductSelects(); renderAll(); });
  watch("lancamentos", (v) => { state.lancamentos = v || {}; renderAll(); });
  watch("ajustes", (v) => { state.ajustes = v || {}; renderAll(); });
  watch("contas", (v) => { state.contas = v || {}; fillContaSelects(); renderAll(); });
  watch("financeiro", (v) => { state.financeiro = v || {}; renderAll(); });

  watch("usuarios/" + state.user.uid, (v) => {
    const ehAdminEmail = (state.user.email || "").toLowerCase() === ADMIN_EMAIL;
    /* garante que admin@admin.com seja sempre administrador com acesso total */
    if (ehAdminEmail) {
      if (!v) {
        set(ref(db, "usuarios/" + state.user.uid), {
          nome: "Administrador", sobrenome: "", whatsapp: "", email: state.user.email,
          cargo: "admin", ativo: true, foto: "", acessos: acessosTotais(), criadoEm: Date.now(),
        }).catch((e) => console.warn("Falha ao criar perfil do admin:", e));
      } else if (v.cargo !== "admin" || v.ativo === false) {
        update(ref(db, "usuarios/" + state.user.uid), { cargo: "admin", ativo: true })
          .catch((e) => console.warn("Falha ao corrigir perfil do admin:", e));
      }
    }

    if (v) {
      state.perfil = v;
    } else {
      /* funcionário autenticado sem cadastro liberado: entra com acesso mínimo,
         nunca fica travado na tela de carregamento */
      state.perfil = {
        email: state.user.email,
        cargo: ehAdminEmail ? "admin" : "funcionario",
        ativo: true,
        acessos: ehAdminEmail ? acessosTotais() : { dashboard: true },
      };
      if (!ehAdminEmail) toast("Seu cadastro ainda não foi liberado pelo administrador. Acesso limitado.", true);
    }

    if (!ehAdminEmail && state.perfil.ativo === false) {
      toast("Seu acesso foi desativado pelo administrador.", true);
      loader(false);
      setTimeout(() => signOut(auth), 1500);
      return;
    }

    preencherPerfil();
    aplicarAcessos();
    /* a lista completa de funcionários é visível apenas ao administrador */
    if (isAdmin() && !usuariosWatching) {
      usuariosWatching = true;
      watch("usuarios", (all) => { state.usuarios = all || {}; renderUsuarios(); });
    }
  });
}

function done() {
  if (!loadedOnce) {
    loadedOnce = true;
    clearTimeout(loaderTimer);
    setTimeout(() => loader(false), 300);
  }
}

/* ------------------------------ produtos --------------------------------- */
$("#prodForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  const p = {
    nome: $("#prodNome").value.trim(),
    categoria: $("#prodCat").value.trim(),
    unidade: $("#prodUnid").value === "un" ? "un" : "kg",
    precoCompra: num($("#prodCompra").value),
    precoVenda: num($("#prodVenda").value),
  };
  if (state.editProd) await update(ref(db, "produtos/" + state.editProd), p);
  else await push(ref(db, "produtos"), p);
  state.editProd = null;
  e.target.reset();
  toast("Produto salvo.");
});
$("#prodCancel").onclick = () => { state.editProd = null; $("#prodForm").reset(); };

function renderProdutos() {
  const tb = $("#tblProdutos tbody"); tb.innerHTML = "";
  const list = Object.entries(state.produtos).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="7" class="empty">Nenhum produto cadastrado.</td></tr>`;
    renderPager("tblProdutos", "produtos", 0, renderProdutos, "produto(s)");
    return;
  }
  for (const [id, p] of paginar("produtos", list)) {
    const margem = num(p.precoVenda) - num(p.precoCompra);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.nome}</td><td>${p.categoria || "-"}</td><td>${p.unidade === "un" ? "un" : "kg"}</td><td>${money(p.precoCompra)}</td>
      <td>${money(p.precoVenda)}</td><td>${money(margem)}</td>
      <td><button class="btn mini" data-e="${id}">Editar</button>
          <button class="btn mini danger" data-d="${id}">Excluir</button></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => {
    const p = state.produtos[b.dataset.e]; state.editProd = b.dataset.e;
    $("#prodNome").value = p.nome; $("#prodCat").value = p.categoria || "";
    $("#prodUnid").value = p.unidade === "un" ? "un" : "kg";
    $("#prodCompra").value = p.precoCompra || ""; $("#prodVenda").value = p.precoVenda || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  tb.querySelectorAll("[data-d]").forEach((b) => (b.onclick = async () => {
    if (!guard() || !confirm("Excluir produto?")) return;
    await remove(ref(db, "produtos/" + b.dataset.d)); toast("Produto excluído.");
  }));
  renderPager("tblProdutos", "produtos", list.length, renderProdutos, "produto(s)");
}
function fillProductSelects() {
  const list = Object.entries(state.produtos).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  const opts = list.map(([id, p]) => `<option value="${id}">${p.nome} (${p.unidade === "un" ? "un" : "kg"})</option>`).join("");
  $("#lancProduto").innerHTML = opts;
  $("#ajProduto").innerHTML = opts;
  $("#cxProduto").innerHTML = opts;
  $("#fProduto").innerHTML = `<option value="">Todos</option>` + opts;
  if ($("#simProduto")) $("#simProduto").innerHTML = opts;
  fillRelProdutos();
  rotulosLanc(); rotulosAjuste(); rotulosCaixa(); rotulosSim();
}
const prodNome = (id) => (state.produtos[id] ? state.produtos[id].nome : "(removido)");

/* preço sugerido ao trocar produto/tipo */
function rotulosLanc() {
  const u = prodUnid($("#lancProduto").value);
  $("#lancPesoLbl").textContent = u === "un" ? "Quantidade (un)" : "Peso (kg)";
  $("#lancPrecoLbl").textContent = u === "un" ? "Preço por unidade (R$)" : "Preço por kg (R$)";
  $("#lancPeso").step = u === "un" ? "1" : "0.001";
}
function rotulosAjuste() {
  const u = prodUnid($("#ajProduto").value);
  $("#ajPesoLbl").textContent = u === "un" ? "Quantidade (un)" : "Peso (kg)";
  $("#ajCustoLbl").textContent = u === "un" ? "Custo médio por unidade (R$)" : "Custo médio por kg (R$)";
  $("#ajPeso").step = u === "un" ? "1" : "0.001";
}
$("#ajProduto").onchange = rotulosAjuste;

function sugerirPreco() {
  rotulosLanc();
  const p = state.produtos[$("#lancProduto").value];
  if (!p) return;
  $("#lancPreco").value = $("#lancTipo").value === "venda" ? (p.precoVenda || "") : (p.precoCompra || "");
  calcTotal();
}
$("#lancProduto").onchange = sugerirPreco;
$("#lancTipo").onchange = sugerirPreco;
function calcTotal() {
  $("#lancTotal").textContent = "Total: " + money(num($("#lancPeso").value) * num($("#lancPreco").value));
  if (typeof atualizaSplit === "function") atualizaSplit("lanc");
}
$("#lancPeso").oninput = calcTotal;
$("#lancPreco").oninput = calcTotal;

/* ------------------------------ lançamentos ------------------------------ */
$("#lancData").value = toInputDT(new Date());
$("#lancForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  const pg = coletaPagamentos("lanc");
  if (pg.erro) return toast(pg.erro, true);
  const l = {
    data: new Date($("#lancData").value).toISOString(),
    tipo: $("#lancTipo").value,
    produtoId: $("#lancProduto").value,
    produtoNome: prodNome($("#lancProduto").value),
    unidade: prodUnid($("#lancProduto").value),
    peso: num($("#lancPeso").value),
    preco: num($("#lancPreco").value),
    total: num($("#lancPeso").value) * num($("#lancPreco").value),
    pessoa: $("#lancPessoa").value.trim(),
    contaId: pg.lista[0].contaId,
    pagamentos: pg.lista,
    obs: $("#lancObs").value.trim(),
    criadoEm: Date.now(),
  };
  if (!l.produtoId) return toast("Cadastre um produto primeiro.", true);
  if (!l.contaId) return toast("Cadastre uma conta/caixa no Financeiro antes de lançar.", true);
  if (state.editLanc) await update(ref(db, "lancamentos/" + state.editLanc), l);
  else await push(ref(db, "lancamentos"), l);
  state.editLanc = null;
  $("#lancPeso").value = ""; $("#lancPessoa").value = ""; $("#lancObs").value = "";
  $("#lancData").value = toInputDT(new Date());
  limpaSplit("lanc");
  calcTotal();
  toast("Lançamento salvo.");
});
$("#lancCancel").onclick = () => { state.editLanc = null; $("#lancForm").reset(); $("#lancData").value = toInputDT(new Date()); fillContaSelects(); limpaSplit("lanc"); calcTotal(); };


["#fDe", "#fAte", "#fProduto", "#fTipo", "#fBusca"].forEach((s) => {
  const reset = () => { resetPagina("lanc"); renderLancamentos(); };
  $(s).addEventListener("input", reset);
  $(s).addEventListener("change", reset);
});
$("#fLimpar").onclick = () => { ["#fDe", "#fAte", "#fBusca"].forEach((s) => ($(s).value = "")); $("#fProduto").value = ""; $("#fTipo").value = ""; resetPagina("lanc"); renderLancamentos(); };

function lancArray() {
  return Object.entries(state.lancamentos)
    .map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => new Date(b.data) - new Date(a.data));
}
function aplicaFiltros(arr) {
  const de = $("#fDe").value, ate = $("#fAte").value;
  const pid = $("#fProduto").value, tipo = $("#fTipo").value;
  const q = $("#fBusca").value.toLowerCase();
  return arr.filter((l) => {
    const d = dayKey(l.data);
    if (de && d < de) return false;
    if (ate && d > ate) return false;
    if (pid && l.produtoId !== pid) return false;
    if (tipo && l.tipo !== tipo) return false;
    if (q && !((l.pessoa || "") + " " + (l.obs || "") + " " + (l.produtoNome || "")).toLowerCase().includes(q)) return false;
    return true;
  });
}
/* ============================ PAGINAÇÃO GENÉRICA ==========================
   30 itens por página, no máximo 5 números de página visíveis e setas < >
   para navegar quando existirem mais páginas.
   ======================================================================== */
const POR_PAGINA = 30;
const PAGS_VISIVEIS = 5;
state.pages = state.pages || {};

const totalPaginas = (total) => Math.max(1, Math.ceil(total / POR_PAGINA));

function paginar(key, rows) {
  const tp = totalPaginas(rows.length);
  let cur = Number(state.pages[key] || 1);
  if (cur > tp) cur = tp;
  if (cur < 1) cur = 1;
  state.pages[key] = cur;
  const ini = (cur - 1) * POR_PAGINA;
  return rows.slice(ini, ini + POR_PAGINA);
}

function resetPagina(key) { state.pages[key] = 1; }

/* devolve (criando se preciso) o container do pager logo após a tabela */
function pagerHost(tableId) {
  const fixo = document.getElementById(tableId + "Pager");
  if (fixo) return fixo;
  const t = document.getElementById(tableId);
  if (!t) return null;
  let el = document.getElementById("pager-" + tableId);
  if (!el) {
    el = document.createElement("div");
    el.className = "pager";
    el.id = "pager-" + tableId;
    const host = t.closest(".table-wrap") || t;
    host.insertAdjacentElement("afterend", el);
  }
  return el;
}

function renderPager(tableId, key, total, rerender, rotulo) {
  const el = pagerHost(tableId);
  if (!el) return;
  const tp = totalPaginas(total);
  if (total <= POR_PAGINA) { el.innerHTML = ""; return; }
  const cur = Number(state.pages[key] || 1);
  let ini = Math.max(1, cur - Math.floor(PAGS_VISIVEIS / 2));
  let fim = Math.min(tp, ini + PAGS_VISIVEIS - 1);
  ini = Math.max(1, fim - PAGS_VISIVEIS + 1);
  const setas = tp > PAGS_VISIVEIS;
  let html = `<span class="pager-info">Página ${cur} de ${tp} · ${total} ${rotulo || "registro(s)"}</span><div class="pager-btns">`;
  if (setas) html += `<button class="btn mini" data-pg="${cur - 1}" ${cur === 1 ? "disabled" : ""} aria-label="Página anterior">&lt;</button>`;
  for (let pg = ini; pg <= fim; pg++) {
    html += `<button class="btn mini ${pg === cur ? "primary" : ""}" data-pg="${pg}">${pg}</button>`;
  }
  if (setas) html += `<button class="btn mini" data-pg="${cur + 1}" ${cur === tp ? "disabled" : ""} aria-label="Próxima página">&gt;</button>`;
  html += `</div>`;
  el.innerHTML = html;
  el.querySelectorAll("[data-pg]").forEach((b) => (b.onclick = () => {
    const pg = Number(b.dataset.pg);
    if (pg < 1 || pg > tp || pg === Number(state.pages[key] || 1)) return;
    state.pages[key] = pg;
    rerender();
    const t = document.getElementById(tableId);
    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function renderLancamentos() {
  const rows = aplicaFiltros(lancArray());
  const tb = $("#tblLanc tbody"); tb.innerHTML = "";
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="10" class="empty">Nenhum lançamento no filtro.</td></tr>`;
    $("#tblLanc tfoot").innerHTML = "";
    renderPager("tblLanc", "lanc", 0, renderLancamentos, "lançamento(s)");
    return;
  }
  const pagina = paginar("lanc", rows);
  for (const l of pagina) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${dtLocal(l.data)}</td><td><span class="tag ${l.tipo}">${l.tipo}</span></td>
      <td>${l.produtoNome || prodNome(l.produtoId)}</td><td>${qtd(l.peso, unidDe(l))}</td><td>${money(l.preco)}</td>
      <td>${money(l.total)}</td><td>${l.pessoa || "-"}</td><td>${pagamentosResumo(l)}</td><td>${l.obs || "-"}</td>
      <td><button class="btn mini" data-e="${l.id}">Editar</button>
          <button class="btn mini danger" data-d="${l.id}">Excluir</button></td>`;
    tb.appendChild(tr);
  }
  const tPeso = rows.filter((l) => unidDe(l) !== "un").reduce((s, l) => s + num(l.peso), 0);
  const tUn = rows.filter((l) => unidDe(l) === "un").reduce((s, l) => s + num(l.peso), 0);
  const tC = rows.filter((l) => l.tipo === "compra").reduce((s, l) => s + num(l.total), 0);
  const tV = rows.filter((l) => l.tipo === "venda").reduce((s, l) => s + num(l.total), 0);
  $("#tblLanc tfoot").innerHTML = `<tr><td colspan="3">${rows.length} registro(s) · exibindo ${pagina.length}</td><td>${dual(tPeso, tUn)}</td>
    <td>Compras</td><td>${money(tC)}</td><td>Vendas</td><td colspan="3">${money(tV)}</td></tr>`;

  renderPager("tblLanc", "lanc", rows.length, renderLancamentos, "lançamento(s)");

  tb.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => {
    const l = state.lancamentos[b.dataset.e]; state.editLanc = b.dataset.e;
    $("#lancData").value = toInputDT(new Date(l.data)); $("#lancTipo").value = l.tipo;
    $("#lancProduto").value = l.produtoId; rotulosLanc(); $("#lancPeso").value = l.peso;
    $("#lancPreco").value = l.preco; $("#lancPessoa").value = l.pessoa || ""; $("#lancObs").value = l.obs || "";
    const pl = pagamentosDe(l);
    $("#lancConta").value = pl[0].contaId && state.contas[pl[0].contaId] ? pl[0].contaId : contaPadraoId();
    $("#lancPagValor").value = pl.length > 1 ? pl[0].valor : "";
    splitState.lanc = pl.slice(1).map((p) => ({ contaId: p.contaId, valor: p.valor }));
    renderSplit("lanc");
    calcTotal(); window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  tb.querySelectorAll("[data-d]").forEach((b) => (b.onclick = async () => {
    if (!guard() || !confirm("Excluir lançamento?")) return;
    await remove(ref(db, "lancamentos/" + b.dataset.d)); toast("Lançamento excluído.");
  }));
}

/* ------------------------------ estoque ---------------------------------- */
$("#ajusteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  const a = {
    data: new Date().toISOString(),
    produtoId: $("#ajProduto").value,
    produtoNome: prodNome($("#ajProduto").value),
    unidade: prodUnid($("#ajProduto").value),
    tipo: $("#ajTipo").value,
    peso: num($("#ajPeso").value),
    custo: num($("#ajCusto").value),
    obs: $("#ajObs").value.trim(),
  };
  if (!a.produtoId) return toast("Cadastre um produto primeiro.", true);
  await push(ref(db, "ajustes"), a);
  e.target.reset();
  toast("Ajuste registrado.");
});

function calcEstoque() {
  const map = {};
  const ini = (id) => (map[id] = map[id] || { inicial: 0, comprado: 0, vendido: 0, ajuste: 0, custoAcum: 0, kgCusto: 0 });
  for (const [, a] of Object.entries(state.ajustes)) {
    const m = ini(a.produtoId);
    if (a.tipo === "inicial") { m.inicial += num(a.peso); m.custoAcum += num(a.peso) * num(a.custo); m.kgCusto += num(a.peso); }
    else if (a.tipo === "entrada") m.ajuste += num(a.peso);
    else m.ajuste -= num(a.peso);
  }
  for (const [, l] of Object.entries(state.lancamentos)) {
    const m = ini(l.produtoId);
    if (l.tipo === "compra") { m.comprado += num(l.peso); m.custoAcum += num(l.total); m.kgCusto += num(l.peso); }
    else m.vendido += num(l.peso);
  }
  for (const id in map) {
    const m = map[id];
    m.saldo = m.inicial + m.comprado - m.vendido + m.ajuste;
    m.custoMedio = m.kgCusto ? m.custoAcum / m.kgCusto : 0;
    m.valor = m.saldo * m.custoMedio;
  }
  return map;
}
function renderEstoque() {
  const map = calcEstoque();
  const tb = $("#tblEstoque tbody"); tb.innerHTML = "";
  const ids = Object.keys(map);
  if (!ids.length) { tb.innerHTML = `<tr><td colspan="8" class="empty">Sem movimentação.</td></tr>`; }
  ids.sort((a, b) => prodNome(a).localeCompare(prodNome(b)));
  renderPager("tblEstoque", "estoque", ids.length, renderEstoque, "produto(s)");
  paginar("estoque", ids).forEach((id) => {
    const m = map[id];
    const u = prodUnid(id);
    const f = (v) => (u === "un" ? un(v) : kg(v));
    tb.insertAdjacentHTML("beforeend", `<tr><td>${prodNome(id)}</td><td>${u}</td><td>${f(m.inicial)}</td><td>${f(m.comprado)}</td>
      <td>${f(m.vendido)}</td><td>${f(m.ajuste)}</td><td><strong>${f(m.saldo)} ${u}</strong></td><td>${money(m.valor)}</td></tr>`);
  });

  const ta = $("#tblAjustes tbody"); ta.innerHTML = "";
  const list = Object.entries(state.ajustes).map(([id, a]) => ({ id, ...a })).sort((a, b) => new Date(b.data) - new Date(a.data));
  if (!list.length) ta.innerHTML = `<tr><td colspan="7" class="empty">Nenhum ajuste.</td></tr>`;
  renderPager("tblAjustes", "ajustes", list.length, renderEstoque, "ajuste(s)");
  paginar("ajustes", list).forEach((a) => {
    ta.insertAdjacentHTML("beforeend", `<tr><td>${dtLocal(a.data)}</td><td>${a.produtoNome || prodNome(a.produtoId)}</td>
      <td>${a.tipo}</td><td>${qtd(a.peso, unidDe(a))}</td><td>${money(a.custo)}</td><td>${a.obs || "-"}</td>
      <td><button class="btn mini danger" data-da="${a.id}">Excluir</button></td></tr>`);
  });
  ta.querySelectorAll("[data-da]").forEach((b) => (b.onclick = async () => {
    if (!guard() || !confirm("Excluir ajuste?")) return;
    await remove(ref(db, "ajustes/" + b.dataset.da)); toast("Ajuste excluído.");
  }));

  const totalKg = Object.keys(map).filter((id) => prodUnid(id) !== "un").reduce((s, id) => s + map[id].saldo, 0);
  const totalUn = Object.keys(map).filter((id) => prodUnid(id) === "un").reduce((s, id) => s + map[id].saldo, 0);
  const valor = Object.values(map).reduce((s, m) => s + m.valor, 0);
  $("#kpiEstoque").textContent = dual(totalKg, totalUn);
  $("#kpiEstoqueValor").textContent = money(valor);
}

/* ------------------------------ dashboard -------------------------------- */
function renderDashboard() {
  const hoje = dayKey(new Date().toISOString());
  const arr = lancArray();
  const dia = arr.filter((l) => dayKey(l.data) === hoje);
  const compras = dia.filter((l) => l.tipo === "compra");
  const vendas = dia.filter((l) => l.tipo === "venda");
  $("#kpiKgHoje").textContent = dual(
    compras.filter((l) => unidDe(l) !== "un").reduce((s, l) => s + num(l.peso), 0),
    compras.filter((l) => unidDe(l) === "un").reduce((s, l) => s + num(l.peso), 0),
  );
  const gasto = compras.reduce((s, l) => s + num(l.total), 0);
  const venda = vendas.reduce((s, l) => s + num(l.total), 0);
  $("#kpiGastoHoje").textContent = money(gasto);
  $("#kpiVendaHoje").textContent = money(venda);
  $("#kpiLucroHoje").textContent = money(venda - gasto);

  const tb = $("#tblUltimos tbody"); tb.innerHTML = "";
  const top = arr.slice(0, 10);
  if (!top.length) tb.innerHTML = `<tr><td colspan="6" class="empty">Sem lançamentos ainda.</td></tr>`;
  top.forEach((l) => tb.insertAdjacentHTML("beforeend",
    `<tr><td>${dtLocal(l.data)}</td><td>${l.produtoNome || prodNome(l.produtoId)}</td>
     <td><span class="tag ${l.tipo}">${l.tipo}</span></td><td>${qtd(l.peso, unidDe(l))}</td><td>${money(l.preco)}</td><td>${money(l.total)}</td></tr>`));
}

/* ------------------------------ relatórios ------------------------------- */
$("#relRef").value = new Date().toISOString().slice(0, 10);
$("#relGerar").onclick = renderRelatorio;
$("#relTipo").onchange = renderRelatorio;
$("#relRef").onchange = renderRelatorio;
if ($("#relMovTipo")) $("#relMovTipo").onchange = renderRelatorio;

function relProdutosSel() {
  const box = $("#relProdutos");
  if (!box) return [];
  return Array.from(box.querySelectorAll("input:checked")).map((i) => i.value);
}
function fillRelProdutos() {
  const box = $("#relProdutos");
  if (!box) return;
  const marcados = new Set(relProdutosSel());
  const list = Object.entries(state.produtos).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  box.innerHTML = list.length
    ? list.map(([id, p]) => `<label class="chk"><input type="checkbox" value="${id}" ${marcados.has(id) ? "checked" : ""} /><span>${p.nome} (${p.unidade === "un" ? "un" : "kg"})</span></label>`).join("")
    : `<span class="muted">Nenhum produto cadastrado.</span>`;
  box.querySelectorAll("input").forEach((i) => (i.onchange = renderRelatorio));
}
if ($("#relProdTodos")) $("#relProdTodos").onclick = () => {
  $("#relProdutos").querySelectorAll("input").forEach((i) => (i.checked = true));
  renderRelatorio();
};
if ($("#relProdNenhum")) $("#relProdNenhum").onclick = () => {
  $("#relProdutos").querySelectorAll("input").forEach((i) => (i.checked = false));
  renderRelatorio();
};
function relMovTipo() { return ($("#relMovTipo") && $("#relMovTipo").value) || ""; }
$("#relPrint").onclick = () => window.print();

/* semana (segunda a domingo) que contém a data informada (YYYY-MM-DD) */
function semanaDe(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  const dow = (base.getDay() + 6) % 7; // 0 = segunda
  const ini = new Date(base); ini.setDate(base.getDate() - dow);
  const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
  const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { de: fmt(ini), ate: fmt(fim) };
}
function periodoRel() {
  const tipo = $("#relTipo").value;
  const ref0 = $("#relRef").value || new Date().toISOString().slice(0, 10);
  if (tipo === "diario") return { de: ref0, ate: ref0, label: "Dia " + ref0 };
  if (tipo === "semanal") {
    const s = semanaDe(ref0);
    return { de: s.de, ate: s.ate, label: `Semana ${s.de.split("-").reverse().join("/")} a ${s.ate.split("-").reverse().join("/")}` };
  }
  if (tipo === "mensal") {
    const [y, m] = ref0.split("-");
    const last = new Date(Number(y), Number(m), 0).getDate();
    return { de: `${y}-${m}-01`, ate: `${y}-${m}-${String(last).padStart(2, "0")}`, label: `Mês ${m}/${y}` };
  }
  const y = ref0.slice(0, 4);
  return { de: `${y}-01-01`, ate: `${y}-12-31`, label: "Ano " + y };
}
function relRows() {
  const { de, ate } = periodoRel();
  const sel = relProdutosSel();
  const tipoMov = relMovTipo();
  const arr = lancArray()
    .filter((l) => dayKey(l.data) >= de && dayKey(l.data) <= ate)
    .filter((l) => !sel.length || sel.includes(l.produtoId))
    .filter((l) => !tipoMov || l.tipo === tipoMov);
  const map = {};
  arr.forEach((l) => {
    const m = (map[l.produtoId] = map[l.produtoId] || { kgC: 0, rC: 0, kgV: 0, rV: 0, unidade: unidDe(l) });
    m.unidade = unidDe(l);
    if (l.tipo === "compra") { m.kgC += num(l.peso); m.rC += num(l.total); }
    else { m.kgV += num(l.peso); m.rV += num(l.total); }
  });
  return map;
}
function renderRelatorio() {
  const map = relRows();
  const tb = $("#tblRel tbody"); tb.innerHTML = "";
  let kgC = 0, kgV = 0, unC = 0, unV = 0, tC = 0, tV = 0;
  const ids = Object.keys(map);
  if (!ids.length) tb.innerHTML = `<tr><td colspan="6" class="empty">Sem dados no período.</td></tr>`;
  ids.sort((a, b) => prodNome(a).localeCompare(prodNome(b))).forEach((id) => {
    const m = map[id]; tC += m.rC; tV += m.rV;
    const u = prodUnid(id);
    if (u === "un") { unC += m.kgC; unV += m.kgV; } else { kgC += m.kgC; kgV += m.kgV; }
    tb.insertAdjacentHTML("beforeend", `<tr><td>${prodNome(id)}</td><td>${qtd(m.kgC, u)}</td><td>${money(m.rC)}</td>
      <td>${qtd(m.kgV, u)}</td><td>${money(m.rV)}</td><td>${money(m.rV - m.rC)}</td></tr>`);
  });
  $("#relKgC").textContent = dual(kgC, unC); $("#relKgV").textContent = dual(kgV, unV);
  $("#relTotC").textContent = money(tC); $("#relTotV").textContent = money(tV);
  $("#relResult").textContent = money(tV - tC);
}
$("#relCsv").onclick = () => {
  const map = relRows();
  const lines = [["Produto", "Unidade", "Qtd compra", "R$ compra", "Qtd venda", "R$ venda", "Resultado"]];
  Object.keys(map).forEach((id) => {
    const m = map[id];
    lines.push([prodNome(id), prodUnid(id), m.kgC, m.rC.toFixed(2), m.kgV, m.rV.toFixed(2), (m.rV - m.rC).toFixed(2)]);
  });
  baixar(csv(lines), `relatorio-${periodoRel().label.replace(/[ /]/g, "_")}.csv`, "text/csv");
};

/* ------------------------------ import / export -------------------------- */
function csv(rows) {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}
function baixar(conteudo, nome, mime) {
  const blob = new Blob(["\ufeff" + conteudo], { type: mime + ";charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  URL.revokeObjectURL(a.href);
}
function filtraPeriodoObj(obj, de, ate) {
  const out = {};
  Object.entries(obj || {}).forEach(([id, v]) => {
    const d = dayKey(v.data || new Date().toISOString());
    if ((!de || d >= de) && (!ate || d <= ate)) out[id] = v;
  });
  return out;
}
function dumpAtual() {
  const escopo = $("#expEscopo").value;
  const de = $("#expDe").value, ate = $("#expAte").value;
  if (escopo === "full") {
    return { config: { ui: state.ui }, produtos: state.produtos, lancamentos: state.lancamentos, ajustes: state.ajustes, contas: state.contas, financeiro: state.financeiro };
  }
  return {
    config: { ui: state.ui },
    produtos: state.produtos,
    lancamentos: filtraPeriodoObj(state.lancamentos, de, ate),
    ajustes: filtraPeriodoObj(state.ajustes, de, ate),
    contas: state.contas,
    financeiro: filtraPeriodoObj(state.financeiro, de, ate),
  };
}
$("#expJson").onclick = () => {
  const data = { exportadoEm: new Date().toISOString(), ...dumpAtual() };
  baixar(JSON.stringify(data, null, 2), `backup-reciclagem-${Date.now()}.json`, "application/json");
  toast("Exportação concluída.");
};
$("#expCsv").onclick = () => {
  const d = dumpAtual();
  const rows = [["Data", "Tipo", "Produto", "Unidade", "Quantidade", "Preco unitario", "Total", "Pagamentos", "Pessoa", "Obs"]];
  Object.values(d.lancamentos || {})
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .forEach((l) => rows.push([dtLocal(l.data), l.tipo, l.produtoNome || prodNome(l.produtoId), unidDe(l),
      unidDe(l) === "un" ? String(num(l.peso)) : num(l.peso).toFixed(3),
      num(l.preco).toFixed(2), num(l.total).toFixed(2), pagamentosResumo(l), l.pessoa || "", l.obs || ""]));
  baixar(csv(rows), `lancamentos-${Date.now()}.csv`, "text/csv");
};
$("#impBtn").onclick = async () => {
  const msg = $("#impMsg"); msg.className = "msg";
  if (!guard()) return;
  const f = $("#impFile").files[0];
  if (!f) { msg.className = "msg error"; msg.textContent = "Selecione um arquivo JSON."; return; }
  try {
    const data = JSON.parse(await f.text());
    const modo = $("#impModo").value;
    if (modo === "replace") {
      if (!confirm("Isso substituirá TODOS os dados atuais. Continuar?")) return;
      await set(ref(db, "/"), {
        config: data.config || { ui: state.ui },
        produtos: data.produtos || {},
        lancamentos: data.lancamentos || {},
        ajustes: data.ajustes || {},
        contas: data.contas || {},
        financeiro: data.financeiro || {},
      });
    } else {
      const upd = {};
      Object.entries(data.produtos || {}).forEach(([k, v]) => (upd["produtos/" + k] = v));
      Object.entries(data.lancamentos || {}).forEach(([k, v]) => (upd["lancamentos/" + k] = v));
      Object.entries(data.ajustes || {}).forEach(([k, v]) => (upd["ajustes/" + k] = v));
      Object.entries(data.contas || {}).forEach(([k, v]) => (upd["contas/" + k] = v));
      Object.entries(data.financeiro || {}).forEach(([k, v]) => (upd["financeiro/" + k] = v));
      if (data.config && data.config.ui) upd["config/ui"] = data.config.ui;
      await update(ref(db, "/"), upd);
    }
    msg.className = "msg ok"; msg.textContent = "Importação concluída com sucesso.";
    toast("Dados importados.");
  } catch (err) {
    msg.className = "msg error"; msg.textContent = "Falha na importação: " + err.message;
  }
};


/* ------------------------------ compra / venda (carrinho) ---------------- */
$("#cxData").value = toInputDT(new Date());

function rotulosCaixa() {
  const u = prodUnid($("#cxProduto").value);
  $("#cxQtdLbl").textContent = u === "un" ? "Quantidade (un)" : "Peso (kg)";
  $("#cxPrecoLbl").textContent = u === "un" ? "Preço por unidade (R$)" : "Preço por kg (R$)";
  $("#cxQtd").step = u === "un" ? "1" : "0.001";
}
function sugerirPrecoCaixa() {
  rotulosCaixa();
  const p = state.produtos[$("#cxProduto").value];
  if (!p) return;
  $("#cxPreco").value = $("#cxTipo").value === "venda" ? (p.precoVenda || "") : (p.precoCompra || "");
  calcSubtotalCaixa();
}
function calcSubtotalCaixa() {
  $("#cxSubtotal").textContent = "Subtotal: " + money(num($("#cxQtd").value) * num($("#cxPreco").value));
}
$("#cxProduto").onchange = sugerirPrecoCaixa;
$("#cxTipo").onchange = sugerirPrecoCaixa;
$("#cxQtd").oninput = calcSubtotalCaixa;
$("#cxPreco").oninput = calcSubtotalCaixa;

$("#cxItemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const pid = $("#cxProduto").value;
  if (!pid) return toast("Cadastre um produto primeiro.", true);
  const q = num($("#cxQtd").value);
  const pr = num($("#cxPreco").value);
  if (q <= 0) return toast("Informe a quantidade.", true);
  state.carrinho.push({
    produtoId: pid,
    produtoNome: prodNome(pid),
    unidade: prodUnid(pid),
    peso: q,
    preco: pr,
    total: q * pr,
    obs: $("#cxItemObs").value.trim(),
  });
  $("#cxQtd").value = ""; $("#cxItemObs").value = "";
  calcSubtotalCaixa();
  renderCarrinho();
  toast("Item adicionado ao carrinho.");
});

function renderCarrinho() {
  const tb = $("#tblCaixa tbody"); tb.innerHTML = "";
  if (!state.carrinho.length) {
    tb.innerHTML = `<tr><td colspan="6" class="empty">Nenhum item adicionado.</td></tr>`;
    $("#tblCaixa tfoot").innerHTML = "";
  } else {
    state.carrinho.forEach((it, i) => {
      tb.insertAdjacentHTML("beforeend", `<tr><td>${it.produtoNome}</td><td>${qtd(it.peso, it.unidade)}</td>
        <td>${money(it.preco)}</td><td>${money(it.total)}</td><td>${it.obs || "-"}</td>
        <td><button class="btn mini danger" data-rm="${i}">Remover</button></td></tr>`);
    });
    const tKg = state.carrinho.filter((i) => i.unidade !== "un").reduce((s, i) => s + num(i.peso), 0);
    const tUn = state.carrinho.filter((i) => i.unidade === "un").reduce((s, i) => s + num(i.peso), 0);
    const tVal = state.carrinho.reduce((s, i) => s + num(i.total), 0);
    $("#tblCaixa tfoot").innerHTML = `<tr><td>${state.carrinho.length} item(ns)</td><td>${dual(tKg, tUn)}</td>
      <td>Total</td><td colspan="3">${money(tVal)}</td></tr>`;
    tb.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => {
      state.carrinho.splice(Number(b.dataset.rm), 1);
      renderCarrinho();
    }));
  }
  const kgT = state.carrinho.filter((i) => i.unidade !== "un").reduce((s, i) => s + num(i.peso), 0);
  const unT = state.carrinho.filter((i) => i.unidade === "un").reduce((s, i) => s + num(i.peso), 0);
  $("#cxTotKg").textContent = kg(kgT) + " kg";
  $("#cxTotUn").textContent = un(unT) + " un";
  $("#cxTotItens").textContent = String(state.carrinho.length);
  $("#cxTotValor").textContent = money(state.carrinho.reduce((s, i) => s + num(i.total), 0));
  if (typeof atualizaSplit === "function") atualizaSplit("cx");
}
renderCarrinho();

$("#cxLimpar").onclick = () => {
  if (!state.carrinho.length) return;
  if (!confirm("Limpar todos os itens do carrinho?")) return;
  state.carrinho = [];
  renderCarrinho();
  toast("Carrinho limpo.");
};

$("#cxFinalizar").onclick = async () => {
  if (!guard()) return;
  if (!state.carrinho.length) return toast("Adicione ao menos um item.", true);
  const dataISO = new Date($("#cxData").value || toInputDT(new Date())).toISOString();
  const tipo = $("#cxTipo").value;
  const pessoa = $("#cxPessoa").value.trim();
  const obsGeral = $("#cxObs").value.trim();
  const pg = coletaPagamentos("cx");
  if (pg.erro) return toast(pg.erro, true);
  const pagamentos = pg.lista;
  const contaId = pagamentos[0].contaId;
  if (!contaId) return toast("Cadastre uma conta/caixa no Financeiro antes de lançar.", true);
  const agora = Date.now();
  const opId = "op" + agora;
  /* o fracionamento da operação é distribuído entre os itens do carrinho */
  const rateio = ratearPagamentos(state.carrinho, pagamentos);
  try {
    /* cada item vira um lançamento independente, igual ao cadastro manual */
    for (let i = 0; i < state.carrinho.length; i++) {
      const it = state.carrinho[i];
      await push(ref(db, "lancamentos"), {
        data: dataISO,
        tipo,
        produtoId: it.produtoId,
        produtoNome: it.produtoNome,
        unidade: it.unidade,
        peso: it.peso,
        preco: it.preco,
        total: it.total,
        pessoa,
        contaId: (rateio[i][0] || {}).contaId || contaId,
        pagamentos: rateio[i],
        obs: [obsGeral, it.obs].filter(Boolean).join(" | "),
        operacaoId: opId,
        criadoEm: agora,
      });
    }
    const n = state.carrinho.length;
    state.ultimaOperacao = { data: dataISO, tipo, pessoa, obs: obsGeral, contaId, pagamentos, itens: state.carrinho.slice() };
    state.carrinho = [];
    renderCarrinho();
    limpaSplit("cx");
    $("#cxPessoa").value = ""; $("#cxObs").value = "";
    $("#cxData").value = toInputDT(new Date());
    toast(`${n} lançamento(s) registrado(s) com sucesso.`);
  } catch (err) {
    toast("Falha ao finalizar: " + err.message, true);
  }
};

/* ------------------------------ render geral ----------------------------- */
function renderAll() {
  renderDashboard();
  renderLancamentos();
  renderEstoque();
  renderRelatorio();
  renderFinanceiro();
}

/* ========================================================================== */
/* ============================== FINANCEIRO ================================ */
/* ========================================================================== */

const CAT_ENTRADA = [
  "Venda de material", "Depósito", "Aporte de sócio", "Empréstimo recebido",
  "Rendimento", "Devolução", "Outras receitas",
];
const CAT_SAIDA = [
  "Compra de material", "Aluguel", "Água", "Luz", "Internet", "Telefone",
  "Combustível", "Salários", "Encargos / impostos", "Manutenção",
  "Fornecedores", "Retirada / pró-labore", "Transporte / frete", "Outras despesas",
];

$("#finData").value = toInputDT(new Date());

function fillCategorias() {
  const lista = $("#finTipo").value === "entrada" ? CAT_ENTRADA : CAT_SAIDA;
  const atual = $("#finCategoria").value;
  $("#finCategoria").innerHTML = lista.map((c) => `<option value="${c}">${c}</option>`).join("");
  if (lista.includes(atual)) $("#finCategoria").value = atual;
}
$("#finTipo").onchange = fillCategorias;
fillCategorias();

/* --------------------------- contas / caixas ------------------------------ */
function contasArray() {
  return Object.entries(state.contas)
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}
function contaPadraoId() {
  const list = contasArray();
  const p = list.find((c) => c.padrao);
  return (p || list[0] || {}).id || "";
}
function contaNome(id) { return state.contas[id] ? state.contas[id].nome : (id ? "(conta removida)" : "Sem conta"); }

/* ============================ PAGAMENTOS FRACIONADOS ======================
   Uma compra/venda pode ser paga em mais de uma conta/caixa (ex.: R$ 10 no
   Pix e R$ 20 em espécie). O lançamento guarda `pagamentos: [{contaId,valor}]`
   e mantém `contaId` (conta principal) para compatibilidade com registros
   antigos, que continuam funcionando exatamente como antes.
   ======================================================================== */

function pagamentosDe(o) {
  const total = cent(o && o.total);
  const lista = Array.isArray(o && o.pagamentos) ? o.pagamentos : null;
  if (lista) {
    const val = lista
      .map((p) => ({ contaId: p.contaId || contaPadraoId(), valor: cent(p.valor) }))
      .filter((p) => p.valor > 0);
    if (val.length) return val;
  }
  return [{ contaId: (o && o.contaId) || contaPadraoId(), valor: total }];
}
function pagamentosResumo(o) {
  const l = pagamentosDe(o);
  if (l.length === 1) return contaNome(l[0].contaId);
  return l.map((p) => `${contaNome(p.contaId)}: ${money(p.valor)}`).join(" \u00b7 ");
}
/* distribui os pagamentos da operação entre os itens, sem sobra de centavos */
function ratearPagamentos(itens, pagamentos) {
  const restos = pagamentos.map((p) => ({ contaId: p.contaId, resta: cent(p.valor) }));
  return itens.map((it) => {
    let falta = cent(it.total);
    const out = [];
    const soma = (contaId, valor) => {
      const ja = out.find((x) => x.contaId === contaId);
      if (ja) ja.valor = cent(ja.valor + valor);
      else out.push({ contaId, valor: cent(valor) });
    };
    for (const r of restos) {
      if (falta <= 0) break;
      if (r.resta <= 0) continue;
      const usa = cent(Math.min(r.resta, falta));
      r.resta = cent(r.resta - usa);
      falta = cent(falta - usa);
      soma(r.contaId, usa);
    }
    if (falta > 0) soma((restos[restos.length - 1] || {}).contaId || contaPadraoId(), falta);
    return out.length ? out : [{ contaId: (restos[0] || {}).contaId || contaPadraoId(), valor: cent(it.total) }];
  });
}

/* ---- interface de fracionamento (Lançamentos e Compra/Venda) ------------- */
function renderSplit(key) {
  const cfg = SPLIT_CFG[key];
  const wrap = $(cfg.wrap);
  if (!wrap) return;
  const opts = contasArray().map((c) => `<option value="${c.id}">${escDoc(c.nome)}</option>`).join("");
  wrap.innerHTML = splitState[key].map((p, i) => `<div class="pag-row">
      <select data-sp="${key}" data-i="${i}">${opts}</select>
      <input type="number" step="0.01" min="0" data-spv="${key}" data-i="${i}" placeholder="0,00" value="${p.valor === "" || p.valor == null ? "" : p.valor}" />
      <button type="button" class="btn mini danger" data-spr="${key}" data-i="${i}">Remover</button>
    </div>`).join("");
  splitState[key].forEach((p, i) => {
    const sel = wrap.querySelector(`select[data-sp="${key}"][data-i="${i}"]`);
    if (!sel) return;
    sel.value = p.contaId && state.contas[p.contaId] ? p.contaId : contaPadraoId();
    p.contaId = sel.value;
  });
  wrap.querySelectorAll("[data-sp]").forEach((sel) => (sel.onchange = () => {
    splitState[key][Number(sel.dataset.i)].contaId = sel.value; atualizaSplit(key);
  }));
  wrap.querySelectorAll("[data-spv]").forEach((inp) => (inp.oninput = () => {
    splitState[key][Number(inp.dataset.i)].valor = inp.value; atualizaSplit(key);
  }));
  wrap.querySelectorAll("[data-spr]").forEach((b) => (b.onclick = () => {
    splitState[key].splice(Number(b.dataset.i), 1); renderSplit(key);
  }));
  atualizaSplit(key);
}
function atualizaSplit(key) {
  const cfg = SPLIT_CFG[key];
  const el = $(cfg.resumo);
  if (!el) return;
  const total = cent(cfg.total());
  const extras = cent(splitState[key].reduce((s, p) => s + num(p.valor), 0));
  const mainEl = $(cfg.mainVal);
  const informado = mainEl && String(mainEl.value).trim() !== "" ? cent(mainEl.value) : null;
  if (mainEl) mainEl.placeholder = money(Math.max(0, cent(total - extras)));
  el.className = "muted pag-resumo";
  if (!splitState[key].length && informado === null) {
    el.textContent = total > 0 ? `Total ${money(total)} em uma única conta.` : "";
    return;
  }
  if (informado === null) {
    el.textContent = `Total ${money(total)} · outras contas ${money(extras)} · conta principal ${money(Math.max(0, cent(total - extras)))}`;
    return;
  }
  const dif = cent(total - cent(extras + informado));
  if (Math.abs(dif) < 0.005) el.textContent = `Fracionamento conferido: ${money(total)} distribuídos.`;
  else if (dif > 0) { el.className = "muted pag-resumo alerta"; el.textContent = `Faltam ${money(dif)} para fechar o total de ${money(total)}.`; }
  else { el.className = "muted pag-resumo alerta"; el.textContent = `Excedeu ${money(-dif)} em relação ao total de ${money(total)}.`; }
}
function coletaPagamentos(key) {
  const cfg = SPLIT_CFG[key];
  const total = cent(cfg.total());
  const mainEl = $(cfg.mainVal);
  const mainConta = ($(cfg.main) && $(cfg.main).value) || contaPadraoId();
  const extras = splitState[key]
    .map((p) => ({ contaId: p.contaId || contaPadraoId(), valor: cent(p.valor) }))
    .filter((p) => p.valor > 0);
  const somaExtras = cent(extras.reduce((s, p) => s + p.valor, 0));
  const informado = mainEl && String(mainEl.value).trim() !== "" ? cent(mainEl.value) : null;
  const mainValor = informado === null ? cent(total - somaExtras) : informado;
  const lista = [];
  const soma = (contaId, valor) => {
    const ja = lista.find((x) => x.contaId === contaId);
    if (ja) ja.valor = cent(ja.valor + valor);
    else lista.push({ contaId, valor: cent(valor) });
  };
  if (mainValor > 0) soma(mainConta, mainValor);
  extras.forEach((p) => soma(p.contaId, p.valor));
  if (!lista.length || lista.some((p) => !p.contaId)) {
    return { erro: "Cadastre uma conta/caixa no Financeiro e informe os valores do pagamento." };
  }
  const soma1 = cent(lista.reduce((s, p) => s + p.valor, 0));
  if (Math.abs(soma1 - total) > 0.005) {
    return { erro: `A soma dos pagamentos (${money(soma1)}) não fecha com o total (${money(total)}).` };
  }
  return { lista };
}
function limpaSplit(key) {
  splitState[key] = [];
  const cfg = SPLIT_CFG[key];
  if ($(cfg.mainVal)) $(cfg.mainVal).value = "";
  renderSplit(key);
}
if ($("#lancPagAdd")) $("#lancPagAdd").onclick = () => { splitState.lanc.push({ contaId: contaPadraoId(), valor: "" }); renderSplit("lanc"); };
if ($("#cxPagAdd")) $("#cxPagAdd").onclick = () => { splitState.cx.push({ contaId: contaPadraoId(), valor: "" }); renderSplit("cx"); };
if ($("#lancPagValor")) $("#lancPagValor").oninput = () => atualizaSplit("lanc");
if ($("#cxPagValor")) $("#cxPagValor").oninput = () => atualizaSplit("cx");
if ($("#lancConta")) $("#lancConta").addEventListener("change", () => atualizaSplit("lanc"));
if ($("#cxConta")) $("#cxConta").addEventListener("change", () => atualizaSplit("cx"));

function fillContaSelects() {
  const opts = contasArray().map((c) => `<option value="${c.id}">${c.nome}</option>`).join("");
  const padrao = contaPadraoId();
  ["#finConta", "#finTrDe", "#finTrPara", "#cxConta", "#lancConta"].forEach((sel) => {
    const el = $(sel); if (!el) return;
    const atual = el.value;
    el.innerHTML = opts;
    if (atual && state.contas[atual]) el.value = atual;
    else if ((sel === "#finConta" || sel === "#cxConta" || sel === "#lancConta") && padrao) el.value = padrao;
  });
  const lista = contasArray();
  if (lista.length > 1 && $("#finTrPara").value === $("#finTrDe").value) {
    $("#finTrPara").value = lista.find((c) => c.id !== $("#finTrDe").value).id;
  }
  ["#finFConta", "#relConta"].forEach((sel) => {
    const f = $(sel); if (!f) return;
    const atualF = f.value;
    f.innerHTML = `<option value="">Todas</option>` + opts;
    if (atualF && state.contas[atualF]) f.value = atualF;
  });
  if (typeof renderSplit === "function") { renderSplit("lanc"); renderSplit("cx"); }
}


$("#finContaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  const c = {
    nome: $("#finContaNome").value.trim(),
    tipo: $("#finContaTipo").value,
    saldoInicial: num($("#finContaSaldo").value),
    padrao: $("#finContaPadrao").value === "sim",
  };
  if (!c.nome) return toast("Informe o nome da conta.", true);
  if (c.padrao) {
    const upd = {};
    contasArray().forEach((o) => { if (o.id !== state.editConta) upd["contas/" + o.id + "/padrao"] = false; });
    if (Object.keys(upd).length) await update(ref(db, "/"), upd);
  }
  if (state.editConta) await update(ref(db, "contas/" + state.editConta), c);
  else await push(ref(db, "contas"), c);
  state.editConta = null;
  e.target.reset();
  toast("Conta salva.");
});
$("#finContaCancel").onclick = () => { state.editConta = null; $("#finContaForm").reset(); };

/* --------------------------- movimentos ----------------------------------- */
/* Movimentos operacionais são derivados automaticamente dos lançamentos de
   compra e venda, então nunca ficam fora de sincronia com o estoque.        */
function movimentosOperacionais() {
  const out = [];
  Object.entries(state.lancamentos).forEach(([id, l]) => {
    const pags = pagamentosDe(l);
    pags.forEach((p, i) => {
      out.push({
        id: "op:" + id + (pags.length > 1 ? ":" + i : ""),
        origem: "operacional",
        data: l.data,
        tipo: l.tipo === "venda" ? "entrada" : "saida",
        categoria: l.tipo === "venda" ? "Venda de material" : "Compra de material",
        contaId: p.contaId,
        valor: num(p.valor),
        forma: "dinheiro",
        status: "pago",
        pessoa: l.pessoa || "",
        desc: `${l.tipo === "venda" ? "Venda" : "Compra"} de ${l.produtoNome || prodNome(l.produtoId)} (${qtd(l.peso, unidDe(l))})`
          + (pags.length > 1 ? ` — parte em ${contaNome(p.contaId)} de ${money(l.total)}` : ""),
        lancamentoId: id,
      });
    });
  });
  return out;
}
function movimentosManuais() {
  return Object.entries(state.financeiro).map(([id, m]) => ({ id, origem: "manual", ...m }));
}
function movimentosTodos() {
  return [...movimentosManuais(), ...movimentosOperacionais()]
    .sort((a, b) => new Date(b.data) - new Date(a.data));
}
function movPago(m) { return (m.status || "pago") !== "pendente"; }
function movSinal(m) { return m.tipo === "entrada" ? 1 : -1; }

function saldoContas() {
  const map = {};
  contasArray().forEach((c) => (map[c.id] = { inicial: num(c.saldoInicial), mov: 0 }));
  movimentosTodos().forEach((m) => {
    if (!movPago(m)) return;
    if (!map[m.contaId]) map[m.contaId] = { inicial: 0, mov: 0 };
    map[m.contaId].mov += movSinal(m) * num(m.valor);
  });
  Object.values(map).forEach((v) => (v.saldo = v.inicial + v.mov));
  return map;
}
function saldoCaixaTotal() { return Object.values(saldoContas()).reduce((s, v) => s + v.saldo, 0); }

$("#finMovForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  if (!contasArray().length) return toast("Cadastre uma conta/caixa primeiro.", true);
  const m = {
    data: new Date($("#finData").value || new Date()).toISOString(),
    tipo: $("#finTipo").value,
    categoria: $("#finCategoria").value,
    contaId: $("#finConta").value,
    valor: num($("#finValor").value),
    forma: $("#finForma").value,
    venc: $("#finVenc").value || "",
    status: $("#finStatus").value,
    pessoa: $("#finPessoa").value.trim(),
    desc: $("#finDesc").value.trim(),
    criadoEm: Date.now(),
  };
  if (m.valor <= 0) return toast("Informe um valor maior que zero.", true);
  if (state.editMov) await update(ref(db, "financeiro/" + state.editMov), m);
  else await push(ref(db, "financeiro"), m);
  state.editMov = null;
  $("#finValor").value = ""; $("#finDesc").value = ""; $("#finPessoa").value = ""; $("#finVenc").value = "";
  $("#finData").value = toInputDT(new Date());
  toast("Movimento financeiro salvo.");
});
$("#finMovCancel").onclick = () => {
  state.editMov = null;
  $("#finMovForm").reset(); fillCategorias();
  $("#finData").value = toInputDT(new Date()); fillContaSelects();
};

/* --------------------------- transferência -------------------------------- */
$("#finTransfForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guard()) return;
  const de = $("#finTrDe").value, para = $("#finTrPara").value, v = num($("#finTrValor").value);
  if (!de || !para || de === para) return toast("Escolha duas contas diferentes.", true);
  if (v <= 0) return toast("Informe um valor válido.", true);
  const obs = $("#finTrObs").value.trim();
  const agora = new Date().toISOString();
  const tid = "tr" + Date.now();
  const base = { data: agora, valor: v, categoria: "Transferência", forma: "transferencia", status: "pago", transferId: tid, criadoEm: Date.now(), pessoa: "" };
  await push(ref(db, "financeiro"), { ...base, tipo: "saida", contaId: de, desc: `Transferência para ${contaNome(para)}${obs ? " — " + obs : ""}` });
  await push(ref(db, "financeiro"), { ...base, tipo: "entrada", contaId: para, desc: `Transferência de ${contaNome(de)}${obs ? " — " + obs : ""}` });
  $("#finTrValor").value = ""; $("#finTrObs").value = "";
  toast("Transferência registrada.");
});

/* --------------------------- filtros / extrato ---------------------------- */
["#finFDe", "#finFAte", "#finFConta", "#finFTipo", "#finFOrigem", "#finFBusca"].forEach((s) => {
  const reFin = () => { resetPagina("finMov"); resetPagina("finCat"); renderFinanceiro(); };
  $(s).addEventListener("input", reFin);
  $(s).addEventListener("change", reFin);
});
$("#finFLimpar").onclick = () => {
  ["#finFDe", "#finFAte", "#finFBusca"].forEach((s) => ($(s).value = ""));
  $("#finFConta").value = ""; $("#finFTipo").value = ""; $("#finFOrigem").value = "";
  resetPagina("finMov"); resetPagina("finCat");
  renderFinanceiro();
};

function finFiltrados() {
  const de = $("#finFDe").value, ate = $("#finFAte").value;
  const conta = $("#finFConta").value, tipo = $("#finFTipo").value, origem = $("#finFOrigem").value;
  const q = $("#finFBusca").value.toLowerCase();
  return movimentosTodos().filter((m) => {
    const d = dayKey(m.data);
    if (de && d < de) return false;
    if (ate && d > ate) return false;
    if (conta && m.contaId !== conta) return false;
    if (tipo && m.tipo !== tipo) return false;
    if (origem && m.origem !== origem) return false;
    if (q && !((m.desc || "") + " " + (m.pessoa || "") + " " + (m.categoria || "")).toLowerCase().includes(q)) return false;
    return true;
  });
}

/* --------------------------- render --------------------------------------- */
function renderFinanceiro() {
  const saldos = saldoContas();

  /* contas */
  const tc = $("#tblFinContas tbody"); tc.innerHTML = "";
  const contas = contasArray();
  if (!contas.length) tc.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma conta cadastrada. Cadastre um caixa para começar.</td></tr>`;
  renderPager("tblFinContas", "finContas", contas.length, renderFinanceiro, "conta(s)");
  paginar("finContas", contas).forEach((c) => {
    const s = saldos[c.id] || { inicial: 0, mov: 0, saldo: 0 };
    tc.insertAdjacentHTML("beforeend", `<tr><td>${c.nome}</td><td>${c.tipo || "caixa"}</td>
      <td>${c.padrao ? '<span class="tag pago">padrão</span>' : "-"}</td>
      <td>${money(c.saldoInicial)}</td><td class="${s.mov < 0 ? "val-neg" : "val-pos"}">${money(s.mov)}</td>
      <td><strong>${money(s.saldo)}</strong></td>
      <td><button class="btn mini" data-ce="${c.id}">Editar</button>
          <button class="btn mini danger" data-cd="${c.id}">Excluir</button></td></tr>`);
  });
  $("#tblFinContas tfoot").innerHTML = contas.length
    ? `<tr><td colspan="5">Saldo total</td><td colspan="2"><strong>${money(saldoCaixaTotal())}</strong></td></tr>` : "";
  tc.querySelectorAll("[data-ce]").forEach((b) => (b.onclick = () => {
    const c = state.contas[b.dataset.ce]; state.editConta = b.dataset.ce;
    $("#finContaNome").value = c.nome; $("#finContaTipo").value = c.tipo || "caixa";
    $("#finContaSaldo").value = c.saldoInicial || ""; $("#finContaPadrao").value = c.padrao ? "sim" : "nao";
  }));
  tc.querySelectorAll("[data-cd]").forEach((b) => (b.onclick = async () => {
    if (!guard() || !confirm("Excluir conta? Os movimentos vinculados continuarão registrados.")) return;
    await remove(ref(db, "contas/" + b.dataset.cd)); toast("Conta excluída.");
  }));

  /* KPIs */
  const mesAtual = new Date().toISOString().slice(0, 7);
  const todos = movimentosTodos();
  const doMes = todos.filter((m) => movPago(m) && String(dayKey(m.data)).slice(0, 7) === mesAtual);
  const ent = doMes.filter((m) => m.tipo === "entrada").reduce((s, m) => s + num(m.valor), 0);
  const sai = doMes.filter((m) => m.tipo === "saida").reduce((s, m) => s + num(m.valor), 0);
  const pend = todos.filter((m) => !movPago(m));
  $("#finSaldoTotal").textContent = money(saldoCaixaTotal());
  $("#finEntradasMes").textContent = money(ent);
  $("#finSaidasMes").textContent = money(sai);
  $("#finResultadoMes").textContent = money(ent - sai);
  $("#finAPagar").textContent = money(pend.filter((m) => m.tipo === "saida").reduce((s, m) => s + num(m.valor), 0));
  $("#finAReceber").textContent = money(pend.filter((m) => m.tipo === "entrada").reduce((s, m) => s + num(m.valor), 0));
  if ($("#kpiCaixa")) $("#kpiCaixa").textContent = money(saldoCaixaTotal());

  /* pendentes */
  const tp = $("#tblFinPend tbody"); tp.innerHTML = "";
  const hoje = new Date().toISOString().slice(0, 10);
  const pendOrd = pend.slice().sort((a, b) => String(a.venc || dayKey(a.data)).localeCompare(String(b.venc || dayKey(b.data))));
  if (!pendOrd.length) tp.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma pendência.</td></tr>`;
  renderPager("tblFinPend", "finPend", pendOrd.length, renderFinanceiro, "pendência(s)");
  paginar("finPend", pendOrd).forEach((m) => {
    const venc = m.venc || dayKey(m.data);
    tp.insertAdjacentHTML("beforeend", `<tr class="${venc < hoje ? "vencido" : ""}">
      <td>${venc.split("-").reverse().join("/")}${venc < hoje ? ' <span class="tag saida">vencido</span>' : ""}</td>
      <td>${m.desc || "-"}</td><td>${m.categoria || "-"}</td>
      <td><span class="tag ${m.tipo}">${m.tipo === "entrada" ? "receber" : "pagar"}</span></td>
      <td>${money(m.valor)}</td><td>${contaNome(m.contaId)}</td>
      <td><button class="btn mini" data-pg="${m.id}">Marcar como ${m.tipo === "entrada" ? "recebido" : "pago"}</button></td></tr>`);
  });
  tp.querySelectorAll("[data-pg]").forEach((b) => (b.onclick = async () => {
    if (!guard()) return;
    await update(ref(db, "financeiro/" + b.dataset.pg), { status: "pago", pagoEm: new Date().toISOString() });
    toast("Baixa registrada.");
  }));

  /* extrato */
  const rows = finFiltrados();
  const tb = $("#tblFinMov tbody"); tb.innerHTML = "";
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="9" class="empty">Nenhum movimento no filtro.</td></tr>`;
    $("#tblFinMov tfoot").innerHTML = "";
    renderPager("tblFinMov", "finMov", 0, renderFinanceiro, "movimento(s)");
  }
  else {
    const cres = rows.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
    let acc = 0; const saldoDe = {};
    cres.forEach((m) => { if (movPago(m)) acc += movSinal(m) * num(m.valor); saldoDe[m.id] = acc; });
    renderPager("tblFinMov", "finMov", rows.length, renderFinanceiro, "movimento(s)");
    paginar("finMov", rows).forEach((m) => {
      tb.insertAdjacentHTML("beforeend", `<tr>
        <td>${dtLocal(m.data)}</td>
        <td>${m.desc || "-"}${movPago(m) ? "" : ' <span class="tag pendente">pendente</span>'}</td>
        <td>${m.categoria || "-"}</td>
        <td><span class="tag ${m.origem}">${m.origem === "operacional" ? "compra/venda" : "manual"}</span></td>
        <td>${contaNome(m.contaId)}</td>
        <td class="val-pos">${m.tipo === "entrada" ? money(m.valor) : "-"}</td>
        <td class="val-neg">${m.tipo === "saida" ? money(m.valor) : "-"}</td>
        <td>${money(saldoDe[m.id] || 0)}</td>
        <td>${m.origem === "manual"
          ? `<button class="btn mini" data-me="${m.id}">Editar</button> <button class="btn mini danger" data-md="${m.id}">Excluir</button>`
          : `<button class="btn mini" data-ml="${m.lancamentoId}">Ver lançamento</button>`}</td></tr>`);
    });
    const tE = rows.filter((m) => m.tipo === "entrada").reduce((s, m) => s + num(m.valor), 0);
    const tS = rows.filter((m) => m.tipo === "saida").reduce((s, m) => s + num(m.valor), 0);
    $("#tblFinMov tfoot").innerHTML = `<tr><td colspan="5">${rows.length} movimento(s)</td>
      <td class="val-pos">${money(tE)}</td><td class="val-neg">${money(tS)}</td>
      <td colspan="2"><strong>${money(tE - tS)}</strong></td></tr>`;

    tb.querySelectorAll("[data-me]").forEach((b) => (b.onclick = () => {
      const m = state.financeiro[b.dataset.me]; state.editMov = b.dataset.me;
      $("#finData").value = toInputDT(new Date(m.data)); $("#finTipo").value = m.tipo;
      fillCategorias(); $("#finCategoria").value = m.categoria || "";
      $("#finConta").value = m.contaId || ""; $("#finValor").value = m.valor;
      $("#finForma").value = m.forma || "dinheiro"; $("#finVenc").value = m.venc || "";
      $("#finStatus").value = m.status || "pago"; $("#finPessoa").value = m.pessoa || "";
      $("#finDesc").value = m.desc || "";
      $("#finMovForm").scrollIntoView({ behavior: "smooth", block: "center" });
    }));
    tb.querySelectorAll("[data-md]").forEach((b) => (b.onclick = async () => {
      if (!guard() || !confirm("Excluir movimento financeiro?")) return;
      await remove(ref(db, "financeiro/" + b.dataset.md)); toast("Movimento excluído.");
    }));
    tb.querySelectorAll("[data-ml]").forEach((b) => (b.onclick = () => {
      $$(".nav-item").forEach((x) => x.classList.remove("active"));
      const nav = $$(".nav-item").find((x) => x.dataset.view === "lancamentos");
      if (nav) nav.classList.add("active");
      $$(".view").forEach((v) => v.classList.add("hidden"));
      $("#view-lancamentos").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  /* resumo por categoria */
  const tcat = $("#tblFinCat tbody"); tcat.innerHTML = "";
  const cat = {};
  rows.forEach((m) => {
    const c = (cat[m.categoria || "Sem categoria"] = cat[m.categoria || "Sem categoria"] || { e: 0, s: 0 });
    if (m.tipo === "entrada") c.e += num(m.valor); else c.s += num(m.valor);
  });
  const keys = Object.keys(cat).sort();
  if (!keys.length) tcat.innerHTML = `<tr><td colspan="4" class="empty">Sem dados no período.</td></tr>`;
  renderPager("tblFinCat", "finCat", keys.length, renderFinanceiro, "categoria(s)");
  paginar("finCat", keys).forEach((k) => {
    const c = cat[k];
    tcat.insertAdjacentHTML("beforeend", `<tr><td>${k}</td><td class="val-pos">${money(c.e)}</td>
      <td class="val-neg">${money(c.s)}</td><td><strong>${money(c.e - c.s)}</strong></td></tr>`);
  });
}

$("#finCsv").onclick = () => {
  const rows = [["Data", "Descricao", "Categoria", "Origem", "Conta", "Natureza", "Valor", "Situacao", "Pessoa"]];
  finFiltrados().slice().reverse().forEach((m) => rows.push([
    dtLocal(m.data), m.desc || "", m.categoria || "", m.origem, contaNome(m.contaId),
    m.tipo, num(m.valor).toFixed(2), movPago(m) ? "pago" : "pendente", m.pessoa || "",
  ]));
  baixar(csv(rows), `financeiro-${Date.now()}.csv`, "text/csv");
};

/* --------------------- relatórios financeiros em PDF ---------------------- */
(function relatoriosPDF() {
  const elTipo = $("#finRelTipo");
  if (!elTipo) return;
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  $("#finRelDia").value = hojeIso;
  $("#finRelSemana").value = hojeIso;
  $("#finRelMes").value = hojeIso.slice(0, 7);
  $("#finRelAno").value = hoje.getFullYear();

  function alternaCampos() {
    const t = elTipo.value;
    $("#finRelCampoDia").classList.toggle("hidden", t !== "dia");
    $("#finRelCampoSemana").classList.toggle("hidden", t !== "semana");
    $("#finRelCampoMes").classList.toggle("hidden", t !== "mes");
    $("#finRelCampoAno").classList.toggle("hidden", t !== "ano");
  }
  elTipo.onchange = alternaCampos;
  alternaCampos();

  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const br = (d) => String(d).split("-").reverse().join("/");

  function periodo() {
    const t = elTipo.value;
    if (t === "dia") {
      const d = $("#finRelDia").value || hojeIso;
      return { de: d, ate: d, titulo: "Relatório financeiro diário", label: br(d) };
    }
    if (t === "semana") {
      const s = semanaDe($("#finRelSemana").value || hojeIso);
      return { de: s.de, ate: s.ate, titulo: "Relatório financeiro semanal", label: `${br(s.de)} a ${br(s.ate)}` };
    }
    if (t === "ano") {
      const y = String($("#finRelAno").value || hoje.getFullYear());
      return { de: `${y}-01-01`, ate: `${y}-12-31`, titulo: "Relatório financeiro anual", label: y };
    }
    const m = $("#finRelMes").value || hojeIso.slice(0, 7);
    const [ano, mes] = m.split("-");
    const last = new Date(Number(ano), Number(mes), 0).getDate();
    return {
      de: `${ano}-${mes}-01`, ate: `${ano}-${mes}-${String(last).padStart(2, "0")}`,
      titulo: "Relatório financeiro mensal", label: `${MESES[Number(mes) - 1]} de ${ano}`,
    };
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  $("#finRelPdf").onclick = () => {
    const p = periodo();
    const contaFiltro = $("#relConta").value;
    const movs = movimentosTodos()
      .filter((m) => { const d = dayKey(m.data); return d >= p.de && d <= p.ate; })
      .filter((m) => !contaFiltro || m.contaId === contaFiltro)
      .sort((a, b) => new Date(a.data) - new Date(b.data));

    const pagos = movs.filter(movPago);
    const ent = pagos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + num(m.valor), 0);
    const sai = pagos.filter((m) => m.tipo === "saida").reduce((s, m) => s + num(m.valor), 0);
    const pendE = movs.filter((m) => !movPago(m) && m.tipo === "entrada").reduce((s, m) => s + num(m.valor), 0);
    const pendS = movs.filter((m) => !movPago(m) && m.tipo === "saida").reduce((s, m) => s + num(m.valor), 0);

    const porConta = {};
    pagos.forEach((m) => {
      const k = contaNome(m.contaId);
      const o = (porConta[k] = porConta[k] || { e: 0, s: 0 });
      if (m.tipo === "entrada") o.e += num(m.valor); else o.s += num(m.valor);
    });
    const porCat = {};
    pagos.forEach((m) => {
      const k = m.categoria || "Sem categoria";
      const o = (porCat[k] = porCat[k] || { e: 0, s: 0 });
      if (m.tipo === "entrada") o.e += num(m.valor); else o.s += num(m.valor);
    });

    const linhas = movs.map((m) => `<tr>
      <td>${esc(dtLocal(m.data))}</td><td>${esc(m.desc || "-")}${movPago(m) ? "" : " (pendente)"}</td>
      <td>${esc(m.categoria || "-")}</td><td>${esc(contaNome(m.contaId))}</td>
      <td class="r">${m.tipo === "entrada" ? money(m.valor) : "-"}</td>
      <td class="r">${m.tipo === "saida" ? money(m.valor) : "-"}</td></tr>`).join("");

    const tabela = (obj, titulo) => `<h3>${titulo}</h3><table><thead><tr>
      <th>${titulo.includes("conta") ? "Conta" : "Categoria"}</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Saldo</th>
      </tr></thead><tbody>${Object.keys(obj).sort().map((k) => `<tr><td>${esc(k)}</td>
      <td class="r">${money(obj[k].e)}</td><td class="r">${money(obj[k].s)}</td>
      <td class="r"><strong>${money(obj[k].e - obj[k].s)}</strong></td></tr>`).join("")
      || `<tr><td colspan="4">Sem dados no período.</td></tr>`}</tbody></table>`;

    const empresa = (state.ui && state.ui.brand) || "Relatório financeiro";

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(p.titulo)} — ${esc(p.label)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; font-weight: normal; color: #555; margin: 0 0 14px; }
  h3 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-size: 11px; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
  .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; min-width: 120px; }
  .kpi span { display: block; color: #666; font-size: 10px; text-transform: uppercase; }
  .kpi strong { font-size: 14px; }
  tfoot td { font-weight: bold; background: #f8f8f8; }
  .rodape { margin-top: 16px; color: #777; font-size: 10px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head><body>
<h1>${esc(empresa)}</h1>
<h2>${esc(p.titulo)} — ${esc(p.label)}${contaFiltro ? " — conta: " + esc(contaNome(contaFiltro)) : " — todas as contas"}</h2>
<div class="kpis">
  <div class="kpi"><span>Entradas</span><strong>${money(ent)}</strong></div>
  <div class="kpi"><span>Saídas</span><strong>${money(sai)}</strong></div>
  <div class="kpi"><span>Resultado</span><strong>${money(ent - sai)}</strong></div>
  <div class="kpi"><span>A receber</span><strong>${money(pendE)}</strong></div>
  <div class="kpi"><span>A pagar</span><strong>${money(pendS)}</strong></div>
  <div class="kpi"><span>Movimentos</span><strong>${movs.length}</strong></div>
</div>
${tabela(porConta, "Resumo por conta")}
${tabela(porCat, "Resumo por categoria")}
<h3>Extrato do período</h3>
<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="r">Entrada</th><th class="r">Saída</th></tr></thead>
<tbody>${linhas || `<tr><td colspan="6">Nenhum movimento no período.</td></tr>`}</tbody>
<tfoot><tr><td colspan="4">Totais (pagos)</td><td class="r">${money(ent)}</td><td class="r">${money(sai)}</td></tr></tfoot></table>
<p class="rodape">Emitido em ${esc(dtLocal(new Date().toISOString()))}</p>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) return toast("Permita pop-ups para gerar o relatório.", true);
    w.document.open(); w.document.write(html); w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };
})();


/* ========================================================================== */
/* ============ DOCUMENTOS (RECIBOS / RELATÓRIOS) E SIMULADOR =============== */
/* ========================================================================== */

function escDoc(v) {
  return String(v == null ? "" : v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
const DOC_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12px; margin:0; }
  h1 { font-size:18px; margin:0 0 2px; }
  h2 { font-size:13px; font-weight:normal; color:#555; margin:0 0 14px; }
  h3 { font-size:13px; margin:16px 0 6px; border-bottom:1px solid #ccc; padding-bottom:3px; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  th, td { border-bottom:1px solid #ddd; padding:4px 6px; text-align:left; vertical-align:top; }
  th { background:#f2f2f2; font-size:11px; }
  td.r, th.r { text-align:right; white-space:nowrap; }
  tfoot td { font-weight:bold; background:#f8f8f8; }
  .kpis { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px; }
  .kpi { border:1px solid #ddd; border-radius:6px; padding:6px 10px; min-width:120px; }
  .kpi span { display:block; color:#666; font-size:10px; text-transform:uppercase; }
  .kpi strong { font-size:14px; }
  .assinatura { margin-top:34px; display:flex; gap:24px; }
  .assinatura div { flex:1; border-top:1px solid #555; padding-top:4px; text-align:center; color:#555; }
  .rodape { margin-top:14px; color:#777; font-size:10px; }
  .aviso { margin:8px 0; padding:6px 8px; border:1px dashed #999; color:#444; font-size:11px; }
  thead { display:table-header-group; }
  tr { page-break-inside:avoid; }
`;
function abrirDoc(titulo, corpo) {
  const w = window.open("", "_blank");
  if (!w) return toast("Permita pop-ups para gerar o documento.", true);
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${escDoc(titulo)}</title><style>${DOC_CSS}</style></head><body>${corpo}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
const empresaNome = () => (state.ui && state.ui.brand) || "Sistema Gerencial";

/* ------------------------------ recibo ----------------------------------- */
function reciboHTML(op) {
  const titulo = op.tipo === "venda" ? "Recibo de venda" : "Recibo de compra";
  const totalGeral = op.itens.reduce((s, i) => s + num(i.total), 0);
  const pags = (Array.isArray(op.pagamentos) && op.pagamentos.length)
    ? op.pagamentos.map((p) => ({ contaId: p.contaId, valor: cent(p.valor) })).filter((p) => p.valor > 0)
    : [{ contaId: op.contaId, valor: cent(totalGeral) }];
  const tKg = op.itens.filter((i) => (i.unidade || "kg") !== "un").reduce((s, i) => s + num(i.peso), 0);
  const tUn = op.itens.filter((i) => (i.unidade || "kg") === "un").reduce((s, i) => s + num(i.peso), 0);
  const linhas = op.itens.map((i) => `<tr>
    <td>${escDoc(i.produtoNome || prodNome(i.produtoId))}</td>
    <td class="r">${qtd(i.peso, i.unidade || "kg")}</td>
    <td class="r">${money(i.preco)}</td>
    <td class="r">${money(i.total)}</td>
    <td>${escDoc(i.obs || "-")}</td></tr>`).join("");
  return `<h1>${escDoc(empresaNome())}</h1>
<h2>${titulo} — ${escDoc(dtLocal(op.data))}</h2>
<div class="kpis">
  <div class="kpi"><span>${op.tipo === "venda" ? "Cliente" : "Fornecedor"}</span><strong>${escDoc(op.pessoa || "Não informado")}</strong></div>
  <div class="kpi"><span>Conta / caixa</span><strong>${escDoc(pags.map((p) => contaNome(p.contaId)).join(" \u00b7 "))}</strong></div>
  <div class="kpi"><span>Itens</span><strong>${op.itens.length}</strong></div>
  <div class="kpi"><span>Quantidade</span><strong>${dual(tKg, tUn)}</strong></div>
  <div class="kpi"><span>Valor total</span><strong>${money(totalGeral)}</strong></div>
</div>
<h3>Itens</h3>
<table><thead><tr><th>Produto</th><th class="r">Qtd.</th><th class="r">Preço unit.</th><th class="r">Subtotal</th><th>Obs</th></tr></thead>
<tbody>${linhas}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="r">${money(totalGeral)}</td><td></td></tr></tfoot></table>
${pags.length > 1 ? `<h3>Formas de pagamento</h3>
<table><thead><tr><th>Conta / caixa</th><th class="r">Valor</th></tr></thead>
<tbody>${pags.map((p) => `<tr><td>${escDoc(contaNome(p.contaId))}</td><td class="r">${money(p.valor)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td>Total</td><td class="r">${money(pags.reduce((s, p) => s + num(p.valor), 0))}</td></tr></tfoot></table>` : ""}
${op.obs ? `<p><strong>Observação:</strong> ${escDoc(op.obs)}</p>` : ""}
<div class="assinatura"><div>${op.tipo === "venda" ? "Cliente" : "Fornecedor"}</div><div>${escDoc(empresaNome())}</div></div>
<p class="rodape">Emitido em ${escDoc(dtLocal(new Date().toISOString()))}</p>`;
}
if ($("#cxRecibo")) $("#cxRecibo").onclick = () => {
  let op;
  if (state.carrinho.length) {
    op = {
      data: new Date($("#cxData").value || toInputDT(new Date())).toISOString(),
      tipo: $("#cxTipo").value,
      pessoa: $("#cxPessoa").value.trim(),
      obs: $("#cxObs").value.trim(),
      contaId: ($("#cxConta") && $("#cxConta").value) || contaPadraoId(),
      pagamentos: (coletaPagamentos("cx").lista || null),
      itens: state.carrinho.slice(),
    };
  } else if (state.ultimaOperacao) {
    op = state.ultimaOperacao;
  } else {
    return toast("Adicione itens ao carrinho ou finalize uma operação para emitir o recibo.", true);
  }
  abrirDoc("Recibo", reciboHTML(op));
};

/* -------------------- relatório de compras/vendas do dia ------------------ */
if ($("#cxRelData")) $("#cxRelData").value = new Date().toISOString().slice(0, 10);
if ($("#cxRelDia")) $("#cxRelDia").onclick = () => {
  const dia = $("#cxRelData").value || new Date().toISOString().slice(0, 10);
  const tipoFiltro = $("#cxRelTipo").value;
  const movs = lancArray()
    .filter((l) => dayKey(l.data) === dia)
    .filter((l) => !tipoFiltro || l.tipo === tipoFiltro)
    .sort((a, b) => new Date(a.data) - new Date(b.data));

  const tC = movs.filter((l) => l.tipo === "compra").reduce((s, l) => s + num(l.total), 0);
  const tV = movs.filter((l) => l.tipo === "venda").reduce((s, l) => s + num(l.total), 0);
  const kgT = movs.filter((l) => unidDe(l) !== "un").reduce((s, l) => s + num(l.peso), 0);
  const unT = movs.filter((l) => unidDe(l) === "un").reduce((s, l) => s + num(l.peso), 0);

  const porProduto = {};
  movs.forEach((l) => {
    const k = l.produtoNome || prodNome(l.produtoId);
    const o = (porProduto[k] = porProduto[k] || { qC: 0, rC: 0, qV: 0, rV: 0, u: unidDe(l) });
    if (l.tipo === "compra") { o.qC += num(l.peso); o.rC += num(l.total); }
    else { o.qV += num(l.peso); o.rV += num(l.total); }
  });

  const resumo = Object.keys(porProduto).sort().map((k) => {
    const o = porProduto[k];
    return `<tr><td>${escDoc(k)}</td><td class="r">${qtd(o.qC, o.u)}</td><td class="r">${money(o.rC)}</td>
      <td class="r">${qtd(o.qV, o.u)}</td><td class="r">${money(o.rV)}</td><td class="r">${money(o.rV - o.rC)}</td></tr>`;
  }).join("") || `<tr><td colspan="6">Sem movimentações no dia.</td></tr>`;

  const linhas = movs.map((l) => `<tr>
    <td>${escDoc(dtLocal(l.data))}</td><td>${escDoc(l.tipo)}</td>
    <td>${escDoc(l.produtoNome || prodNome(l.produtoId))}</td>
    <td class="r">${qtd(l.peso, unidDe(l))}</td><td class="r">${money(l.preco)}</td><td class="r">${money(l.total)}</td>
    <td>${escDoc(l.pessoa || "-")}</td><td>${escDoc(l.obs || "-")}</td></tr>`).join("")
    || `<tr><td colspan="8">Sem movimentações no dia.</td></tr>`;

  const rotulo = tipoFiltro === "compra" ? "Relatório de compras" : tipoFiltro === "venda" ? "Relatório de vendas" : "Relatório de compras e vendas";

  abrirDoc(rotulo, `<h1>${escDoc(empresaNome())}</h1>
<h2>${rotulo} — ${escDoc(dia.split("-").reverse().join("/"))}</h2>
<div class="kpis">
  <div class="kpi"><span>Movimentações</span><strong>${movs.length}</strong></div>
  <div class="kpi"><span>Quantidade</span><strong>${dual(kgT, unT)}</strong></div>
  <div class="kpi"><span>Total compras</span><strong>${money(tC)}</strong></div>
  <div class="kpi"><span>Total vendas</span><strong>${money(tV)}</strong></div>
  <div class="kpi"><span>Resultado</span><strong>${money(tV - tC)}</strong></div>
</div>
<h3>Resumo por produto</h3>
<table><thead><tr><th>Produto</th><th class="r">Qtd. compra</th><th class="r">R$ compra</th><th class="r">Qtd. venda</th><th class="r">R$ venda</th><th class="r">Resultado</th></tr></thead>
<tbody>${resumo}</tbody></table>
<h3>Movimentações do dia</h3>
<table><thead><tr><th>Hora</th><th>Tipo</th><th>Produto</th><th class="r">Qtd.</th><th class="r">Preço unit.</th><th class="r">Total</th><th>Pessoa</th><th>Obs</th></tr></thead>
<tbody>${linhas}</tbody>
<tfoot><tr><td colspan="5">Totais</td><td class="r">${money(tC + tV)}</td><td colspan="2"></td></tr></tfoot></table>
<p class="rodape">Emitido em ${escDoc(dtLocal(new Date().toISOString()))}</p>`);
};

/* ------------------------------ abas compra/venda ------------------------- */
$$("#cxTabs .tab").forEach((btn) => (btn.onclick = () => {
  $$("#cxTabs .tab").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  $("#cxPaneReal").classList.toggle("hidden", btn.dataset.tab !== "real");
  $("#cxPaneSim").classList.toggle("hidden", btn.dataset.tab !== "sim");
}));

/* ------------------------------ simulador -------------------------------- */
state.simulacao = [];
function rotulosSim() {
  if (!$("#simProduto")) return;
  const u = prodUnid($("#simProduto").value);
  const venda = $("#simTipo").value === "venda";
  $("#simQtdLbl").textContent = u === "un" ? "Quantidade (un)" : "Peso (kg)";
  $("#simPrecoLbl").textContent = u === "un" ? "Preço por unidade (R$)" : "Preço por kg (R$)";
  $("#simRefLbl").textContent = venda
    ? (u === "un" ? "Custo estimado por unidade (R$)" : "Custo estimado por kg (R$)")
    : (u === "un" ? "Venda estimada por unidade (R$)" : "Venda estimada por kg (R$)");
  $("#simQtd").step = u === "un" ? "1" : "0.001";
}
function sugerirPrecoSim() {
  rotulosSim();
  const p = state.produtos[$("#simProduto") && $("#simProduto").value];
  if (!p) return;
  const venda = $("#simTipo").value === "venda";
  $("#simPreco").value = venda ? (p.precoVenda || "") : (p.precoCompra || "");
  $("#simRef").value = venda ? (p.precoCompra || "") : (p.precoVenda || "");
  calcSubtotalSim();
}
function calcSubtotalSim() {
  if (!$("#simSubtotal")) return;
  $("#simSubtotal").textContent = "Subtotal: " + money(num($("#simQtd").value) * num($("#simPreco").value));
}
if ($("#simProduto")) $("#simProduto").onchange = sugerirPrecoSim;
if ($("#simTipo")) $("#simTipo").onchange = sugerirPrecoSim;
if ($("#simQtd")) $("#simQtd").oninput = calcSubtotalSim;
if ($("#simPreco")) $("#simPreco").oninput = calcSubtotalSim;

function simResultadoItem(it) {
  return it.tipo === "venda"
    ? num(it.peso) * (num(it.preco) - num(it.ref))
    : num(it.peso) * (num(it.ref) - num(it.preco));
}
function renderSimulacao() {
  const tb = $("#tblSim tbody");
  if (!tb) return;
  tb.innerHTML = "";
  const itens = state.simulacao;
  if (!itens.length) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">Nenhum item na simulação.</td></tr>`;
    $("#tblSim tfoot").innerHTML = "";
  } else {
    itens.forEach((it, i) => {
      tb.insertAdjacentHTML("beforeend", `<tr><td><span class="tag ${it.tipo}">${it.tipo}</span></td>
        <td>${it.produtoNome}</td><td>${qtd(it.peso, it.unidade)}</td><td>${money(it.preco)}</td>
        <td>${money(it.total)}</td><td>${money(it.ref)}</td><td>${money(simResultadoItem(it))}</td>
        <td><button class="btn mini danger" data-simrm="${i}">Remover</button></td></tr>`);
    });
    const tKg = itens.filter((i) => i.unidade !== "un").reduce((s, i) => s + num(i.peso), 0);
    const tUn = itens.filter((i) => i.unidade === "un").reduce((s, i) => s + num(i.peso), 0);
    $("#tblSim tfoot").innerHTML = `<tr><td colspan="2">${itens.length} item(ns)</td><td>${dual(tKg, tUn)}</td>
      <td>Total</td><td>${money(itens.reduce((s, i) => s + num(i.total), 0))}</td><td>Resultado</td>
      <td colspan="2">${money(itens.reduce((s, i) => s + simResultadoItem(i), 0))}</td></tr>`;
    tb.querySelectorAll("[data-simrm]").forEach((b) => (b.onclick = () => {
      state.simulacao.splice(Number(b.dataset.simrm), 1);
      renderSimulacao();
    }));
  }
  const tC = itens.filter((i) => i.tipo === "compra").reduce((s, i) => s + num(i.total), 0);
  const tV = itens.filter((i) => i.tipo === "venda").reduce((s, i) => s + num(i.total), 0);
  const res = itens.reduce((s, i) => s + simResultadoItem(i), 0);
  const base = itens.reduce((s, i) => s + (i.tipo === "venda" ? num(i.peso) * num(i.ref) : num(i.total)), 0);
  $("#simTotC").textContent = money(tC);
  $("#simTotV").textContent = money(tV);
  $("#simResult").textContent = money(res);
  $("#simMargem").textContent = (base ? ((res / base) * 100) : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}
if ($("#simItemForm")) $("#simItemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const pid = $("#simProduto").value;
  if (!pid) return toast("Cadastre um produto primeiro.", true);
  const q = num($("#simQtd").value);
  if (q <= 0) return toast("Informe a quantidade.", true);
  const pr = num($("#simPreco").value);
  state.simulacao.push({
    tipo: $("#simTipo").value,
    produtoId: pid,
    produtoNome: prodNome(pid),
    unidade: prodUnid(pid),
    peso: q,
    preco: pr,
    ref: num($("#simRef").value),
    total: q * pr,
  });
  $("#simQtd").value = "";
  calcSubtotalSim();
  renderSimulacao();
  toast("Item adicionado à simulação (nada foi gravado).");
});
if ($("#simLimpar")) $("#simLimpar").onclick = () => {
  state.simulacao = [];
  renderSimulacao();
  toast("Simulação limpa.");
};
if ($("#simPrint")) $("#simPrint").onclick = () => {
  const itens = state.simulacao;
  if (!itens.length) return toast("Adicione itens à simulação.", true);
  const tC = itens.filter((i) => i.tipo === "compra").reduce((s, i) => s + num(i.total), 0);
  const tV = itens.filter((i) => i.tipo === "venda").reduce((s, i) => s + num(i.total), 0);
  const res = itens.reduce((s, i) => s + simResultadoItem(i), 0);
  const linhas = itens.map((i) => `<tr><td>${escDoc(i.tipo)}</td><td>${escDoc(i.produtoNome)}</td>
    <td class="r">${qtd(i.peso, i.unidade)}</td><td class="r">${money(i.preco)}</td>
    <td class="r">${money(i.total)}</td><td class="r">${money(i.ref)}</td>
    <td class="r">${money(simResultadoItem(i))}</td></tr>`).join("");
  abrirDoc("Simulação", `<h1>${escDoc(empresaNome())}</h1>
<h2>Simulação de compra / venda — ${escDoc(dtLocal(new Date().toISOString()))}</h2>
<p class="aviso">Documento apenas para simulação. Nenhum lançamento foi gravado no banco de dados.</p>
<div class="kpis">
  <div class="kpi"><span>Compras simuladas</span><strong>${money(tC)}</strong></div>
  <div class="kpi"><span>Vendas simuladas</span><strong>${money(tV)}</strong></div>
  <div class="kpi"><span>Resultado estimado</span><strong>${money(res)}</strong></div>
  <div class="kpi"><span>Itens</span><strong>${itens.length}</strong></div>
</div>
<table><thead><tr><th>Tipo</th><th>Produto</th><th class="r">Qtd.</th><th class="r">Preço unit.</th><th class="r">Subtotal</th><th class="r">Referência</th><th class="r">Resultado</th></tr></thead>
<tbody>${linhas}</tbody></table>
<p class="rodape">Emitido em ${escDoc(dtLocal(new Date().toISOString()))}</p>`);
};
renderSimulacao();

/* ==========================================================================
   MÓDULO: PERFIL DO USUÁRIO + GESTÃO DE FUNCIONÁRIOS (ADMIN)
   ========================================================================== */

const VIEWS_DISPONIVEIS = [
  { id: "dashboard", nome: "Painel" },
  { id: "lancamentos", nome: "Lançamentos" },
  { id: "estoque", nome: "Estoque" },
  { id: "produtos", nome: "Produtos" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "dados", nome: "Import/Export" },
  { id: "admin", nome: "Interface" },
  { id: "caixa", nome: "Compra/Venda" },
  { id: "financeiro", nome: "Financeiro" },
];

/* app secundário: permite ao admin criar usuários sem perder a própria sessão */
let secondaryAuth = null;
function getSecondaryAuth() {
  if (!secondaryAuth) {
    const app2 = initializeApp(firebaseConfig, "admin-cadastro");
    secondaryAuth = getAuth(app2);
  }
  return secondaryAuth;
}

/* ------------------------------ máscaras --------------------------------- */
function maskWhats(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function bindWhatsMask(sel) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener("input", () => { el.value = maskWhats(el.value); });
}
bindWhatsMask("#perfWhats");
bindWhatsMask("#usrWhats");

/* ------------------------------ imagem base64 ---------------------------- */
function fileToBase64(file, maxLado = 320) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Arquivo não é imagem."));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Falha ao ler arquivo."));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.onload = () => {
        const esc = Math.min(1, maxLado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * esc);
        c.height = Math.round(img.height * esc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function avatarPadrao(nome, email) {
  const t = ((nome || email || "?").trim()[0] || "?").toUpperCase();
  return t;
}
function pintaAvatar(elId, foto, nome, email) {
  const box = $(elId);
  if (!box) return;
  if (foto) box.innerHTML = `<img src="${foto}" alt="Foto de perfil" />`;
  else box.innerHTML = `<span>${avatarPadrao(nome, email)}</span>`;
}

/* ------------------------------ perfil ----------------------------------- */
function perfilAtual() { return state.perfil || {}; }
function nomeExibicao() {
  const p = perfilAtual();
  const n = [p.nome, p.sobrenome].filter(Boolean).join(" ").trim();
  return n || (state.user ? state.user.email : "");
}
function cargoLabel() {
  const p = perfilAtual();
  if (isAdmin()) return "Administrador";
  return p.cargo || "Funcionário";
}

function preencherPerfil() {
  if (!state.user) return;
  const p = perfilAtual();
  $("#perfNome").value = p.nome || "";
  $("#perfSobrenome").value = p.sobrenome || "";
  $("#perfWhats").value = maskWhats(p.whatsapp || "");
  $("#perfEmail").value = state.user.email || "";
  $("#perfCargo").value = cargoLabel();
  $("#perfFotoUrl").value = /^https?:/i.test(p.foto || "") ? p.foto : "";
  state.fotoTmp = p.foto || "";
  pintaAvatar("#perfAvatar", state.fotoTmp, p.nome, state.user.email);
  $("#userBadge").innerHTML =
    `<span class="badge-user"><span class="badge-ava">${p.foto ? `<img src="${p.foto}" alt="" />` : avatarPadrao(p.nome, state.user.email)}</span>` +
    `<span><b>${nomeExibicao()}</b><small>${cargoLabel()}</small></span></span>`;
  const acc = $("#perfAcessos");
  if (acc) {
    acc.innerHTML = VIEWS_DISPONIVEIS
      .filter((v) => podeVer(v.id))
      .map((v) => `<span class="tag">${v.nome}</span>`).join("") +
      (podeEscrever() ? `<span class="tag ok">Pode gravar dados</span>` : `<span class="tag">Somente leitura</span>`);
  }
}

$("#perfFotoFile") && ($("#perfFotoFile").onchange = async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    state.fotoTmp = await fileToBase64(f);
    $("#perfFotoUrl").value = "";
    pintaAvatar("#perfAvatar", state.fotoTmp, $("#perfNome").value, state.user && state.user.email);
    toast("Foto carregada. Clique em salvar.");
  } catch (err) { toast(err.message, true); }
});
$("#perfFotoUrl") && ($("#perfFotoUrl").oninput = () => {
  const u = $("#perfFotoUrl").value.trim();
  if (u) { state.fotoTmp = u; pintaAvatar("#perfAvatar", u, $("#perfNome").value, state.user && state.user.email); }
});
$("#perfFotoLimpar") && ($("#perfFotoLimpar").onclick = () => {
  state.fotoTmp = ""; $("#perfFotoUrl").value = ""; $("#perfFotoFile").value = "";
  pintaAvatar("#perfAvatar", "", $("#perfNome").value, state.user && state.user.email);
});

$("#perfilForm") && $("#perfilForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;
  const dados = {
    nome: $("#perfNome").value.trim(),
    sobrenome: $("#perfSobrenome").value.trim(),
    whatsapp: $("#perfWhats").value.trim(),
    foto: state.fotoTmp || "",
    email: state.user.email,
  };
  /* apenas o administrador pode alterar cargo/acessos */
  if (isAdmin()) dados.cargo = perfilAtual().cargo || "admin";
  try {
    await update(ref(db, "usuarios/" + state.user.uid), dados);
    await updateProfile(state.user, {
      displayName: [dados.nome, dados.sobrenome].filter(Boolean).join(" ") || null,
    }).catch(() => {});
    toast("Perfil atualizado.");
  } catch (err) { toast("Erro ao salvar perfil: " + err.message, true); }
});

$("#perfSenha") && ($("#perfSenha").onclick = async () => {
  try {
    await sendPasswordResetEmail(auth, state.user.email);
    toast("Enviamos um link de redefinição para seu e-mail.");
  } catch (err) { toast(traduzErro(err.code), true); }
});

/* ------------------------------ permissões ------------------------------- */
function podeVer(view) {
  if (isAdmin()) return true;
  const a = (perfilAtual().acessos) || {};
  return !!a[view];
}
function podeEscrever() {
  if (isAdmin()) return true;
  return !!(perfilAtual().acessos && perfilAtual().acessos.escrita);
}
function aplicarAcessos() {
  $$(".nav-item").forEach((b) => {
    const v = b.dataset.view;
    if (v === "perfil") { b.classList.remove("hidden"); return; }
    if (v === "usuarios") { b.classList.toggle("hidden", !isAdmin()); return; }
    b.classList.toggle("hidden", !podeVer(v));
  });
  const ativo = $$(".nav-item").find((b) => b.classList.contains("active"));
  if (!ativo || ativo.classList.contains("hidden")) {
    const primeiro = $$(".nav-item").find((b) => !b.classList.contains("hidden"));
    if (primeiro) primeiro.click();
  }
}

/* ------------------------------ admin: funcionários ---------------------- */
function usuariosArray() {
  return Object.entries(state.usuarios || {}).map(([uid, u]) => ({ uid, ...u }))
    .sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || ""));
}
function renderAcessosCheck(host, acessos) {
  const a = acessos || {};
  $(host).innerHTML = VIEWS_DISPONIVEIS.map((v) =>
    `<label class="chk"><input type="checkbox" value="${v.id}" ${a[v.id] ? "checked" : ""}/> ${v.nome}</label>`
  ).join("") + `<label class="chk"><input type="checkbox" value="escrita" ${a.escrita ? "checked" : ""}/> <b>Permitir gravar/editar dados</b></label>`;
}
function lerAcessos(host) {
  const o = {};
  $$(host + " input[type=checkbox]").forEach((c) => { o[c.value] = c.checked; });
  return o;
}
function renderUsuarios() {
  const tb = $("#tblUsuarios tbody");
  if (!tb) return;
  const rows = usuariosArray();
  tb.innerHTML = rows.length ? rows.map((u) => {
    const acessos = Object.entries(u.acessos || {}).filter(([, v]) => v)
      .map(([k]) => (k === "escrita" ? "gravar" : (VIEWS_DISPONIVEIS.find((x) => x.id === k) || {}).nome || k)).join(", ");
    return `<tr>
      <td><span class="badge-ava sm">${u.foto ? `<img src="${u.foto}" alt="" />` : avatarPadrao(u.nome, u.email)}</span></td>
      <td>${[u.nome, u.sobrenome].filter(Boolean).join(" ") || "-"}</td>
      <td>${u.email || "-"}</td>
      <td>${u.whatsapp || "-"}</td>
      <td>${u.cargo === "admin" ? "Administrador" : (u.cargo || "Funcionário")}</td>
      <td>${u.ativo === false ? '<span class="tag">Inativo</span>' : '<span class="tag ok">Ativo</span>'}</td>
      <td class="small">${acessos || "-"}</td>
      <td class="row gap">
        <button class="btn mini" data-euser="${u.uid}">Editar</button>
        <button class="btn mini" data-tuser="${u.uid}">${u.ativo === false ? "Ativar" : "Desativar"}</button>
        <button class="btn mini danger" data-duser="${u.uid}">Excluir</button>
      </td></tr>`;
  }).join("") : `<tr><td colspan="8" class="muted">Nenhum funcionário cadastrado.</td></tr>`;

  $$("#tblUsuarios [data-euser]").forEach((b) => (b.onclick = () => editarUsuario(b.dataset.euser)));
  $$("#tblUsuarios [data-tuser]").forEach((b) => (b.onclick = async () => {
    if (!isAdmin()) return toast("Somente o administrador.", true);
    const u = state.usuarios[b.dataset.tuser];
    if (ehUsuarioAdminMaster(u)) return toast("O administrador principal não pode ser desativado.", true);
    await update(ref(db, "usuarios/" + b.dataset.tuser), { ativo: !(u.ativo !== false) });
    toast("Situação atualizada.");
  }));
  $$("#tblUsuarios [data-duser]").forEach((b) => (b.onclick = async () => {
    if (!isAdmin()) return toast("Somente o administrador.", true);
    if (ehUsuarioAdminMaster(state.usuarios[b.dataset.duser])) return toast("O administrador principal não pode ser excluído.", true);
    if (!confirm("Remover o cadastro deste funcionário do sistema?\n(O login no Firebase Authentication deve ser removido pelo console.)")) return;
    await remove(ref(db, "usuarios/" + b.dataset.duser));
    toast("Funcionário removido.");
  }));
}

function limparFormUsuario() {
  state.editUser = null;
  state.usrFoto = "";
  $("#usuarioForm").reset();
  $("#usrEmail").disabled = false;
  $("#usrSenhaWrap").classList.remove("hidden");
  $("#usrFormTitulo").textContent = "Novo funcionário";
  renderAcessosCheck("#usrAcessos", { dashboard: true, lancamentos: true });
  pintaAvatar("#usrAvatar", "", "", "");
}
const ehUsuarioAdminMaster = (u) => !!(u && (u.email || "").toLowerCase() === ADMIN_EMAIL);
function editarUsuario(uid) {
  const u = state.usuarios[uid];
  if (!u) return;
  if (!isAdmin()) return toast("Somente o administrador pode editar funcionários.", true);
  state.editUser = uid;
  state.usrFoto = u.foto || "";
  $("#usrNome").value = u.nome || "";
  $("#usrSobrenome").value = u.sobrenome || "";
  $("#usrWhats").value = maskWhats(u.whatsapp || "");
  $("#usrEmail").value = u.email || "";
  $("#usrEmail").disabled = true;
  $("#usrCargo").value = u.cargo === "admin" ? "admin" : (u.cargo || "funcionario");
  $("#usrFotoUrl").value = /^https?:/i.test(u.foto || "") ? u.foto : "";
  $("#usrSenhaWrap").classList.add("hidden");
  $("#usrFormTitulo").textContent = "Editando: " + (u.email || "");
  renderAcessosCheck("#usrAcessos", u.acessos);
  pintaAvatar("#usrAvatar", state.usrFoto, u.nome, u.email);
  $("#view-usuarios").scrollIntoView({ behavior: "smooth" });
}
$("#usrCancel") && ($("#usrCancel").onclick = () => limparFormUsuario());

$("#usrFotoFile") && ($("#usrFotoFile").onchange = async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    state.usrFoto = await fileToBase64(f);
    $("#usrFotoUrl").value = "";
    pintaAvatar("#usrAvatar", state.usrFoto, $("#usrNome").value, $("#usrEmail").value);
  } catch (err) { toast(err.message, true); }
});
$("#usrFotoUrl") && ($("#usrFotoUrl").oninput = () => {
  const u = $("#usrFotoUrl").value.trim();
  if (u) { state.usrFoto = u; pintaAvatar("#usrAvatar", u, $("#usrNome").value, $("#usrEmail").value); }
});

$("#usuarioForm") && $("#usuarioForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isAdmin()) return toast("Somente o administrador pode cadastrar funcionários.", true);
  const dados = {
    nome: $("#usrNome").value.trim(),
    sobrenome: $("#usrSobrenome").value.trim(),
    whatsapp: $("#usrWhats").value.trim(),
    email: $("#usrEmail").value.trim().toLowerCase(),
    cargo: $("#usrCargo").value,
    foto: state.usrFoto || "",
    acessos: lerAcessos("#usrAcessos"),
    ativo: true,
  };
  /* cargo administrador => acesso total ao sistema */
  if (dados.cargo === "admin") dados.acessos = acessosTotais();
  try {
    if (state.editUser) {
      if (ehUsuarioAdminMaster(state.usuarios[state.editUser])) {
        dados.cargo = "admin"; dados.ativo = true; dados.acessos = acessosTotais();
      }
      const { email, ...resto } = dados;
      await update(ref(db, "usuarios/" + state.editUser), resto);
      toast("Funcionário atualizado.");
    } else {
      const senha = $("#usrSenha").value;
      if (senha.length < 6) return toast("A senha deve ter ao menos 6 caracteres.", true);
      loader(true, "Criando acesso do funcionário...");
      const a2 = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(a2, dados.email, senha);
      await set(ref(db, "usuarios/" + cred.user.uid), { ...dados, criadoEm: Date.now() });
      await signOut(a2);
      loader(false);
      toast("Funcionário cadastrado com sucesso.");
    }
    limparFormUsuario();
  } catch (err) {
    loader(false);
    toast(traduzErro(err.code) + (err.code ? "" : " " + err.message), true);
  }
});

limparFormUsuario();
