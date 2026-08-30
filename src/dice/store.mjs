// The Foundry-bound half: cached setting reads, and the one socket that lets a player's client
// tell the GM "I just spent a forced roll" / "I just saw a die you have never seen".
//
// Why a world setting rather than actor flags: every client needs a SYNCHRONOUS read of the
// control table, because DiceTerm#randomFace is synchronous - there is no chance to await a
// socket round trip mid-roll. World settings are replicated and cached on every client, so the
// decision is always local; only the write-back is remote.

import { MODULE_ID, SETTINGS, SOCKET } from "../constants.mjs";
import { consumeForce, readCharacter } from "../core/control-table.mjs";

let tableCache = null;
let knownCache = null;
let enabledCache = null;
let assistantsCache = null;

/** Force charges spent locally that the GM has not written back yet. */
export const pending = new Map();

export function invalidateCache(key) {
  if (key === SETTINGS.CHARACTERS) {
    tableCache = null;
    pending.clear();
  } else if (key === SETTINGS.KNOWN_DICE) knownCache = null;
  else if (key === SETTINGS.ENABLED) enabledCache = null;
  else if (key === SETTINGS.ASSISTANTS) assistantsCache = null;
}

export function isModuleArmed() {
  if (enabledCache === null) enabledCache = game.settings.get(MODULE_ID, SETTINGS.ENABLED) === true;
  return enabledCache;
}

/** Full GMs always operate the module; Assistant GMs require the explicit world toggle. */
export function isOperator() {
  if (!game.user?.isGM) return false;
  if (game.user?.hasRole?.("GAMEMASTER")) return true;
  if (assistantsCache === null) assistantsCache = game.settings.get(MODULE_ID, SETTINGS.ASSISTANTS) === true;
  return assistantsCache;
}

export function controlTable() {
  if (!tableCache) tableCache = game.settings.get(MODULE_ID, SETTINGS.CHARACTERS) ?? {};
  return tableCache;
}

export function knownDice() {
  if (!knownCache) knownCache = game.settings.get(MODULE_ID, SETTINGS.KNOWN_DICE) ?? {};
  return knownCache;
}

export function faceValuesFor(key) {
  return knownDice()[key]?.faceValues ?? [];
}

/* -------------------------------------------- */
/*  Socket                                      */
/* -------------------------------------------- */

// game.socket.emit never loops back to the sender, so everything goes through here.
function dispatch(payload) {
  game.socket.emit(SOCKET, payload);
  applyAsGM(payload);
}

export function registerSocket() {
  game.socket.on(SOCKET, applyAsGM);
}

// One writer, one queue: consume messages from several players and the GM's own edits would
// otherwise read-modify-write the same setting concurrently and lose updates.
let writeQueue = Promise.resolve();
function serial(task) {
  writeQueue = writeQueue.then(task).catch((err) => console.error(`${MODULE_ID} |`, err));
  return writeQueue;
}

function applyAsGM(payload) {
  if (!game.user.isActiveGM) return;
  if (payload?.action === "consume") {
    serial(async () => {
      const table = foundry.utils.deepClone(controlTable());
      const entry = readCharacter(table, payload.actorId);
      if (!entry.forces.some((f) => f?.id === payload.id)) return; // already spent by an earlier message
      table[payload.actorId] = { ...entry, forces: consumeForce(entry.forces, payload.id) };
      await game.settings.set(MODULE_ID, SETTINGS.CHARACTERS, table);
    });
  } else if (payload?.action === "die") {
    serial(async () => {
      const dice = foundry.utils.deepClone(knownDice());
      if (dice[payload.key]) return;
      dice[payload.key] = {
        denomination: payload.denomination,
        faces: payload.faces,
        faceValues: payload.faceValues,
      };
      await game.settings.set(MODULE_ID, SETTINGS.KNOWN_DICE, dice);
    });
  }
}

/* -------------------------------------------- */
/*  Reports from the roll interceptor           */
/* -------------------------------------------- */

const reported = new Set();

/** Tell the GM about a die kind nobody has registered yet, so it shows up in the window. */
export function noteDie(key, denomination, faces, faceValues) {
  if (reported.has(key) || knownDice()[key]) return;
  reported.add(key);
  dispatch({ action: "die", key, denomination, faces, faceValues });
}

export function reportConsume(actorId, id) {
  dispatch({ action: "consume", actorId, id });
}

/* -------------------------------------------- */
/*  GM-side writes (the control window)         */
/* -------------------------------------------- */

export function updateTable(mutate) {
  return serial(async () => {
    const table = foundry.utils.deepClone(controlTable());
    const next = mutate(table);
    if (next === false) return;
    await game.settings.set(MODULE_ID, SETTINGS.CHARACTERS, next ?? table);
  });
}

export function registerDie(key, denomination, faces, faceValues) {
  return serial(async () => {
    const dice = foundry.utils.deepClone(knownDice());
    if (dice[key]) return;
    dice[key] = { denomination, faces, faceValues };
    await game.settings.set(MODULE_ID, SETTINGS.KNOWN_DICE, dice);
  });
}
