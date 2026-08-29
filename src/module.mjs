import { GM_SUBJECT, MODULE_ID, SEED_DICE, SETTINGS } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { dieKey, enumerateFaces } from "./core/dice-info.mjs";
import { installInterceptor, interceptorStatus, subjectIds } from "./dice/interceptor.mjs";
import { controlTable, invalidateCache, isModuleArmed, knownDice, registerDie, registerSocket } from "./dice/store.mjs";
import { installLauncher, refreshLauncher } from "./apps/launcher.mjs";
import { hubActive, showHubGate } from "./hub-gate.mjs";
import PureEvilApp from "./apps/pure-evil-app.mjs";
import { registerDevTools } from "virtual:dungeons-lab/dev-tools";
import "../styles/module.less";

Hooks.once("init", () => {
  registerDevTools();
  // No Hub, no module: nothing below installs, so no settings are registered, no roll is
  // touched and no launcher appears. The GM gets told why on ready.
  if (!hubActive()) return;

  registerSettings();
  registerSocket();
  // every client patches: the roll is decided on whichever client evaluates it
  installInterceptor();
  game.modules.get(MODULE_ID).api = { debug, open: () => PureEvilApp.open() };
  installHooks();
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (!hubActive()) return showHubGate();
  await pruneCorruptKeys();
  seedKnownDice();
  installLauncher();
});

/**
 * One-time cleanup of data written before the die-key fix. Die#denomination already contains the
 * face count ("d20"), so building a key from it registered every ordinary die as "d2020": a
 * duplicate chip in the window, and queued forces that could never match a real roll. Those
 * entries carry a multi-character denomination, which a real one never does.
 */
async function pruneCorruptKeys() {
  const dice = knownDice();
  const bad = new Set(
    Object.entries(dice)
      .filter(([, die]) => (die?.denomination?.length ?? 0) > 1)
      .map(([key]) => key),
  );
  if (!bad.size) return;

  const cleanDice = { ...dice };
  for (const key of bad) delete cleanDice[key];
  await game.settings.set(MODULE_ID, SETTINGS.KNOWN_DICE, cleanDice);

  const table = foundry.utils.deepClone(controlTable());
  let changed = false;
  for (const entry of Object.values(table)) {
    const forces = Array.isArray(entry?.forces) ? entry.forces.filter((f) => !bad.has(f?.dieKey)) : null;
    if (forces && forces.length !== entry.forces.length) {
      entry.forces = forces;
      changed = true;
    }
    for (const key of Object.keys(entry?.weights ?? {})) {
      if (!bad.has(key)) continue;
      delete entry.weights[key];
      changed = true;
    }
  }
  if (changed) await game.settings.set(MODULE_ID, SETTINGS.CHARACTERS, table);
  console.log(`${MODULE_ID} | pruned ${bad.size} mis-keyed dice: ${[...bad].join(", ")}`);
}

/** Registered from init, so the Hub gate above covers these too. */
function installHooks() {
  // #chat-controls moves between the notification area and the chat form rather than being
  // re-rendered, so one successful injection sticks. These are the three moments it can first
  // exist: chat log painted, chat input (re)parented, world ready.
  Hooks.on("renderChatLog", () => installLauncher());
  Hooks.on("renderChatInput", (chat, elements) => installLauncher(elements["#chat-controls"]));

  // world settings are Setting documents, so every client learns about a GM edit through these
  for (const hook of ["createSetting", "updateSetting"]) {
    Hooks.on(hook, (setting) => {
      const [namespace, key] = setting.key.split(".");
      if (namespace !== MODULE_ID) return;
      invalidateCache(key);
      refreshLauncher();
      PureEvilApp.refresh();
    });
  }
}

/**
 * Give the GM something to configure before anyone has rolled: the seven standard dice, plus
 * every non-standard die class the active game system registered, described through its own
 * mapper so Fate comes out as -1/0/+1 and a coin as 0/1. Anything still missing is picked up
 * the first time it is actually rolled (see store.noteDie).
 */
function seedKnownDice() {
  const known = knownDice();
  for (const faces of SEED_DICE) {
    const key = `d${faces}`;
    if (!known[key]) registerDie(key, "d", faces, Array.from({ length: faces }, (_, i) => i + 1));
  }

  for (const Cls of new Set(Object.values(CONFIG.Dice.terms ?? {}))) {
    if (Cls.DENOMINATION === "d") continue;
    try {
      const probe = new Cls({});
      const key = dieKey(Cls.DENOMINATION, probe.faces);
      if (!Number.isInteger(probe.faces) || known[key]) continue;
      registerDie(key, Cls.DENOMINATION, probe.faces, enumerateFaces(probe.faces, (u) => probe.mapRandomFace(u)));
    } catch (err) {
      console.warn(`${MODULE_ID} | could not describe die class ${Cls.name}`, err);
    }
  }
}

/**
 * One-shot health check: `game.modules.get("pure-evil").api.debug()` in the console.
 * Answers, in order, every question that can make the module look dead - is it patched, does
 * this client attribute rolls to anybody, is that character switched on, and does a real d20
 * actually come out forced.
 */
async function debug() {
  const ids = subjectIds();
  const table = controlTable();
  const report = {
    version: game.modules.get(MODULE_ID)?.version,
    isGM: game.user.isGM,
    masterSwitch: isModuleArmed(),
    interception: interceptorStatus(),
    // if this is empty, nothing on this client can ever be bent: no GM rights, no assigned
    // character and no selected token means there is nobody to attribute the roll to
    subjects: ids.map((id) => ({
      id,
      name: id === GM_SUBJECT ? "GM rolls" : (game.actors.get(id)?.name ?? "(unknown actor)"),
      entry: table[id] ?? null,
    })),
    controlTable: table,
    knownDice: Object.keys(knownDice()),
    coreDiceConfiguration: game.settings.get("core", "diceConfiguration"),
    fulfillmentDefault: CONFIG.Dice.fulfillment.defaultMethod,
  };
  report.testRolls = [];
  for (let i = 0; i < 3; i++) report.testRolls.push((await new Roll("1d20").evaluate()).total);
  console.log(`${MODULE_ID} | debug report`, report);
  return report;
}
