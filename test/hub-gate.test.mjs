import { afterEach, describe, expect, it, vi } from "vitest";
import { createHubHarness } from "@dungeons-lab/hub-contract/testing";
import { createHubGate, GATE_STATES, HUB_ID, showHubGate } from "../src/hub-gate.mjs";
import { registerSettings } from "../src/settings.mjs";

afterEach(() => {
  delete globalThis.game;
});

function makeGate({ hub, isGM = true } = {}) {
  const harness = createHubHarness();
  harness.game.user = { isGM };
  if (hub !== undefined) harness.game.modules.set(HUB_ID, { active: true, api: hub === "v1" ? harness.api : hub });
  const arm = vi.fn();
  const operationalReady = vi.fn();
  const renderGate = vi.fn();
  const reloadNotice = vi.fn();
  const gate = createHubGate({
    arm,
    onOperationalReady: operationalReady,
    env: { game: harness.game, Hooks: harness.Hooks },
    renderGate,
    renderReloadNotice: reloadNotice,
  });
  return { harness, gate, arm, operationalReady, renderGate, reloadNotice };
}

describe("Hub gate lifecycle", () => {
  it("arms exactly once when HubApiV1 is already present", async () => {
    const context = makeGate({ hub: "v1" });
    expect(context.gate.start()).toBe(GATE_STATES.ARMED);
    context.gate.start();
    context.harness.fireReady();
    await context.gate.ready();
    await context.gate.ready();

    expect(context.arm).toHaveBeenCalledTimes(1);
    expect(context.operationalReady).toHaveBeenCalledTimes(1);
    expect(context.renderGate).not.toHaveBeenCalled();
  });

  it("can arm from the compatibility hook before Foundry ready", async () => {
    const context = makeGate();
    context.gate.start();
    context.harness.fireReady();
    await context.gate.ready();

    expect(context.gate.state).toBe(GATE_STATES.ARMED);
    expect(context.arm).toHaveBeenCalledTimes(1);
    expect(context.operationalReady).toHaveBeenCalledTimes(1);
  });

  it("registers settings while missing, shows the GM missing variant, and keeps players inert", async () => {
    const gm = makeGate();
    globalThis.game = gm.harness.game;
    registerSettings();
    gm.gate.start();
    await gm.gate.ready();

    expect(gm.harness.game.settings.settings.size).toBe(4);
    expect(gm.arm).not.toHaveBeenCalled();
    expect(gm.renderGate).toHaveBeenLastCalledWith(GATE_STATES.MISSING, expect.any(Object));

    const player = makeGate({ isGM: false });
    player.gate.start();
    await player.gate.ready();
    expect(player.arm).not.toHaveBeenCalled();
    expect(player.renderGate).not.toHaveBeenCalled();
  });

  it("shows the incompatible variant for apiVersion 2", async () => {
    const context = makeGate({ hub: { apiVersion: 2, registerModule() {} } });
    context.gate.start();
    await context.gate.ready();

    expect(context.gate.state).toBe(GATE_STATES.INCOMPATIBLE);
    expect(context.renderGate).toHaveBeenLastCalledWith(GATE_STATES.INCOMPATIBLE, expect.any(Object));
    expect(context.arm).not.toHaveBeenCalled();
  });

  it("requires reload when a compatible hook arrives after ready and never hot-arms", async () => {
    const context = makeGate();
    context.gate.start();
    await context.gate.ready();
    context.harness.fireReady();
    context.harness.fireReady();

    expect(context.gate.state).toBe(GATE_STATES.RELOAD_REQUIRED);
    expect(context.arm).not.toHaveBeenCalled();
    expect(context.operationalReady).not.toHaveBeenCalled();
    expect(context.renderGate).toHaveBeenLastCalledWith(GATE_STATES.RELOAD_REQUIRED, expect.any(Object));
    expect(context.reloadNotice).toHaveBeenCalledTimes(1);
  });
});

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
  }
  set innerHTML(_value) {
    throw new Error("innerHTML is forbidden in the gate");
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

function fakeDocument() {
  const body = new FakeElement("body");
  const find = (node, id) => (node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean));
  return {
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => find(body, id),
  };
}

function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

describe("Hub gate overlay", () => {
  it("uses text-only DOM, exposes its variant, and has no dismiss action", () => {
    globalThis.game = { i18n: { localize: (key) => key } };
    const document = fakeDocument();
    const overlay = showHubGate(GATE_STATES.MISSING, { document, foundry: {}, window: {} });

    expect(overlay.dataset.state).toBe(GATE_STATES.MISSING);
    expect(flatten(overlay).some((element) => element.dataset.action === "close")).toBe(false);
    expect(flatten(overlay).some((element) => element.textContent === "PURE_EVIL.HubGate.Missing.Body")).toBe(true);

    expect(showHubGate(GATE_STATES.INCOMPATIBLE, { document })).toBe(overlay);
    expect(overlay.dataset.state).toBe(GATE_STATES.INCOMPATIBLE);
  });
});
