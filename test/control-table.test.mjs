import { describe, expect, it } from "vitest";
import {
  consumeForce,
  isArmed,
  isFair,
  pickForce,
  readCharacter,
  sampleWeighted,
  weightRows,
} from "../src/core/control-table.mjs";

const D6 = [1, 2, 3, 4, 5, 6];
const fixed = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe("readCharacter", () => {
  it("returns a safe entry for anything the setting might hold", () => {
    expect(readCharacter({}, "abc")).toEqual({ enabled: false, weights: {}, forces: [] });
    expect(readCharacter({ abc: { enabled: "yes", weights: 7, forces: "nope" } }, "abc")).toEqual({
      enabled: false,
      weights: {},
      forces: [],
    });
  });
});

describe("isFair / weightRows", () => {
  it("treats a missing or all-ones map as fair", () => {
    expect(isFair(undefined, D6)).toBe(true);
    expect(isFair({}, D6)).toBe(true);
    expect(isFair({ 6: 1 }, D6)).toBe(true);
    expect(isFair({ 6: 10 }, D6)).toBe(false);
  });

  it("resolves relative weights into percentages", () => {
    const rows = weightRows({ 6: 10 }, D6);
    expect(rows.at(-1)).toMatchObject({ face: 6, weight: 10 });
    expect(rows.at(-1).pct).toBeCloseTo((10 / 15) * 100);
    expect(rows[0].pct).toBeCloseTo((1 / 15) * 100);
    expect(rows.reduce((sum, r) => sum + r.pct, 0)).toBeCloseTo(100);
  });
});

describe("sampleWeighted", () => {
  it("declines a fair table so Foundry's own PRNG is kept", () => {
    expect(sampleWeighted({}, D6, fixed(0.5))).toBeNull();
    expect(sampleWeighted({ 3: 1 }, D6, fixed(0.5))).toBeNull();
    expect(sampleWeighted({ 3: 5 }, [], fixed(0.5))).toBeNull();
  });

  it("declines a table that adds up to nothing", () => {
    const zeroed = Object.fromEntries(D6.map((f) => [f, 0]));
    expect(sampleWeighted(zeroed, D6, fixed(0.5))).toBeNull();
  });

  it("maps the uniform draw onto the cumulative weights", () => {
    const heavySix = { 6: 10 }; // total 15, faces 1..5 weigh 1 each
    expect(sampleWeighted(heavySix, D6, fixed(0))).toBe(1);
    expect(sampleWeighted(heavySix, D6, fixed(4.5 / 15))).toBe(5);
    expect(sampleWeighted(heavySix, D6, fixed(5 / 15))).toBe(6);
    expect(sampleWeighted(heavySix, D6, fixed(0.999999))).toBe(6);
  });

  it("never draws a face weighted to zero", () => {
    const noOnes = { 1: 0 };
    for (const u of [0, 0.0001, 0.2, 0.999999]) {
      expect(sampleWeighted(noOnes, D6, fixed(u))).not.toBe(1);
    }
  });

  it("works on exotic face values, negatives included", () => {
    expect(sampleWeighted({ "-1": 100 }, [-1, 0, 1], fixed(0.5))).toBe(-1);
    expect(sampleWeighted({ 0: 100 }, [0, 1], fixed(0.5))).toBe(0);
  });
});

describe("force queue", () => {
  const forces = [
    { id: "a", dieKey: "d20", value: 20, remaining: 2 },
    { id: "b", dieKey: "d6", value: 6, remaining: 1 },
  ];

  it("matches on the die kind only", () => {
    expect(pickForce(forces, "d20").id).toBe("a");
    expect(pickForce(forces, "d6").id).toBe("b");
    expect(pickForce(forces, "d8")).toBeNull();
  });

  it("does not hand out a charge already spent locally", () => {
    expect(pickForce(forces, "d6", new Map([["b", 1]]))).toBeNull();
    expect(pickForce(forces, "d20", new Map([["a", 1]])).id).toBe("a");
    expect(pickForce(forces, "d20", new Map([["a", 2]]))).toBeNull();
  });

  it("decrements on consume and drops entries that run out", () => {
    expect(consumeForce(forces, "a")).toEqual([
      { id: "a", dieKey: "d20", value: 20, remaining: 1 },
      { id: "b", dieKey: "d6", value: 6, remaining: 1 },
    ]);
    expect(consumeForce(forces, "b").map((f) => f.id)).toEqual(["a"]);
    expect(consumeForce(forces, "missing")).toHaveLength(2);
  });
});

describe("isArmed", () => {
  const faces = () => D6;

  it("is off unless the character is enabled", () => {
    const entry = { enabled: false, weights: { d6: { 6: 10 } }, forces: [] };
    expect(isArmed(entry, faces)).toBe(false);
  });

  it("is on for a queued force or a biased table, off for an enabled but fair one", () => {
    expect(isArmed({ enabled: true, weights: {}, forces: [] }, faces)).toBe(false);
    expect(isArmed({ enabled: true, weights: { d6: { 6: 1 } }, forces: [] }, faces)).toBe(false);
    expect(isArmed({ enabled: true, weights: { d6: { 6: 9 } }, forces: [] }, faces)).toBe(true);
    expect(
      isArmed({ enabled: true, weights: {}, forces: [{ id: "a", dieKey: "d6", value: 6, remaining: 1 }] }, faces),
    ).toBe(true);
  });
});
