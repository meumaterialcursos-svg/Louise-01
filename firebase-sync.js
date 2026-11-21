// Conector Firebase (SDK modular via CDN, sem build/npm).
// 1) Inicializa App + Analytics.  2) VERIFICA a conexão de verdade: pede ao servidor do
// Firebase a configuração do app (mesma chamada que o Analytics faz). Só fica verde se o
// Firebase respondeu 200, ou seja, projeto, appId e chave de API foram aceitos.
// Expõe window.firebaseApp / window.firebaseAnalytics e dispara "firebase:ready".
const SDK = "https://www.gstatic.com/firebasejs/13.4.0";
const paint = (s, m) => window.fbSetStatus && window.fbSetStatus(s, m);

const flags = { ready: false, failed: false };
const ctx = { projectId: "", analytics: false, detail: "" };
let core, cfg, verifying = false;

function refresh() {
  if (!core) return;
  const state = core.deriveState({ online: navigator.onLine, ...flags });
  paint(state, core.describe(state, ctx));
}

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
  if (res.ok) window.dispatchEvent(new CustomEvent("firebase:ready", { detail: { app: window.firebaseApp } }));
  else console.error("[firebase] verificação falhou:", res.detail);
  refresh();
}

window.addEventListener("offline", refresh);
window.addEventListener("online", () => { if (cfg && !flags.ready) verify(); else refresh(); });

try {
  const [{ initializeApp }, analyticsMod, { firebaseConfig }, coreMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-analytics.js`),
    import("./firebase-config.js"),
    import("./sync-core.js")
  ]);
  core = coreMod; cfg = firebaseConfig; ctx.projectId = cfg.projectId;

  const app = initializeApp(cfg);
  window.firebaseApp = app;

  try {
    if (await analyticsMod.isSupported()) {
      const analytics = analyticsMod.getAnalytics(app);
      window.firebaseAnalytics = analytics;
      analyticsMod.logEvent(analytics, "app_open");
      ctx.analytics = true;
    }
  } catch (e) {
    console.warn("[firebase] Analytics indisponível:", e);
  }

  await verify();
} catch (err) {
  console.error("[firebase] falha ao inicializar:", err);
  flags.failed = true;
  if (core) { ctx.detail = "não carregou o SDK — recarregue a página (detalhes no console)"; refresh(); }
  else paint(navigator.onLine ? "error" : "offline",
             navigator.onLine ? "Firebase: não carregou o SDK (veja o console)" : "Firebase: sem internet no momento");
}
