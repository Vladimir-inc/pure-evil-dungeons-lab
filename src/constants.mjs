export const MODULE_ID = "pure-evil";

export const SOCKET = `module.${MODULE_ID}`;

// Reserved control-table key for "any roll the GM makes", whoever it is for - an NPC, a chat
// /roll, a player's sheet the GM opened. Not an actor id, and cannot collide with one: Foundry
// ids are 16 alphanumeric characters.
export const GM_SUBJECT = "__gm__";

export const SETTINGS = {
  ENABLED: "enabled",
  CHARACTERS: "characters",
  KNOWN_DICE: "knownDice",
};

// seeded so the GM has something to configure before anyone has rolled; every other die
// (Coin, Fate, whatever a system invents) is discovered at runtime, see dice/store.mjs
export const SEED_DICE = [4, 6, 8, 10, 12, 20, 100];

// a weight row per face stops being a usable UI somewhere past a d100; bigger dice still
// accept forced rolls, they just do not get a probability editor
export const WEIGHTS_MAX_FACES = 100;

// ceiling of the weight slider. 1 is fair, so 10 means "ten times as likely as a fair face" -
// enough to make a face dominate without turning the editor into a way to fake a forced roll.
export const WEIGHT_MAX = 10;
