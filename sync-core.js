// Lógica pura (sem Firebase, sem DOM) que decide o estado do indicador de integração.
// Fica separada para ser simples de testar e de reaproveitar quando houver sincronização de dados.

export const STATES = Object.freeze({
  LOADING: "loading",
  OK: "ok",
  OFFLINE: "offline",
  ERROR: "error"
});

/** Estado do indicador a partir de {online, ready, failed}. */
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

/** Texto exibido no tooltip / toast / tela de login. */
export function describe(state, { projectId = "", analytics = false, detail = "" } = {}) {
  switch (state) {
    case STATES.OK:
      return `Firebase: conectado e verificado · projeto ${projectId} · ` +
             (analytics ? "Analytics ativo" : "Analytics indisponível neste navegador");
    case STATES.OFFLINE:
      return "Firebase: sem internet no momento";
    case STATES.ERROR:
      return `Firebase: ${detail || "não carregou — recarregue a página (detalhes no console)"}`;
    default:
      return "Firebase: conectando…";
  }
}
