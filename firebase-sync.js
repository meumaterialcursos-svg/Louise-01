// Conector Firebase (SDK modular via CDN, sem build/npm).
// Inicializa o app + Analytics e atualiza o ícone de status do topo (#fbStatus).
// Depois de iniciado, expõe window.firebaseApp / window.firebaseAnalytics
// e dispara o evento "firebase:ready" para uso futuro (Firestore, Auth...).
const SDK = "https://www.gstatic.com/firebasejs/13.4.0";
const paint = (s, m) => window.fbSetStatus && window.fbSetStatus(s, m);

const flags = { ready: false, failed: false };
let core, ctx = { projectId: "", analytics: false };

function refresh() {
  if (!core) return;
  const state = core.deriveState({ online: navigator.onLine, ...flags });
  paint(state, core.describe(state, ctx));
}
window.addEventListener("online", refresh);
window.addEventListener("offline", refresh);

try {
  const [{ initializeApp }, analyticsMod, { firebaseConfig }, coreMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-analytics.js`),
    import("./firebase-config.js"),
    import("./sync-core.js")
  ]);
  core = coreMod;
  ctx.projectId = firebaseConfig.projectId;

  const app = initializeApp(firebaseConfig);
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

  flags.ready = true;
  window.dispatchEvent(new CustomEvent("firebase:ready", { detail: { app } }));
  refresh();
} catch (err) {
  console.error("[firebase] falha ao inicializar:", err);
  flags.failed = true;
  if (core) refresh();
  else paint(navigator.onLine ? "error" : "offline",
             navigator.onLine ? "Firebase: falha ao carregar (veja o console)" : "Firebase: sem internet no momento");
}
