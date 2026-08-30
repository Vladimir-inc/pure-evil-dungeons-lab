import { MODULE_ID, SETTINGS } from "./constants.mjs";

export function registerSettings() {
  // deliberately config:false - a world setting with config:true is visible to players in the
  // Settings sidebar, and this module works best when they do not go looking. The master
  // switch lives in the GM window instead.
  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.CHARACTERS, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, SETTINGS.KNOWN_DICE, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, SETTINGS.ASSISTANTS, {
    name: "PURE_EVIL.Settings.Assistants.Name",
    hint: "PURE_EVIL.Settings.Assistants.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}

/** Hide the access toggle from Assistant GMs, who could otherwise grant it to themselves. */
export function hideFromAssistants() {
  if (game.user?.hasRole?.("GAMEMASTER")) return;
  const setting = game.settings.settings.get(`${MODULE_ID}.${SETTINGS.ASSISTANTS}`);
  if (setting) setting.config = false;
}
