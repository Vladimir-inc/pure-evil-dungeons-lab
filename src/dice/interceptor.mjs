// The whole cheat, in two prototype patches on one base class.
//
// Foundry v14 produces a die result in two places, and which one runs depends on the client's
// Dice Configuration setting, which we do not own:
//
//   DiceTerm#_roll()      -> the configured fulfillment handler. The built-in "mersenne" method
//                            is `term => term.mapRandomFace(MersenneTwister.random())`.
//   DiceTerm#randomFace() -> the fallback, used only when the handler produced nothing.
//
// Out of the box `CONFIG.Dice.fulfillment.defaultMethod` is "" and the core diceConfiguration
// setting defaults to {}, so the handler slot resolves to nothing and randomFace runs. A system
// or module that sets a default method moves the entire table onto the other path. Patching both
// makes the module independent of that setting.
//
// Both are defined ONLY on the base DiceTerm - Coin and FateDie override `roll` and
// `mapRandomFace`, never these two - so one patch each covers Die, Coin, Fate and any term class
// a game system registers.
//
// Because the number is decided before it exists anywhere else, everything downstream agrees:
// chat, the dnd5e/Midi QOL crit and success checks, and Dice So Nice, which simulates its throw
// and then rotates the die so the already-decided face lands up (swapDiceFace).

import { GM_SUBJECT, MODULE_ID } from "../constants.mjs";
import { dieKey, enumerateFaces } from "../core/dice-info.mjs";
import { pickForce, readCharacter, sampleWeighted } from "../core/control-table.mjs";
import { controlTable, isModuleArmed, isOperator, noteDie, pending, reportConsume } from "./store.mjs";

const FORCED = Symbol(`${MODULE_ID}.forced`);
const FACE_CACHE = new Map();

/** Face values of this term's die kind, derived from the term's own mapper and memoised. */
export function facesOf(term) {
  const cacheKey = `${term.constructor.name}:${term.faces}`;
  let faces = FACE_CACHE.get(cacheKey);
  if (!faces) {
    faces = enumerateFaces(term.faces, (u) => term.mapRandomFace(u));
    FACE_CACHE.set(cacheKey, faces);
  }
  return faces;
}

const KEEP_DROP = /^(kh|kl|dh|dl|k|d)\d*$/i;

/**
 * Whose control table applies to a roll made on THIS client, most specific intent first.
 *
 * A roll carries no reliable actor reference by the time a die is being produced, and randomFace
 * is synchronous, so attribution has to come from the client doing the rolling:
 *
 *  1. GM_SUBJECT - every roll a GM makes, whoever it is for. An NPC attack, a /roll in chat, a
 *     player's sheet the GM opened: it is the GM's client, so it is the GM's queue.
 *  2. The rolling user's assigned character, or failing that their selected token's actor. This
 *     is the per-player control the GM configures per character.
 *
 * A GM gets both, in that order, so a GM-queued force wins over the character's table and the
 * character's table still applies when the GM queue has nothing to say.
 */
export function subjectIds() {
  const ids = [];
  if (isOperator()) ids.push(GM_SUBJECT);
  const actorId = game.user?.character?.id ?? canvas?.tokens?.controlled?.[0]?.actor?.id;
  if (actorId) ids.push(actorId);
  return ids;
}

/**
 * @returns {number|null} The face this die must show, or null to let it roll honestly.
 */
function decide(term) {
  const faces = term.faces;
  if (!Number.isInteger(faces) || faces < 1) return null;

  // the STATIC denomination - see the trap documented on dieKey()
  const denomination = term.constructor.DENOMINATION;
  const key = dieKey(denomination, faces);
  noteDie(key, denomination, faces, facesOf(term));

  // a keep/drop term (advantage, disadvantage, 4d6dl1) already latched onto a forced value
  if (term[FORCED] !== undefined) return term[FORCED];

  // Only the dice the term actually asked for. Rerolls and explosions produced by modifiers run
  // through here too, and leaving those honest is what stops a forced 6 on an exploding d6 from
  // exploding forever.
  if (term.results.length >= Math.abs(term.number ?? 1)) return null;

  const table = controlTable();
  for (const subjectId of subjectIds()) {
    const entry = readCharacter(table, subjectId);
    if (!entry.enabled) continue;

    const force = pickForce(entry.forces, key, pending);
    if (force) {
      pending.set(force.id, (pending.get(force.id) ?? 0) + 1);
      reportConsume(subjectId, force.id);
      // With advantage or disadvantage the GM means "the roll shows N", so every die of a
      // keep/drop term gets the forced value and the kept one is N whichever way it resolves.
      if (term.modifiers?.some((m) => KEEP_DROP.test(m))) term[FORCED] = force.value;
      return announce(term, key, subjectId, force.value, "forced");
    }

    const weighted = sampleWeighted(entry.weights?.[key], facesOf(term), CONFIG.Dice.randomUniform);
    if (weighted !== null) return announce(term, key, subjectId, weighted, "weighted");
  }
  return null;
}

// Logged on the GM's client only. A player's console must stay clean - the module is worthless
// the moment it narrates itself to the table.
function announce(term, key, subjectId, value, how) {
  if (isOperator()) console.log(`${MODULE_ID} | ${how} ${key} -> ${value} (subject: ${subjectId})`);
  return value;
}

/** Wrapped so a broken cheat can never break the table's dice. */
function decideSafely(term) {
  try {
    if (!isModuleArmed()) return null;
    return decide(term);
  } catch (err) {
    console.error(`${MODULE_ID} | roll interception failed, rolling fair`, err);
    return null;
  }
}

export function installInterceptor() {
  const { DiceTerm } = foundry.dice.terms;
  if (DiceTerm.prototype._roll[MODULE_ID]) return;

  const originalRoll = DiceTerm.prototype._roll;
  async function _roll(options = {}) {
    const forced = decideSafely(this);
    if (forced !== null) return forced; // 0 and -1 are real faces, so only null means "decline"
    return originalRoll.call(this, options);
  }
  _roll[MODULE_ID] = true;
  DiceTerm.prototype._roll = _roll;

  const originalFace = DiceTerm.prototype.randomFace;
  function randomFace() {
    const forced = decideSafely(this);
    if (forced !== null) return forced;
    return originalFace.call(this);
  }
  randomFace[MODULE_ID] = true;
  DiceTerm.prototype.randomFace = randomFace;
}

/** Is the interception actually in place on this client? Used by the debug report. */
export function interceptorStatus() {
  const { DiceTerm } = foundry.dice.terms;
  return {
    _roll: DiceTerm.prototype._roll?.[MODULE_ID] === true,
    randomFace: DiceTerm.prototype.randomFace?.[MODULE_ID] === true,
  };
}
