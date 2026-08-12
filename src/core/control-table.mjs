// Pure control-table logic: what the GM configured, and what a die should therefore show.
// No Foundry imports - the caller injects the RNG. This is the tested half of the module.

/** A face with no explicit weight is fair, and 1 is the weight that means "unchanged". */
export const FAIR = 1;

export function blankCharacter() {
  return { enabled: false, weights: {}, forces: [] };
}

/**
 * Read one character's control entry out of the world table, tolerating anything a hand-edited
 * or half-migrated setting might contain.
 * @returns {{enabled: boolean, weights: object, forces: object[]}}
 */
export function readCharacter(table, actorId) {
  const raw = table?.[actorId];
  return {
    enabled: raw?.enabled === true,
    weights: raw?.weights && typeof raw.weights === "object" ? raw.weights : {},
    forces: Array.isArray(raw?.forces) ? raw.forces : [],
  };
}

function weightOf(map, face) {
  const w = Number(map?.[face]);
  return Number.isFinite(w) && w >= 0 ? w : FAIR;
}

/** True when this weight map would not change the odds of anything. */
export function isFair(map, faces) {
  if (!map) return true;
  return faces.every((face) => weightOf(map, face) === FAIR);
}

/** Weight rows for the editor, with the relative weights resolved into display percentages. */
export function weightRows(map, faces) {
  const rows = faces.map((face) => ({ face, weight: weightOf(map, face) }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return rows.map((row) => ({
    ...row,
    pct: total > 0 ? (row.weight / total) * 100 : 0,
  }));
}

/**
 * Draw a face from a weight map.
 * @returns {number|null} null when the table is fair or unusable, which tells the caller to keep
 *                        Foundry's own PRNG rather than substituting a second one.
 */
export function sampleWeighted(map, faces, randomUniform) {
  if (!faces?.length || isFair(map, faces)) return null;
  const weights = faces.map((face) => weightOf(map, face));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  let draw = randomUniform() * total;
  for (let i = 0; i < faces.length; i++) {
    draw -= weights[i];
    if (draw < 0) return faces[i];
  }
  return faces[faces.length - 1]; // float rounding guard, unreachable in practice
}

/**
 * The next forced result queued for this kind of die, if any charges are left.
 * @param {Map<string, number>} [pending] Charges already spent locally but not yet written back
 *                                        by the GM - keeps a fast double roll from reusing one.
 */
export function pickForce(forces, key, pending) {
  for (const force of forces) {
    if (force?.dieKey !== key) continue;
    const left = (Number(force.remaining) || 0) - (pending?.get(force.id) ?? 0);
    if (left > 0) return force;
  }
  return null;
}

/** Spend one charge; entries that run out drop off the queue. */
export function consumeForce(forces, id) {
  return forces
    .map((force) => (force.id === id ? { ...force, remaining: (Number(force.remaining) || 0) - 1 } : force))
    .filter((force) => (Number(force.remaining) || 0) > 0);
}

/** Is anything on this character actually altering rolls right now? Drives the "armed" UI. */
export function isArmed(entry, faceLookup) {
  if (!entry.enabled) return false;
  if (entry.forces.some((f) => (Number(f.remaining) || 0) > 0)) return true;
  return Object.entries(entry.weights).some(([key, map]) => !isFair(map, faceLookup(key) ?? []));
}
