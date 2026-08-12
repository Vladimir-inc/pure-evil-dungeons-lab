import { GM_SUBJECT, MODULE_ID, SETTINGS, WEIGHT_MAX, WEIGHTS_MAX_FACES } from "../constants.mjs";
import { L, LF } from "../i18n.mjs";
import { dieLabel } from "../core/dice-info.mjs";
import { isArmed, isFair, readCharacter, weightRows } from "../core/control-table.mjs";
import { controlTable, faceValuesFor, knownDice, registerDie, updateTable } from "../dice/store.mjs";
import { subjectIds } from "../dice/interceptor.mjs";
import { DISCORD_URL, KOFI_URL, randomPhrase } from "../ui/phrases.mjs";

const PHRASE_ROTATE_MS = 15000;

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TABS = ["weights", "forced"];

export default class PureEvilApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: MODULE_ID,
    tag: "div",
    classes: ["pure-evil"],
    window: {
      icon: "fa-solid fa-face-angry-horns",
      title: "PURE_EVIL.Title",
      resizable: true,
      contentClasses: ["pe-window-content"],
    },
    position: { width: 920, height: 640 },
    actions: {
      selectSubject: PureEvilApp.#onSelectSubject,
      toggleSubject: PureEvilApp.#onToggleSubject,
      switchTab: PureEvilApp.#onSwitchTab,
      selectDie: PureEvilApp.#onSelectDie,
      addDie: PureEvilApp.#onAddDie,
      resetWeights: PureEvilApp.#onResetWeights,
      addForce: PureEvilApp.#onAddForce,
      deleteForce: PureEvilApp.#onDeleteForce,
      toggleMaster: PureEvilApp.#onToggleMaster,
      phraseClick: () => window.open(DISCORD_URL, "_blank", "noopener"),
    },
  };

  static PARTS = {
    characters: { template: `modules/${MODULE_ID}/templates/parts/characters.hbs`, scrollable: [""] },
    panel: {
      template: `modules/${MODULE_ID}/templates/parts/panel.hbs`,
      scrollable: [".pe-faces", ".pe-queue"],
    },
    footer: { template: `modules/${MODULE_ID}/templates/parts/footer.hbs` },
  };

  #subjectId = GM_SUBJECT;
  #tab = TABS[0];
  #dieKey = "d20";
  #lastDieIndex = null;
  #phraseTimer = null;

  /* -------------------------------------------- */

  static open() {
    if (!game.user.isGM) return null;
    const existing = foundry.applications.instances.get(MODULE_ID);
    const app = existing instanceof PureEvilApp ? existing : new PureEvilApp();
    app.render(true);
    return app;
  }

  /** Re-render whatever is open after any client learns the control table changed. */
  static refresh() {
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof PureEvilApp && app.rendered) app.render();
    }
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  #stats(entry) {
    return {
      enabled: entry.enabled,
      armed: isArmed(entry, faceValuesFor),
      forceCount: entry.forces.reduce((sum, f) => sum + (Number(f.remaining) || 0), 0),
      biased: Object.entries(entry.weights).some(([key, map]) => !isFair(map, faceValuesFor(key))),
    };
  }

  /** The GM's own rolls, pinned first, then every user who has a character assigned. */
  #roster() {
    const table = controlTable();
    const players = game.users
      .filter((user) => user.character)
      .map((user) => ({
        subjectId: user.character.id,
        name: user.character.name,
        img: user.character.img,
        userName: user.name,
        userColor: user.color?.css ?? user.color ?? "#888888",
        isGM: user.isGM,
        ...this.#stats(readCharacter(table, user.character.id)),
      }))
      .sort((a, b) => Number(a.isGM) - Number(b.isGM) || a.name.localeCompare(b.name));

    const rows = [
      {
        subjectId: GM_SUBJECT,
        isGmSubject: true,
        name: L("Roster.GM"),
        subtitle: L("Roster.GMHint"),
        ...this.#stats(readCharacter(table, GM_SUBJECT)),
      },
      ...players,
    ];
    for (const row of rows) row.selected = row.subjectId === this.#subjectId;
    return rows;
  }

  #diceChips() {
    return Object.entries(knownDice())
      .map(([key, die]) => ({
        key,
        label: dieLabel(die.denomination, die.faces),
        faces: die.faces,
        selected: key === this.#dieKey,
      }))
      .sort((a, b) => a.faces - b.faces);
  }

  #subjectLabel(subjectId) {
    if (subjectId === GM_SUBJECT) return L("Roster.GM");
    return game.actors.get(subjectId)?.name ?? subjectId;
  }

  async _prepareContext() {
    const roster = this.#roster();
    // the selected subject can vanish (user unassigned, actor deleted)
    if (!roster.some((row) => row.selected)) {
      this.#subjectId = roster[0].subjectId;
      for (const row of roster) row.selected = row.subjectId === this.#subjectId;
    }

    const dice = this.#diceChips();
    if (!dice.some((d) => d.selected) && dice.length) {
      this.#dieKey = dice.find((d) => d.key === "d20")?.key ?? dice[0].key;
      for (const d of dice) d.selected = d.key === this.#dieKey;
    }

    const entry = readCharacter(controlTable(), this.#subjectId);
    const faces = faceValuesFor(this.#dieKey);
    const tooManyFaces = faces.length > WEIGHTS_MAX_FACES;

    return {
      moduleEnabled: game.settings.get(MODULE_ID, SETTINGS.ENABLED) === true,
      roster,
      hasPlayers: roster.length > 1,
      dice,
      character: roster.find((row) => row.selected),
      tab: this.#tab,
      isWeights: this.#tab === "weights",
      isForced: this.#tab === "forced",
      dieKey: this.#dieKey,
      dieLabel: dice.find((d) => d.selected)?.label ?? this.#dieKey,
      diceCount: dice.length,
      dieIndex: Math.max(0, dice.findIndex((d) => d.selected)),
      tooManyFaces,
      maxFaces: WEIGHTS_MAX_FACES,
      weightMax: WEIGHT_MAX,
      rows: tooManyFaces
        ? []
        : weightRows(entry.weights?.[this.#dieKey], faces).map((row) => ({
            ...row,
            pctLabel: `${row.pct.toFixed(1)}%`,
            // drives --pe-fill, so the slider bar and the number are one value shown twice
            pctOfMax: Math.min(100, (row.weight / WEIGHT_MAX) * 100).toFixed(1),
            boosted: row.weight > 1,
            muted: row.weight === 0,
          })),
      faceOptions: faces,
      forces: entry.forces.map((force) => ({ ...force, label: this.#labelForKey(force.dieKey) })),
      armedCount: roster.filter((row) => row.armed).length,
      // Rolls are attributed per client, so this states whose tables would apply to the GM's own
      // rolls right now - a silent "nobody" is the most confusing way for this module to look
      // broken.
      localSubjects: subjectIds().map((id) => this.#subjectLabel(id)).join(" -> "),
      phrase: randomPhrase(game.i18n.lang),
      discordUrl: DISCORD_URL,
      kofiUrl: KOFI_URL,
    };
  }

  #labelForKey(key) {
    const die = knownDice()[key];
    return die ? dieLabel(die.denomination, die.faces) : key;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  _onFirstRender() {
    this.#phraseTimer = setInterval(() => {
      const phrase = this.element?.querySelector(".pe-phrase");
      if (phrase) phrase.textContent = randomPhrase(game.i18n.lang);
    }, PHRASE_ROTATE_MS);
  }

  _onClose() {
    clearInterval(this.#phraseTimer);
    this.#phraseTimer = null;
    this.#lastDieIndex = null;
  }

  _onRender(context, options) {
    if (options.parts && !options.parts.includes("panel")) return;
    const panel = this.element.querySelector(".pe-panel");
    if (!panel) return;

    this.#animateDieThumb(context.dieIndex);

    // A wheel over a focused range input edits it, which silently rewrites a weight the GM was
    // only scrolling past. Drop focus instead, and swallow just that one tick so the value cannot
    // change; every later tick scrolls the list normally.
    panel.addEventListener(
      "wheel",
      (event) => {
        const slider = event.target.closest("input[type=range]");
        if (!slider || slider !== document.activeElement) return;
        event.preventDefault();
        slider.blur();
      },
      { passive: false },
    );

    // live % feedback while dragging, without a write or a re-render on every pixel
    panel.addEventListener("input", (event) => {
      const input = event.target.closest("[data-face]");
      if (!input) return;
      this.#syncRow(input);
      this.#previewChances();
    });

    // the write lands on change (slider release / blur), so a drag is never interrupted
    panel.addEventListener("change", (event) => {
      const input = event.target.closest("[data-face]");
      if (!input) return;
      this.#syncRow(input);
      this.#setWeight(Number(input.dataset.face), Number(input.value));
    });
  }

  /**
   * A part re-render replaces the rail, so the thumb would appear already moved. Paint it at the
   * index it had, then hand it the new one on the next frame and let CSS slide it.
   */
  #animateDieThumb(index) {
    const rail = this.element.querySelector(".pe-die-rail");
    if (!rail || index === undefined) return;
    if (this.#lastDieIndex !== null && this.#lastDieIndex !== index) {
      rail.style.setProperty("--pe-seg-index", this.#lastDieIndex);
      requestAnimationFrame(() => rail.style.setProperty("--pe-seg-index", index));
    }
    this.#lastDieIndex = index;
  }

  /** Keep the slider and the number box of one face in step. */
  #syncRow(source) {
    const row = source.closest(".pe-face-row");
    if (!row) return;
    for (const field of row.querySelectorAll("[data-face]")) {
      if (field !== source) field.value = source.value;
    }
    row.classList.toggle("pe-muted", Number(source.value) === 0);
    row.classList.toggle("pe-boosted", Number(source.value) > 1);
  }

  /** Recompute the displayed percentages and slider fills from what is currently in the inputs. */
  #previewChances() {
    const rows = [...this.element.querySelectorAll(".pe-face-row")];
    const sliders = rows.map((row) => row.querySelector("input[type=range][data-face]"));
    const weights = sliders.map((slider) => Number(slider?.value ?? 1));
    const total = weights.reduce((sum, w) => sum + w, 0);
    rows.forEach((row, i) => {
      const label = row.querySelector(".pe-chance");
      if (label) label.textContent = total > 0 ? `${((weights[i] / total) * 100).toFixed(1)}%` : "0.0%";
      sliders[i]?.style.setProperty("--pe-fill", `${Math.min(100, (weights[i] / WEIGHT_MAX) * 100).toFixed(1)}%`);
    });
  }

  /* -------------------------------------------- */
  /*  Writes                                      */
  /* -------------------------------------------- */

  static #mutateSubject(subjectId, mutator) {
    return updateTable((table) => {
      const entry = readCharacter(table, subjectId);
      table[subjectId] = mutator(foundry.utils.deepClone(entry)) ?? entry;
      return table;
    });
  }

  #mutate(mutator) {
    return PureEvilApp.#mutateSubject(this.#subjectId, mutator);
  }

  #setWeight(face, weight) {
    if (!Number.isFinite(face) || !Number.isFinite(weight)) return;
    const key = this.#dieKey;
    return this.#mutate((entry) => {
      const map = { ...(entry.weights[key] ?? {}) };
      if (weight === 1) delete map[face];
      else map[face] = Math.max(0, weight);
      if (Object.keys(map).length) entry.weights[key] = map;
      else delete entry.weights[key];
      return entry;
    });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSelectSubject(event, target) {
    this.#subjectId = target.dataset.subjectId;
    this.render();
  }

  // the row underneath also carries data-action; AppV2 dispatches to the closest one, so the
  // toggle wins on its own without any stopPropagation
  static #onToggleSubject(event, target) {
    PureEvilApp.#mutateSubject(target.dataset.subjectId, (entry) => ({ ...entry, enabled: !entry.enabled }));
  }

  static #onSwitchTab(event, target) {
    this.#tab = TABS.includes(target.dataset.tabId) ? target.dataset.tabId : TABS[0];
    this.render({ parts: ["panel"] });
  }

  static #onSelectDie(event, target) {
    this.#dieKey = target.dataset.dieKey;
    this.render({ parts: ["panel"] });
  }

  static async #onAddDie() {
    const faces = await DialogV2.prompt({
      window: { title: L("Dice.AddTitle") },
      content: `<p>${L("Dice.AddHint")}</p><input type="number" name="faces" min="2" max="1000" value="30" autofocus>`,
      ok: {
        label: L("Dice.Add"),
        callback: (event, button) => Number(button.form.elements.faces.value),
      },
      rejectClose: false,
    });
    if (!Number.isInteger(faces) || faces < 2 || faces > 1000) return;
    await registerDie(
      `d${faces}`,
      "d",
      faces,
      Array.from({ length: faces }, (_, i) => i + 1),
    );
    this.#dieKey = `d${faces}`;
    this.render();
  }

  static #onResetWeights() {
    const key = this.#dieKey;
    this.#mutate((entry) => {
      delete entry.weights[key];
      return entry;
    });
  }

  static #onAddForce() {
    const composer = this.element.querySelector(".pe-force-composer");
    const value = Number(composer?.querySelector("[name=forceValue]")?.value);
    const times = Math.max(1, Math.min(99, Number(composer?.querySelector("[name=forceTimes]")?.value) || 1));
    if (!Number.isFinite(value)) return;
    const dieKey = this.#dieKey;
    this.#mutate((entry) => {
      entry.forces = [...entry.forces, { id: foundry.utils.randomID(), dieKey, value, remaining: times }];
      return entry;
    });
    ui.notifications.info(LF("Notify.ForceQueued", { value, die: this.#labelForKey(dieKey), times }));
  }

  static #onDeleteForce(event, target) {
    const id = target.dataset.forceId;
    this.#mutate((entry) => {
      entry.forces = entry.forces.filter((force) => force.id !== id);
      return entry;
    });
  }

  static async #onToggleMaster() {
    const current = game.settings.get(MODULE_ID, SETTINGS.ENABLED) === true;
    await game.settings.set(MODULE_ID, SETTINGS.ENABLED, !current);
  }
}
