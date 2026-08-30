import { HUB_READY_HOOK, isHubApiV1 } from "@dungeons-lab/hub-contract";
import { L } from "./i18n.mjs";

export const HUB_ID = "dungeons-lab-hub";

const HUB_URL = "https://www.patreon.com/c/Dungeons_LAB";

export const GATE_STATES = Object.freeze({
  WAITING: "waiting",
  MISSING: "missing",
  INCOMPATIBLE: "incompatible",
  ARMED: "armed",
  RELOAD_REQUIRED: "reload-required",
});

const COPY = {
  [GATE_STATES.MISSING]: {
    title: "HubGate.Missing.Title",
    body: "HubGate.Missing.Body",
    note: "HubGate.Missing.Note",
  },
  [GATE_STATES.INCOMPATIBLE]: {
    title: "HubGate.Incompatible.Title",
    body: "HubGate.Incompatible.Body",
    note: "HubGate.Incompatible.Note",
  },
  [GATE_STATES.RELOAD_REQUIRED]: {
    title: "HubGate.Reload.Title",
    body: "HubGate.Reload.Body",
    note: "HubGate.Reload.Note",
  },
};

function blockedState(moduleRecord, api) {
  return api != null || moduleRecord?.active === true ? GATE_STATES.INCOMPATIBLE : GATE_STATES.MISSING;
}

/**
 * Lifecycle state machine for the hard Hub requirement. A compatible API may arm the module up
 * to (but never after) this client's Foundry ready hook.
 */
export function createHubGate({
  arm,
  onOperationalReady = () => {},
  env = {},
  renderGate = showHubGate,
  renderReloadNotice = showReloadRequired,
} = {}) {
  if (typeof arm !== "function") throw new TypeError("createHubGate requires an arm callback");

  const game = env.game ?? globalThis.game;
  const Hooks = env.Hooks ?? globalThis.Hooks;
  let state = GATE_STATES.WAITING;
  let started = false;
  let foundryReady = false;
  let readyBehaviorStarted = false;
  let reloadNoticeShown = false;
  let subscription;

  const isGmClient = () => game?.user?.isGM === true;

  const paintBlockedState = () => {
    if (isGmClient()) renderGate(state, env);
  };

  const acceptApi = (api, moduleRecord) => {
    if (state === GATE_STATES.ARMED || state === GATE_STATES.RELOAD_REQUIRED) return;

    if (!isHubApiV1(api)) {
      state = blockedState(moduleRecord, api);
      if (foundryReady) paintBlockedState();
      return;
    }

    if (foundryReady) {
      state = GATE_STATES.RELOAD_REQUIRED;
      if (isGmClient()) {
        paintBlockedState();
        if (!reloadNoticeShown) {
          reloadNoticeShown = true;
          renderReloadNotice(env);
        }
      }
      return;
    }

    state = GATE_STATES.ARMED;
    arm(api);
  };

  const listener = (api) => acceptApi(api, game?.modules?.get?.(HUB_ID));

  return {
    get state() {
      return state;
    },

    start() {
      if (started) return state;
      started = true;
      subscription = typeof Hooks?.on === "function" ? Hooks.on(HUB_READY_HOOK, listener) : undefined;
      const moduleRecord = game?.modules?.get?.(HUB_ID);
      acceptApi(moduleRecord?.api, moduleRecord);
      return state;
    },

    async ready() {
      foundryReady = true;
      if (state !== GATE_STATES.ARMED) {
        paintBlockedState();
        return;
      }
      if (readyBehaviorStarted) return;
      readyBehaviorStarted = true;
      await onOperationalReady();
    },

    dispose() {
      if (typeof subscription === "function") subscription();
      else if (started && typeof Hooks?.off === "function") Hooks.off(HUB_READY_HOOK, listener);
      subscription = undefined;
    },
  };
}

function appendTextElement(document, parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** Full-window, non-dismissible notice for GM clients. All localized copy uses textContent. */
export function showHubGate(reason, env = {}) {
  const document = env.document ?? globalThis.document;
  if (!document?.body || !COPY[reason]) return;

  let overlay = document.getElementById("pe-hub-gate");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pe-hub-gate";
    document.body.appendChild(overlay);
  }
  overlay.dataset.state = reason;

  const card = document.createElement("div");
  card.className = "pe-hub-gate__card";
  card.setAttribute("role", "alertdialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "pe-hub-gate-title");

  const copy = COPY[reason];
  const title = appendTextElement(document, card, "h2", L(copy.title));
  title.id = "pe-hub-gate-title";
  appendTextElement(document, card, "p", L(copy.body));
  appendTextElement(document, card, "p", L(copy.note), "pe-hub-gate__note");

  if (reason !== GATE_STATES.RELOAD_REQUIRED) {
    const actions = document.createElement("div");
    actions.className = "pe-hub-gate__actions";

    const manage = appendTextElement(document, actions, "button", L("HubGate.Manage"));
    manage.type = "button";
    manage.dataset.action = "modules";
    manage.addEventListener("click", () => {
      const foundry = env.foundry ?? globalThis.foundry;
      new foundry.applications.sidebar.apps.ModuleManagement().render(true);
    });

    const get = appendTextElement(document, actions, "button", L("HubGate.Get"), "pe-hub-gate__ghost");
    get.type = "button";
    get.dataset.action = "get";
    get.addEventListener("click", () => (env.window ?? globalThis.window)?.open(HUB_URL, "_blank", "noopener"));
    card.appendChild(actions);
  }

  overlay.replaceChildren(card);
  return overlay;
}

export function showReloadRequired(env = {}) {
  const ui = env.ui ?? globalThis.ui;
  ui?.notifications?.warn?.(L("HubGate.Reload.Notice"), { permanent: true });
}
