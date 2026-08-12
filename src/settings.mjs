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
}
