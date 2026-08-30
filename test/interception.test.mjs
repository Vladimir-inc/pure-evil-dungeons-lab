// Integration test against a deterministic Foundry-compatible dice double by default.
//
// Everything else in this suite tests our own pure logic, which cannot answer the only question
// that actually matters: does the method we patch produce the number Foundry uses?
// Set PURE_EVIL_FOUNDRY_APP to an installed Foundry app root to load its real dice classes instead.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { dieKey } from "../src/core/dice-info.mjs";

const FOUNDRY_APP = process.env.PURE_EVIL_FOUNDRY_APP;
const dice = FOUNDRY_APP
  ? {
      Roll: (await import(/* @vite-ignore */ `${FOUNDRY_APP}/client/dice/roll.mjs`)).default,
      DiceTerm: (await import(/* @vite-ignore */ `${FOUNDRY_APP}/client/dice/terms/dice.mjs`)).default,
      Die: (await import(/* @vite-ignore */ `${FOUNDRY_APP}/client/dice/terms/die.mjs`)).default,
      Coin: (await import(/* @vite-ignore */ `${FOUNDRY_APP}/client/dice/terms/coin.mjs`)).default,
      FateDie: (await import(/* @vite-ignore */ `${FOUNDRY_APP}/client/dice/terms/fate.mjs`)).default,
    }
  : await import("./foundry-dice.mjs");
const { Roll, DiceTerm, Die, Coin, FateDie } = dice;

describe(`interception against ${FOUNDRY_APP ? "real Foundry" : "the Foundry dice double"}`, () => {
  // the real mersenne handler, copied from CONFIG.Dice.fulfillment in client/config.mjs
  const MERSENNE = { label: "Mersenne", interactive: false, handler: (term) => term.mapRandomFace(Math.random()) };

  let table;
  let diceConfiguration;
  let uniform;

  function installGlobals({ isGM = true, assistant = false, assistantsAllowed = false, character = null } = {}) {
    table = {};
    diceConfiguration = {};
    uniform = Math.random;
    globalThis.Roll = Roll;
    globalThis.CONFIG = {
      Dice: {
        randomUniform: () => uniform(),
        terms: { d: Die, c: Coin, f: FateDie },
        fulfillment: { methods: { mersenne: MERSENNE }, defaultMethod: "", dice: {} },
      },
    };
    globalThis.foundry = {
      dice: { terms: { DiceTerm, Die, Coin, FateDie } },
      utils: { deepClone: (o) => JSON.parse(JSON.stringify(o)), randomID: () => "id" },
    };
    globalThis.canvas = null;
    // Foundry installs this in common/primitives; the keep/drop modifiers rely on it
    Math.clamp ??= (n, min, max) => Math.min(max, Math.max(n, min));
    globalThis.game = {
      user: {
        isGM: isGM || assistant,
        isActiveGM: false,
        character,
        hasPermission: () => false,
        hasRole: (role) => (role === "GAMEMASTER" ? isGM : isGM || assistant),
      },
      socket: { emit() {}, on() {} },
      settings: {
        get(namespace, key) {
          if (namespace === "core") return diceConfiguration;
          if (key === "enabled") return true;
          if (key === "characters") return table;
          if (key === "assistantsAllowed") return assistantsAllowed;
          return {};
        },
        set: async () => {},
      },
    };
  }

  const original = {
    _roll: DiceTerm.prototype._roll,
    randomFace: DiceTerm.prototype.randomFace,
  };

  /** Fresh module instances every time, so the interceptor's caches never leak between tests. */
  async function loadModule() {
    vi.resetModules();
    const store = await import("../src/dice/store.mjs");
    const interceptor = await import("../src/dice/interceptor.mjs");
    interceptor.installInterceptor();
    return { store, interceptor };
  }

  async function rollTerm(TermClass, termData = {}) {
    const term = new TermClass({ number: 1, ...termData });
    await term.evaluate();
    return term;
  }

  // hand the shared prototype back unpatched before every test
  beforeEach(() => {
    DiceTerm.prototype._roll = original._roll;
    DiceTerm.prototype.randomFace = original.randomFace;
  });

  it("the methods the module patches exist on the real base class", () => {
    expect(typeof original._roll).toBe("function");
    expect(typeof original.randomFace).toBe("function");
    // both must live on DiceTerm itself; a subclass owning its own copy would escape the patch
    expect(Object.hasOwn(Die.prototype, "_roll")).toBe(false);
    expect(Object.hasOwn(Die.prototype, "randomFace")).toBe(false);
    expect(Object.hasOwn(Coin.prototype, "_roll")).toBe(false);
    expect(Object.hasOwn(Coin.prototype, "randomFace")).toBe(false);
    expect(Object.hasOwn(FateDie.prototype, "_roll")).toBe(false);
    expect(Object.hasOwn(FateDie.prototype, "randomFace")).toBe(false);
  });

  // the bug that made every ordinary die silently un-controllable while Coin and Fate worked
  it("keys a die by its static denomination, never the instance getter", () => {
    installGlobals(); // the DiceTerm constructor reads CONFIG.Dice.fulfillment
    const die = new Die({ number: 1, faces: 20 });
    expect(die.denomination).toBe("d20"); // Die overrides the getter: it already has the faces
    expect(Die.DENOMINATION).toBe("d");
    expect(dieKey(Die.DENOMINATION, die.faces)).toBe("d20");
    expect(dieKey(die.denomination, die.faces)).toBe("d2020"); // what the bug produced
    // Coin and Fate do not override it, which is exactly how the bug stayed hidden
    expect(new Coin({}).denomination).toBe("c");
    expect(new FateDie({}).denomination).toBe("f");
  });

  it("forces a d20 for the GM, on the stock fulfillment config", async () => {
    installGlobals();
    await loadModule();
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 20, remaining: 5 }] };

    const term = await rollTerm(Die, { faces: 20 });
    expect(term.total).toBe(20);
  });

  it("forces a d20 when a mersenne fulfillment handler is configured", async () => {
    installGlobals();
    await loadModule();
    diceConfiguration = { default: "mersenne" };
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 7, remaining: 5 }] };

    const term = await rollTerm(Die, { faces: 20 });
    expect(term.total).toBe(7);
  });

  it("leaves the die alone when the subject is switched off", async () => {
    installGlobals();
    await loadModule();
    table.__gm__ = { enabled: false, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 20, remaining: 5 }] };
    uniform = () => 0.999; // maps to face 1

    const term = await rollTerm(Die, { faces: 20 });
    expect(term.total).toBe(1);
  });

  it("applies weights, including a face weighted to zero", async () => {
    installGlobals();
    await loadModule();
    table.__gm__ = { enabled: true, weights: { d20: { 20: 0 } }, forces: [] };

    const totals = new Set();
    for (let i = 0; i < 200; i++) totals.add((await rollTerm(Die, { faces: 20 })).total);
    expect(totals.has(20)).toBe(false);
    expect(totals.size).toBeGreaterThan(5);
  });

  it("forces both dice of an advantage roll so the kept one is the GM's number", async () => {
    installGlobals();
    await loadModule();
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 3, remaining: 5 }] };

    const term = await rollTerm(Die, { number: 2, faces: 20, modifiers: ["kh"] });
    expect(term.results.map((r) => r.result)).toEqual([3, 3]);
    expect(term.total).toBe(3);
  });

  it("forces exotic dice through their own face mapping", async () => {
    installGlobals();
    await loadModule();
    table.__gm__ = {
      enabled: true,
      weights: {},
      forces: [
        { id: "f1", dieKey: "f3", value: -1, remaining: 3 },
        { id: "f2", dieKey: "c2", value: 0, remaining: 3 },
      ],
    };

    expect((await rollTerm(FateDie)).total).toBe(-1);
    expect((await rollTerm(Coin)).total).toBe(0);
  });

  it("spends exactly one charge per rolled die", async () => {
    installGlobals();
    const { store } = await loadModule();
    const spent = [];
    game.socket.emit = (channel, payload) => spent.push(payload);
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 20, remaining: 2 }] };

    await rollTerm(Die, { faces: 20 });
    expect(spent.filter((p) => p.action === "consume")).toHaveLength(1);
    expect(store.pending.get("f1")).toBe(1);
  });

  it("does not touch a player's die when only the GM subject is configured", async () => {
    installGlobals({ isGM: false, character: null });
    await loadModule();
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 20, remaining: 5 }] };
    uniform = () => 0.999;

    expect((await rollTerm(Die, { faces: 20 })).total).toBe(1);
  });

  it("leaves an Assistant GM's die alone while assistants are shut out", async () => {
    installGlobals({ isGM: false, assistant: true, assistantsAllowed: false });
    await loadModule();
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 20, remaining: 5 }] };
    uniform = () => 0.999;

    expect((await rollTerm(Die, { faces: 20 })).total).toBe(1);
  });

  it("gives an Assistant GM the GM queue after access is granted", async () => {
    installGlobals({ isGM: false, assistant: true, assistantsAllowed: true });
    await loadModule();
    table.__gm__ = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 20, remaining: 5 }] };

    expect((await rollTerm(Die, { faces: 20 })).total).toBe(20);
  });

  it("forces a player's die from their assigned character's queue", async () => {
    installGlobals({ isGM: false, character: { id: "actor1" } });
    await loadModule();
    table.actor1 = { enabled: true, weights: {}, forces: [{ id: "f1", dieKey: "d20", value: 13, remaining: 5 }] };

    expect((await rollTerm(Die, { faces: 20 })).total).toBe(13);
  });
});
