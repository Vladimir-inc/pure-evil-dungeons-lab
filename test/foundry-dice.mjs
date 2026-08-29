import { deepClone } from "@common/utils/_module.mjs";

export class Roll {}

export class DiceTerm {
  static DENOMINATION = "";

  constructor({ number = 1, faces, modifiers = [], options = {} } = {}) {
    this.number = number;
    this.faces = faces;
    this.modifiers = deepClone(modifiers);
    this.options = deepClone(options);
    this.results = [];
  }

  get denomination() {
    return this.constructor.DENOMINATION;
  }

  get total() {
    return this.results.filter((result) => result.active !== false).reduce((sum, result) => sum + result.result, 0);
  }

  async evaluate(options = {}) {
    for (let i = 0; i < Math.abs(this.number); i++) await this.roll(options);
    for (const modifier of this.modifiers) {
      if (/^kh\d*$/i.test(modifier)) this.keepHighest(Number.parseInt(modifier.slice(2), 10) || 1);
      else if (/^kl\d*$/i.test(modifier)) this.keepLowest(Number.parseInt(modifier.slice(2), 10) || 1);
    }
    return this;
  }

  async roll({ minimize = false, maximize = false, ...options } = {}) {
    let result;
    if (minimize) result = this.mapRandomFace(1 - Number.EPSILON);
    else if (maximize) result = this.mapRandomFace(0);
    else result = await this._roll(options);
    if (result === undefined) result = this.randomFace();
    const roll = { result, active: true };
    this.results.push(roll);
    return roll;
  }

  async _roll(options = {}) {
    const configuration = game.settings.get("core", "diceConfiguration") ?? {};
    const method = configuration[this.denomination] ?? configuration.default ?? CONFIG.Dice.fulfillment.defaultMethod;
    return CONFIG.Dice.fulfillment.methods[method]?.handler?.(this, options);
  }

  randomFace() {
    return this.mapRandomFace(CONFIG.Dice.randomUniform());
  }

  keepHighest(count) {
    const kept = [...this.results].sort((a, b) => b.result - a.result).slice(0, count);
    for (const result of this.results) result.active = kept.includes(result);
  }

  keepLowest(count) {
    const kept = [...this.results].sort((a, b) => a.result - b.result).slice(0, count);
    for (const result of this.results) result.active = kept.includes(result);
  }
}

export class Die extends DiceTerm {
  static DENOMINATION = "d";

  get denomination() {
    return `d${this.faces}`;
  }

  mapRandomFace(randomUniform) {
    return Math.ceil((1 - randomUniform) * this.faces);
  }
}

export class Coin extends DiceTerm {
  static DENOMINATION = "c";

  constructor(termData = {}) {
    super({ ...termData, faces: 2 });
  }

  mapRandomFace(randomUniform) {
    return Math.round(randomUniform);
  }
}

export class FateDie extends DiceTerm {
  static DENOMINATION = "f";

  constructor(termData = {}) {
    super({ ...termData, faces: 3 });
  }

  mapRandomFace(randomUniform) {
    return Math.ceil(randomUniform * this.faces - 2);
  }
}
