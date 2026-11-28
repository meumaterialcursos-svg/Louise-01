// Conector Firebase + sincronização automática (SDK modular via CDN, sem build/npm).
//  1) Inicializa App + Analytics e VERIFICA a conexão com o servidor do Firebase.
//  2) Login (e-mail/senha) com Firebase Authentication.
//  3) Sincronização em tempo real com o Firestore: users/{uid}/items/{registro}.
// A lógica de sincronização (diff, conflitos) fica em sync-core.js e é independente do Firebase.
const SDK = "https://www.gstatic.com/firebasejs/13.4.0";
const $id = (i) => document.getElementById(i);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paint = (s, m) => window.fbSetStatus && window.fbSetStatus(s, m);

const flags = { ready: false, failed: false };
const ctx = { projectId: "", analytics: false, detail: "" };
let core, cfg, app, A, F, auth, fdb, user = null, engine = null, verifying = false;
let syncInfo = { phase: "signedout", pending: 0, lastSync: 0, error: "", skipped: [] };

const deviceId = (() => {
  try { let d = localStorage.getItem("sp_sync_device_v1"); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("sp_sync_device_v1", d); } return d; }
  catch { return "dev"; }
})();

/* ---------- estado geral do indicador ---------- */
function overall() {
  if (!core) return { state: "loading", msg: "Firebase: conectando…" };
  const base = core.deriveState({ online: navigator.onLine, ...flags });
  if (base !== core.STATES.OK) return { state: base, msg: core.describe(base, ctx) };
  if (!user) return { state: core.STATES.SIGNEDOUT, msg: core.describeSync({ phase: "signedout" }) };
  const phase = !navigator.onLine ? "offline" : syncInfo.phase;
  return { state: core.phaseToState(phase), msg: core.describeSync({ ...syncInfo, phase }, Date.now()) };
}
function refresh() {
  const o = overall();
  paint(o.state, o.msg);
  window.dispatchEvent(new CustomEvent("sp:syncstatus", { detail: { ...o, email: user && user.email, info: syncInfo } }));
}
setInterval(() => { if (engine) refresh(); }, 60000); // atualiza o "há X min"

/* ---------- Firebase Authentication ---------- */
const AUTH_MSG = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
  "auth/email-already-in-use": "Este e-mail já tem conta — use “Entrar”.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-email": "Digite o e-mail.",
  "auth/missing-password": "Digite a senha.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
  "auth/network-request-failed": "Sem conexão com a internet.",
  "auth/operation-not-allowed": "Ative “E-mail/senha” em Authentication › Método de login, no console do Firebase.",
  "auth/admin-restricted-operation": "A criação de contas está desativada. Use “Entrar” com a conta que já existe.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Chave de API inválida."
};
const authMsg = (e) => AUTH_MSG[e && e.code] || ((e && (e.code || e.message)) || "Erro ao entrar").toString().slice(0, 160);
const need = () => { if (!auth) throw { code: "auth/network-request-failed" }; };
const signIn = async (email, pw) => { need(); await A.signInWithEmailAndPassword(auth, String(email).trim(), pw); };
const signUp = async (email, pw) => { need(); await A.createUserWithEmailAndPassword(auth, String(email).trim(), pw); };
const resetPassword = async (email) => { need(); await A.sendPasswordResetEmail(auth, String(email).trim()); };
const signOut = async () => { need(); await A.signOut(auth); };

/* ---------- Firestore (nuvem) ---------- */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj({ code: "timeout" }), ms))]);

function makeCloud(uid) {
  const col = F.collection(fdb, "users", uid, "items");
  return {
    async write(ops) {
      const batch = F.writeBatch(fdb);
      for (const o of ops) {
        const ref = F.doc(col, o.key);
        if (o.t === "set") batch.set(ref, { c: o.coll, id: o.id, j: o.json, h: o.hash, u: Date.now(), d: deviceId });
        else batch.delete(ref);
      }
      await withTimeout(batch.commit(), 25000);
    },
    subscribe(handler, onError) {
      let got = false;
      const toDoc = (d) => { const x = d.data(); return { key: d.id, coll: x.c, id: x.id, json: x.j, hash: x.h }; };
      return F.onSnapshot(col, (snap) => {
        if (!got) {
          if (snap.metadata.fromCache) { handler({ fromCache: true }); return; } // cache local ainda não é a verdade
          got = true;
          handler({ isInitial: true, upserts: snap.docs.map(toDoc), deletes: [] });
          return;
        }
        const upserts = [], deletes = [];
        snap.docChanges().forEach((ch) => { if (ch.type === "removed") deletes.push(ch.doc.id); else upserts.push(toDoc(ch.doc)); });
        if (upserts.length || deletes.length) handler({ isInitial: false, upserts, deletes });
      }, onError);
    }
  };
}

const bridge = () => window.SPBridge;
const store = {
  snapshot: () => bridge().get(),
  isPristine: () => bridge().pristine(),
  backup: () => bridge().backup(),
  apply(ops) { const f = core.applyOps(bridge().get(), ops); bridge().persist(f); }
};

function startEngine() {
  if (engine || !user || !flags.ready || !bridge()) return;
  const uid = user.uid, key = "sp_sync_state_v1:" + uid;
  engine = core.createEngine({
    store, cloud: makeCloud(uid),
    storage: {
      load() { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
      save(s) { try { localStorage.setItem(key, JSON.stringify(s)); } catch {} }
    },
    isOnline: () => navigator.onLine,
    onStatus: (s) => { syncInfo = s; refresh(); }
  });
  engine.start();
}
function stopEngine() {
  if (engine) { engine.stop(); engine = null; }
  syncInfo = { phase: "signedout", pending: 0, lastSync: 0, error: "", skipped: [] };
}

/* ---------- verificação real da conexão ---------- */
async function verify() {
  if (verifying) return;
  verifying = true;
  flags.failed = false; refresh();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  let res;
  try {
    const r = await fetch(`https://firebase.googleapis.com/v1alpha/projects/-/apps/${cfg.appId}/webConfig`,
      { headers: { "x-goog-api-key": cfg.apiKey }, signal: ctrl.signal });
    res = core.classifyCheck({ status: r.status });
  } catch (e) {
    res = core.classifyCheck({ networkError: true, aborted: e && e.name === "AbortError" });
  } finally { clearTimeout(timer); verifying = false; }
  flags.ready = res.ok; flags.failed = !res.ok; ctx.detail = res.detail;
  if (res.ok) window.dispatchEvent(new CustomEvent("firebase:ready", { detail: { app } }));
  else console.error("[firebase] verificação falhou:", res.detail);
  refresh();
  if (res.ok) startEngine();
}

/* ---------- janela "Sincronização na nuvem" ---------- */
function panelHtml() {
  const o = overall();
  const head = `<h2>Sincronização na nuvem</h2><div id="spsMsg" data-state="${o.state}" role="status"><span class="spsd" aria-hidden="true"></span><span id="spsTxt">${esc(o.msg)}</span></div>`;
  if (!user) {
    return `<div id="spsRoot" data-in="0">${head}
      <div class="sub" style="margin-bottom:10px">Entre com um e-mail e uma senha para guardar os dados na nuvem e usar o mesmo sistema em vários aparelhos. Depois de entrar, tudo sincroniza sozinho a cada alteração. Esta senha é só da nuvem — não é a senha de acesso ao sistema.</div>
      <div class="form"><div class="field"><label for="spsEmail">E-mail</label><input id="spsEmail" type="email" autocomplete="username" inputmode="email" autocapitalize="off"></div>
      <div class="field"><label for="spsPass">Senha da nuvem (mín. 6)</label><input id="spsPass" type="password" autocomplete="current-password"></div></div>
      <div class="err" id="spsErr" role="alert"></div>
      <div class="foot"><button type="button" class="btn" id="spsReset">Esqueci a senha</button><button type="button" class="btn" id="spsUp">Criar conta</button><button type="button" class="btn primary" id="spsIn">Entrar</button></div></div>`;
  }
  const n = engine ? Object.keys(engine._state.h).length : 0;
  const sk = syncInfo.skipped || [];
  const noid = sk.filter((s) => s.reason === "noid").length, big = sk.filter((s) => s.reason !== "noid").length;
  const warn = (noid || big) ? `<div class="err" style="margin:8px 0">${noid ? noid + " registro(s) sem identificação não foram sincronizados. " : ""}${big ? big + " item(ns) grande(s) demais (fotos/anexos) ficaram só neste aparelho." : ""}</div>` : "";
  return `<div id="spsRoot" data-in="1">${head}
    <div class="sub">Conectado como <b>${esc(user.email || "")}</b></div>
    <div class="sub" style="margin:4px 0 10px">${n} item(ns) na nuvem · alterações são enviadas automaticamente e chegam aos outros aparelhos em segundos.</div>${warn}
    <div class="sub" style="margin-bottom:10px">Sincroniza: alunos, aulas, financeiro, reposições, fila de espera, aparelhos, planos, horários, professores, exercícios, configurações e fotos. Fica só em cada aparelho: senha de acesso, aparência (tema/modo escuro) e documentos anexados.</div>
    <div class="err" id="spsErr" role="alert"></div>
    <div class="foot"><button type="button" class="btn" id="spsOut">Sair da nuvem</button><button type="button" class="btn primary" id="spsNow">Sincronizar agora</button></div></div>`;
}

function openPanel() {
  if (typeof openModal !== "function") return;
  openModal(panelHtml());
  const err = (m) => { const e = $id("spsErr"); if (e) e.textContent = m || ""; };
  const busy = (b, on) => { document.querySelectorAll("#spsRoot .foot .btn").forEach((x) => (x.disabled = on)); if (b) b.dataset.t = on ? "1" : ""; };
  const run = (btn, fn) => btn && btn.addEventListener("click", async () => {
    err(""); busy(btn, true);
    try { await fn(); } catch (e) { err(authMsg(e)); } finally { busy(btn, false); }
  });
  const cred = () => {
    const em = ($id("spsEmail").value || "").trim(), pw = $id("spsPass").value || "";
    if (!em) throw { code: "auth/missing-email" };
    return [em, pw];
  };
  run($id("spsIn"), () => signIn(...cred()));
  run($id("spsUp"), () => signUp(...cred()));
  run($id("spsReset"), async () => {
    const em = ($id("spsEmail").value || "").trim(); if (!em) throw { code: "auth/missing-email" };
    await resetPassword(em); err("Enviamos um e-mail para redefinir a senha (veja também o spam).");
  });
  run($id("spsNow"), async () => { if (!engine) throw { code: "Ainda conectando ao Firebase…" }; await engine.flush(); });
  const out = $id("spsOut");
  if (out) out.addEventListener("click", async () => {
    if (!confirm("Sair da nuvem neste aparelho? Os dados continuam salvos aqui, mas deixam de sincronizar.")) return;
    try { await signOut(); } catch (e) { err(authMsg(e)); }
  });
}
// atualiza a janela quando o estado muda (sem apagar o que a pessoa está digitando)
window.addEventListener("sp:syncstatus", (ev) => {
  const root = $id("spsRoot"); if (!root) return;
  const inNow = user ? "1" : "0";
  if (root.dataset.in !== inNow) { openPanel(); return; }
  const m = $id("spsMsg"), t = $id("spsTxt");
  if (m) m.dataset.state = ev.detail.state;
  if (t) t.textContent = ev.detail.msg;
});

/* ---------- API pública usada pelo index.html ---------- */
window.SPSync = {
  touch: () => { if (engine) engine.touch(); },
  flush: () => (engine ? engine.flush() : Promise.resolve()),
  openPanel, signIn, signUp, signOut, resetPassword,
  status: () => ({ ...overall(), user: user && user.email, info: syncInfo })
};
window.addEventListener("offline", refresh);
window.addEventListener("online", () => { if (cfg && !flags.ready) verify(); else { refresh(); if (engine) engine.flush(); } });
document.addEventListener("visibilitychange", () => { if (engine) engine.flush(); });
window.addEventListener("pagehide", () => { if (engine) engine.flush(); });

/* ---------- inicialização ---------- */
try {
  const [{ initializeApp }, analyticsMod, authMod, fsMod, { firebaseConfig }, coreMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-analytics.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
    import("./firebase-config.js"),
    import("./sync-core.js")
  ]);
  core = coreMod; cfg = firebaseConfig; ctx.projectId = cfg.projectId; A = authMod; F = fsMod;

  app = initializeApp(cfg);
  window.firebaseApp = app;

  try {
    if (await analyticsMod.isSupported()) {
      const analytics = analyticsMod.getAnalytics(app);
      window.firebaseAnalytics = analytics;
      analyticsMod.logEvent(analytics, "app_open");
      ctx.analytics = true;
    }
  } catch (e) { console.warn("[firebase] Analytics indisponível:", e); }

  try {
    fdb = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { console.warn("[firebase] cache offline indisponível, usando memória:", e); fdb = F.getFirestore(app); }

  auth = A.getAuth(app);
  A.onAuthStateChanged(auth, (u) => {
    if (engine) stopEngine();
    user = u || null;
    if (user) startEngine();
    refresh();
  });

  await verify();
} catch (err) {
  console.error("[firebase] falha ao inicializar:", err);
  flags.failed = true;
  if (core) { ctx.detail = "não carregou o SDK — recarregue a página (detalhes no console)"; refresh(); }
  else paint(navigator.onLine ? "error" : "offline",
             navigator.onLine ? "Firebase: não carregou o SDK (veja o console)" : "Firebase: sem internet no momento");
}
