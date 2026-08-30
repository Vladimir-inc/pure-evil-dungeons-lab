import { registerWithHub } from "@dungeons-lab/hub-contract";
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { HUB_ID } from "./hub-gate.mjs";

export function buildHubManifest() {
  return {
    id: MODULE_ID,
    title: "PURE_EVIL.Title",
    settings: [
      {
        key: SETTINGS.ASSISTANTS,
        type: "boolean",
        label: "PURE_EVIL.Settings.Assistants.Name",
        hint: "PURE_EVIL.Settings.Assistants.Hint",
      },
    ],
    panels: [],
    settingsAccess: () => game.user?.hasRole?.("GAMEMASTER") ?? false,
  };
}

/** Register immediately when the API exists and again through the canonical Hub-ready handshake. */
export function registerPureEvilWithHub(env) {
  return registerWithHub(HUB_ID, buildHubManifest, env);
}
