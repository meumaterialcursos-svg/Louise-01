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

/** Texto exibido no tooltip / toast do indicador. */
export function describe(state, { projectId = "", analytics = false } = {}) {
  switch (state) {
    case STATES.OK:
      return `Firebase: conectado · projeto ${projectId} · ` +
             (analytics ? "Analytics ativo" : "Analytics indisponível neste navegador");
    case STATES.OFFLINE:
      return "Firebase: sem internet no momento";
    case STATES.ERROR:
      return "Firebase: não carregou — recarregue a página (detalhes no console)";
    default:
      return "Firebase: conectando…";
  }
}
