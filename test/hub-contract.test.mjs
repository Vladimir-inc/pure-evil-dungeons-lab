import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { auditManifest, createHubHarness } from "@dungeons-lab/hub-contract/testing";
import { HUB_ID } from "../src/hub-gate.mjs";
import { buildHubManifest, registerPureEvilWithHub } from "../src/hub-registration.mjs";
import { MODULE_ID, SETTINGS } from "../src/constants.mjs";
import { registerSettings } from "../src/settings.mjs";

const dictionaries = {
  en: JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")),
  ru: JSON.parse(readFileSync(new URL("../lang/ru.json", import.meta.url), "utf8")),
};

afterEach(() => {
  delete globalThis.game;
});

describe("Hub contract registration", () => {
  it("registers immediately when HubApiV1 is already present", () => {
    const harness = createHubHarness();
    harness.game.modules.set(HUB_ID, { active: true, api: harness.api });
    registerPureEvilWithHub({ game: harness.game, Hooks: harness.Hooks });

    expect(harness.registered.get(MODULE_ID)).toMatchObject({ id: MODULE_ID, panels: [] });
  });

  it("registers when the Hub ready hook arrives later", () => {
    const harness = createHubHarness();
    registerPureEvilWithHub({ game: harness.game, Hooks: harness.Hooks });
    expect(harness.registered.size).toBe(0);

    harness.fireReady();
    expect(harness.registered.get(MODULE_ID)?.settings).toHaveLength(1);
  });

  it("rejects apiVersion 2 in both handshake paths", () => {
    const harness = createHubHarness();
    const v2 = { ...harness.api, apiVersion: 2 };
    harness.game.modules.set(HUB_ID, { active: true, api: v2 });
    registerPureEvilWithHub({ game: harness.game, Hooks: harness.Hooks });
    harness.fireReady(v2);

    expect(harness.registered.size).toBe(0);
  });

  it("audits the manifest against real setting registrations and both dictionaries", () => {
    const harness = createHubHarness();
    globalThis.game = harness.game;
    registerSettings();

    const configurable = [...harness.game.settings.settings.entries()]
      .filter(([, config]) => config.config === true)
      .map(([key]) => key.slice(`${MODULE_ID}.`.length));
    expect(configurable).toEqual([SETTINGS.ASSISTANTS]);

    const result = auditManifest(buildHubManifest(), {
      settingsRegistry: harness.game.settings,
      i18n: dictionaries,
      settingKeys: configurable,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("limits Hub settings access to a full Gamemaster", () => {
    globalThis.game = { user: { hasRole: (role) => role === "GAMEMASTER" } };
    expect(buildHubManifest().settingsAccess()).toBe(true);
    globalThis.game.user.hasRole = () => false;
    expect(buildHubManifest().settingsAccess()).toBe(false);
  });
});
