// Núcleo do sistema: lógica pura (sem Firebase e sem DOM).
//  - estado do indicador de integração
//  - motor de sincronização offline-first (diff por registro + resolução de conflitos)
// Fica separado para poder ser testado com uma "nuvem" falsa.

/* ================= Indicador de integração ================= */
export const STATES = Object.freeze({
  LOADING: "loading", OK: "ok", OFFLINE: "offline", ERROR: "error",
  SYNCING: "syncing", PENDING: "pending", SIGNEDOUT: "signedout"
});

/** Estado do Firebase (SDK + verificação de chave) a partir de {online, ready, failed}. */
export function deriveState({ online, ready, failed }) {
  if (!online) return STATES.OFFLINE;
  if (ready) return STATES.OK;
  if (failed) return STATES.ERROR;
  return STATES.LOADING;
}

/** Interpreta a resposta do teste de conexão com o Firebase. */
export function classifyCheck({ status, networkError = false, aborted = false } = {}) {
  if (aborted) return { ok: false, detail: "tempo esgotado ao falar com o Firebase" };
  if (networkError) return { ok: false, detail: "sem resposta do Firebase — bloqueador de anúncios ou rede bloqueando googleapis.com?" };
  if (status === 200 || status === 304) return { ok: true, detail: "" };
  if (status === 400) return { ok: false, detail: "chave de API inválida ou appId incorreto (HTTP 400)" };
  if (status === 403) return { ok: false, detail: "chave de API bloqueada — confira restrições de domínio/API no Google Cloud (HTTP 403)" };
  if (status === 404) return { ok: false, detail: "app não encontrado neste projeto (HTTP 404)" };
  return { ok: false, detail: `serviço do Firebase indisponível agora (HTTP ${status})` };
}

export function describe(state, { projectId = "", analytics = false, detail = "" } = {}) {
  switch (state) {
    case STATES.OK:
      return `Firebase: conectado e verificado · projeto ${projectId} · ` +
             (analytics ? "Analytics ativo" : "Analytics indisponível neste navegador");
    case STATES.OFFLINE:
      return "Firebase: sem internet — as alterações ficam salvas e serão enviadas ao reconectar";
    case STATES.ERROR:
      return `Firebase: ${detail || "não carregou — recarregue a página (detalhes no console)"}`;
    default:
      return "Firebase: conectando…";
  }
}

const AGO = (t, now) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
};

/** Texto do estado da sincronização na nuvem. */
export function describeSync({ phase, pending = 0, lastSync = 0, error = "", skipped = [] } = {}, now = Date.now()) {
  switch (phase) {
    case "signedout": return "Firebase conectado · nuvem desligada — toque para entrar e sincronizar";
    case "syncing":   return "Nuvem: sincronizando…";
    case "pending":   return pending ? `Nuvem: ${pending} alteração(ões) aguardando envio` : "Nuvem: aguardando conexão";
    case "offline":   return "Nuvem: sem internet — alterações serão enviadas ao reconectar";
    case "error":     return `Nuvem: falha ao sincronizar — ${error || "erro desconhecido"}`;
    case "synced":
      return "Nuvem: sincronizado" + (lastSync ? ` · ${AGO(lastSync, now)}` : "") +
             (skipped.length ? ` · ${skipped.length} item(ns) não sincronizado(s)` : "");
    default: return "Nuvem: iniciando…";
  }
}

export const phaseToState = (phase) => ({
  signedout: STATES.SIGNEDOUT, syncing: STATES.SYNCING, synced: STATES.OK,
  pending: STATES.PENDING, offline: STATES.OFFLINE, error: STATES.ERROR
}[phase] || STATES.LOADING);

/** Traduz erros do Firestore/rede para algo que a pessoa entenda. */
export function describeCloudError(e) {
  const code = String((e && (e.code || e.message)) || e || "");
  if (/permission-denied/.test(code)) return "permissão negada — publique as regras do Firestore (veja FIREBASE.md)";
  if (/unauthenticated/.test(code)) return "sessão expirada — entre novamente na nuvem";
  if (/not-found|failed-precondition/.test(code)) return "o banco Firestore ainda não foi criado no console do Firebase";
  if (/resource-exhausted|quota/.test(code)) return "limite diário gratuito do Firestore atingido — volta amanhã";
  if (/timeout/.test(code)) return "tempo esgotado — tentando de novo";
  if (/unavailable|network|offline/.test(code)) return "sem conexão com o servidor — tentando de novo";
  return code.slice(0, 140) || "erro desconhecido";
}

/* ================= Modelo de dados ================= */
// Listas de registros (cada registro tem "id") — viram um documento por registro na nuvem.
export const RECORD_COLLS = ["students", "classes", "finance", "makeups", "waitlist", "equipment", "plans", "exLib", "exSeq"];
// Preferências visuais que ficam só neste aparelho (não sobem para a nuvem).
export const LOCAL_ONLY_SETTINGS = ["darkMode", "liquidGlass", "glassV", "theme"];
// Acima disso o registro não cabe com folga no limite de 1 MiB do Firestore.
export const MAX_JSON = 700000;
const DATAURL = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Hash rápido de 53 bits (cyrb53) — só para detectar se um registro mudou. */
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const itemKey = (coll, id) => `${coll}~${encodeURIComponent(id)}`;
export function parseKey(key) {
  const i = key.indexOf("~");
  return { coll: key.slice(0, i), id: decodeURIComponent(key.slice(i + 1)) };
}

export function stripLocal(settings) {
  if (!isObj(settings)) return settings;
  const o = { ...settings };
  for (const k of LOCAL_ONLY_SETTINGS) delete o[k];
  return o;
}

/** Transforma o banco local em "itens" sincronizáveis: Map(chave -> {coll,id,json,hash}). */
export function collectItems({ db, photos = {}, exph = {} }) {
  const items = new Map(), skipped = [];
  const add = (coll, id, value) => {
    const key = itemKey(coll, id);
    let json;
    try { json = JSON.stringify(value); } catch { skipped.push({ key, coll, id, reason: "invalid" }); return; }
    if (json === undefined) return;
    if (json.length > MAX_JSON) { skipped.push({ key, coll, id, reason: "large" }); return; }
    items.set(key, { key, coll, id, json, hash: hash(json) });
  };
  for (const coll of RECORD_COLLS) {
    const arr = db[coll];
    if (!Array.isArray(arr)) continue;
    arr.forEach((rec, i) => {
      if (!isObj(rec) || rec.id == null || rec.id === "") { skipped.push({ coll, id: "#" + i, reason: "noid" }); return; }
      add(coll, String(rec.id), rec);
    });
  }
  for (const k of Object.keys(db)) {
    if (RECORD_COLLS.includes(k) || db[k] === undefined) continue;
    add("meta", k, k === "settings" ? stripLocal(db[k]) : db[k]);
  }
  for (const [id, v] of Object.entries(photos || {})) if (typeof v === "string") add("photo", id, v);
  for (const [id, v] of Object.entries(exph || {})) if (typeof v === "string") add("exph", id, v);
  return { items, skipped };
}

/** O que precisa ir para a nuvem: itens novos/alterados e itens apagados desde a última sincronização. */
export function diff(items, shadow, skipped = []) {
  const skip = new Set(skipped.map((s) => s.key).filter(Boolean));
  const upserts = [], deletes = [];
  for (const it of items.values()) if (shadow[it.key] !== it.hash) upserts.push(it);
  for (const k of Object.keys(shadow)) if (!items.has(k) && !skip.has(k)) deletes.push(k);
  return { upserts, deletes };
}

function setMeta(db, key, v) {
  const cur = db[key];
  if (key === "settings" && isObj(v)) {
    const keep = {};
    for (const k of LOCAL_ONLY_SETTINGS) if (isObj(cur) && k in cur) keep[k] = cur[k];
    const tgt = isObj(cur) ? cur : (db.settings = {});
    for (const k of Object.keys(tgt)) delete tgt[k];
    Object.assign(tgt, v, keep);
    return;
  }
  if (Array.isArray(v) && Array.isArray(cur)) { cur.splice(0, cur.length, ...v); return; }
  if (isObj(v) && isObj(cur)) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, v); return; }
  db[key] = v;
}

/** Aplica mudanças vindas da nuvem no banco local (no próprio objeto, sem trocar referências). */
export function applyOps(data, ops) {
  const flags = { db: false, photos: false, exph: false };
  const { db } = data;
  for (const op of ops) {
    if (op.coll === "photo" || op.coll === "exph") {
      const bag = op.coll === "photo" ? data.photos : data.exph;
      if (op.type === "delete") { if (op.id in bag) { delete bag[op.id]; flags[op.coll] = true; } continue; }
      let v; try { v = JSON.parse(op.json); } catch { continue; }
      if (typeof v === "string" && DATAURL.test(v)) { bag[op.id] = v; flags[op.coll] = true; }
      continue;
    }
    if (RECORD_COLLS.includes(op.coll)) {
      if (!Array.isArray(db[op.coll])) { if (op.type === "delete") continue; db[op.coll] = []; }
      const arr = db[op.coll];
      const i = arr.findIndex((r) => r && String(r.id) === op.id);
      if (op.type === "delete") { if (i >= 0) { arr.splice(i, 1); flags.db = true; } continue; }
      let v; try { v = JSON.parse(op.json); } catch { continue; }
      if (!isObj(v)) continue;
      if (i >= 0) arr[i] = v; else arr.push(v);
      flags.db = true;
      continue;
    }
    if (op.coll === "meta" && op.type !== "delete") {
      let v; try { v = JSON.parse(op.json); } catch { continue; }
      setMeta(db, op.id, v); flags.db = true;
    }
  }
  return flags;
}

export function chunkOps(ops, maxCount = 400, maxBytes = 3000000) {
  const out = []; let cur = [], bytes = 0;
  for (const o of ops) {
    const sz = (o.json ? o.json.length : 0) + 300;
    if (cur.length && (cur.length >= maxCount || bytes + sz > maxBytes)) { out.push(cur); cur = []; bytes = 0; }
    cur.push(o); bytes += sz;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ================= Motor de sincronização ================= */
/**
 * store : { snapshot()->{db,photos,exph}, apply(ops), isPristine(), backup() }
 * cloud : { write(ops[]) -> Promise, subscribe(handler, onError) -> unsubscribe }
 * storage: { load()->estado|null, save(estado) }
 *
 * Regras:
 *  - Cada registro é um documento. Só o que mudou desde a última sincronização é enviado.
 *  - Primeira sincronização deste aparelho: a nuvem vence em caso de conflito (backup local antes);
 *    registros que só existem aqui são enviados. Aparelho "zerado" apenas recebe a nuvem.
 *  - Depois disso: se o registro foi alterado aqui e na nuvem ao mesmo tempo, vale o alterado aqui
 *    (ele sobe e vira a versão de todos). Sem alteração local, a versão da nuvem é aplicada.
 *  - Nunca envia nada antes de ler a nuvem uma vez (evita sobrescrever dados mais novos).
 */
export function createEngine(o) {
  const { store, cloud, storage, isOnline = () => true, now = () => Date.now(),
          setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t),
          onStatus = () => {}, debounceMs = 1200 } = o;
  const state = storage.load() || { init: false, h: {}, last: 0 };
  if (!state.h) state.h = {};
  let ready = false, pushing = false, rerun = false, stopped = false;
  let timer = null, retryTimer = null, retryN = 0, unsub = null;
  let lastError = "", skipped = [], pending = 0;

  const persist = () => storage.save(state);
  const emit = (phase) => onStatus({ phase, pending, lastSync: state.last || 0, error: lastError, skipped });
  const clearTimers = () => { if (timer) clearTimer(timer); if (retryTimer) clearTimer(retryTimer); timer = retryTimer = null; };

  async function pushNow() {
    if (stopped) return;
    if (!ready) return;                       // espera a primeira leitura da nuvem
    if (timer) { clearTimer(timer); timer = null; }
    if (pushing) { rerun = true; return; }
    const { items, skipped: sk } = collectItems(store.snapshot());
    skipped = sk;
    const { upserts, deletes } = diff(items, state.h, sk);
    pending = upserts.length + deletes.length;
    if (!pending) { state.last = now(); persist(); emit(isOnline() ? "synced" : "offline"); return; }
    if (!isOnline()) { emit("pending"); return; }
    pushing = true; emit("syncing");
    let failed = false;
    try {
      const ops = [
        ...upserts.map((u) => ({ t: "set", key: u.key, coll: u.coll, id: u.id, json: u.json, hash: u.hash })),
        ...deletes.map((k) => ({ t: "del", key: k }))
      ];
      for (const ch of chunkOps(ops)) {
        await cloud.write(ch);
        for (const op of ch) { if (op.t === "set") state.h[op.key] = op.hash; else delete state.h[op.key]; }
        pending -= ch.length;
        persist();
      }
      lastError = ""; retryN = 0; state.last = now(); persist();
    } catch (e) {
      failed = true;
      lastError = describeCloudError(e);
      const wait = Math.min(60000, 5000 * 2 ** retryN++);
      retryTimer = setTimer(() => { retryTimer = null; pushNow(); }, wait);
    } finally { pushing = false; }
    if (failed) { emit("error"); return; }
    if (rerun) { rerun = false; return pushNow(); }
    emit("synced");
  }

  function onRemote({ upserts = [], deletes = [], isInitial = false, fromCache = false } = {}) {
    if (stopped || fromCache) return;
    const { items } = collectItems(store.snapshot());
    const first = !state.init;
    const ops = [];
    let overwrote = false, anomaly = false;
    const remoteKeys = new Set();

    for (const d of upserts) {
      if (!d || typeof d.json !== "string" || typeof d.coll !== "string" || typeof d.key !== "string") continue;
      const id = d.id != null ? String(d.id) : parseKey(d.key).id;
      remoteKeys.add(d.key);
      let canon;
      try { canon = hash(JSON.stringify(JSON.parse(d.json))); } catch { continue; }
      const L = items.has(d.key) ? items.get(d.key).hash : undefined;
      const S = state.h[d.key];
      if (L === canon) { state.h[d.key] = canon; continue; }       // já igual (inclusive o "eco" do que enviamos)
      const dirty = L !== S;                                        // alterado aqui desde a última sincronização
      if (first || !dirty) {
        ops.push({ type: "upsert", key: d.key, coll: d.coll, id, json: d.json });
        state.h[d.key] = canon;
        if (L !== undefined) overwrote = true;
      }                                                             // senão: vale o local; ele será enviado
    }

    let delKeys = [...deletes];
    if (isInitial && !first) for (const k of Object.keys(state.h)) if (!remoteKeys.has(k)) delKeys.push(k);
    const shadowCount = Object.keys(state.h).length;
    if (isInitial && !first && delKeys.length > 10 && delKeys.length > shadowCount * 0.5) {
      // nuvem parece ter sido esvaziada/trocada: não apaga nada aqui; reenvia tudo
      for (const k of delKeys) delete state.h[k];
      delKeys = []; anomaly = true;
    }
    for (const k of delKeys) {
      const L = items.has(k) ? items.get(k).hash : undefined, S = state.h[k];
      delete state.h[k];
      if (L !== undefined && L === S) { const p = parseKey(k); ops.push({ type: "delete", key: k, coll: p.coll, id: p.id }); }
    }

    if (first && isInitial && upserts.length > 0 && store.isPristine()) {
      // aparelho novo/zerado: não sobe os dados padrão, só recebe o que está na nuvem
      for (const it of items.values()) if (it.coll !== "meta" && !remoteKeys.has(it.key)) ops.push({ type: "delete", key: it.key, coll: it.coll, id: it.id });
    }

    if (ops.length) {
      if (first && overwrote) { try { store.backup(); } catch {} }
      store.apply(ops);
    }
    if (isInitial) { state.init = true; ready = true; }
    persist();
    if (anomaly) lastError = "";
    if (ready) pushNow();
  }

  return {
    start() { stopped = false; unsub = cloud.subscribe(onRemote, (e) => { lastError = describeCloudError(e); emit("error"); }); emit("syncing"); },
    stop() { stopped = true; clearTimers(); if (unsub) { try { unsub(); } catch {} unsub = null; } },
    touch() { if (stopped) return; if (timer) clearTimer(timer); timer = setTimer(pushNow, debounceMs); emit(isOnline() ? "syncing" : "pending"); },
    flush() { return pushNow(); },
    pushNow,
    isReady: () => ready,
    _state: state
  };
}
