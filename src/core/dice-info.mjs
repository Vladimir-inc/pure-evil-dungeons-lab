// Pure die introspection. No Foundry imports - a DiceTerm is passed in as plain numbers plus
// its own mapRandomFace function, so this file is unit-testable in a bare node env.

/**
 * Enumerate the distinct face values a die can produce, without knowing anything about the die
 * class. Foundry maps a uniform draw in [0, 1) onto a face via `DiceTerm#mapRandomFace`, and a
 * fair die splits that interval into `faces` equal buckets - so sampling the CENTRE of every
 * bucket yields exactly the set of reachable faces.
 *
 * Die -> 1..N, Coin -> 0/1, FateDie -> -1/0/1, and whatever a game system invents, all for free.
 *
 * @param {number} faces                        Face count of the term.
 * @param {(u: number) => number} mapRandomFace The term's own mapper.
 * @returns {number[]}                          Distinct face values, ascending.
 */
export function enumerateFaces(faces, mapRandomFace) {
  if (!Number.isInteger(faces) || faces < 1) return [];
  const seen = new Set();
  for (let i = 0; i < faces; i++) {
    const value = mapRandomFace((i + 0.5) / faces);
    if (Number.isFinite(value)) seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Stable identity for a kind of die: denomination + face count. "d20", "c2", "f3", "d13".
 * Two dice share a control table entry exactly when they would show the same faces.
 *
 * TRAP: pass the STATIC `TermClass.DENOMINATION`, never the instance's `term.denomination`.
 * Die overrides that getter to return `d${faces}` - it is the key the core Dice Configuration
 * setting is indexed by - so the instance value already contains the face count and building a
 * key from it yields "d2020". Coin and FateDie do not override it, which is exactly how that bug
 * hides: exotic dice keep working while every ordinary die silently stops matching.
 */
export function dieKey(denomination, faces) {
  return `${denomination || "d"}${faces}`;
}

/** Human label for a die kind. Coin and Fate read better by name than as "c2" / "f3". */
export function dieLabel(denomination, faces) {
  if (denomination === "c") return "Coin";
  if (denomination === "f") return "Fate";
  return `d${faces}`;
}
