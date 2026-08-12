import { describe, expect, it } from "vitest";
import { dieKey, dieLabel, enumerateFaces } from "../src/core/dice-info.mjs";

// the real v14 mappers, copied from client/dice/terms/{dice,coin,fate}.mjs
const die = (faces) => (u) => Math.ceil((1 - u) * faces);
const coin = () => (u) => Math.round(u);
const fate = (faces) => (u) => Math.ceil(u * faces - 2);

describe("enumerateFaces", () => {
  it("derives 1..N for a plain die", () => {
    expect(enumerateFaces(6, die(6))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(enumerateFaces(20, die(20))).toHaveLength(20);
    expect(enumerateFaces(100, die(100)).at(-1)).toBe(100);
  });

  it("derives the exotic faces of Coin and Fate without knowing the class", () => {
    expect(enumerateFaces(2, coin())).toEqual([0, 1]);
    expect(enumerateFaces(3, fate(3))).toEqual([-1, 0, 1]);
  });

  it("survives odd face counts and rejects nonsense", () => {
    expect(enumerateFaces(3, die(3))).toEqual([1, 2, 3]);
    expect(enumerateFaces(0, die(0))).toEqual([]);
    expect(enumerateFaces(2.5, die(2.5))).toEqual([]);
  });
});

describe("dieKey / dieLabel", () => {
  it("keys a die kind by denomination and face count", () => {
    expect(dieKey("d", 20)).toBe("d20");
    expect(dieKey("c", 2)).toBe("c2");
    expect(dieKey("f", 3)).toBe("f3");
    expect(dieKey("", 8)).toBe("d8");
  });

  it("names exotic dice", () => {
    expect(dieLabel("d", 12)).toBe("d12");
    expect(dieLabel("c", 2)).toBe("Coin");
    expect(dieLabel("f", 3)).toBe("Fate");
  });
});
