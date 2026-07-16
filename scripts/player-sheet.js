import { SYSTEM_ID, cardIcon } from "./cards.js";
import { PERSONALITIES } from "./data/tables.js";
import { rollAction } from "./actions.js";
import { loverOf, loverState } from "./lovers.js";
import { injuryAffectsText } from "./attack.js";
import { INJURY_TABLE, injuryFor } from "./data/tables.js";
import { carriedItem, itemAffectsText } from "./items.js";

/** One-line lover status for the player-facing read-only sheet view. */
function loverStatusText(actor) {
  const { lover, found, dead } = loverState(actor);
  if (!lover) return game.i18n.localize("BR.Actions.LoverStatusNone");
  if (dead) return game.i18n.format("BR.Actions.LoverStatusDead", { lover: lover.name });
  if (found) return game.i18n.format("BR.Actions.LoverStatusFound", { lover: lover.name });
  return game.i18n.format("BR.Actions.LoverStatusSearching", { lover: lover.name });
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Minimal card-picker sheet for a Battle Royale player. */
export class PlayerSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "player-sheet"],
    position: { width: 360, height: "auto" },
    window: { resizable: false },
    form: { submitOnChange: true },
    actions: {
      rollAction: PlayerSheet.#onRollAction,
      removeInjury: PlayerSheet.#onRemoveInjury,
      removeDebuff: PlayerSheet.#onRemoveDebuff,
      removeItem: PlayerSheet.#onRemoveItem,
      editImage: PlayerSheet.#onEditImage,
    },
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/player-sheet.hbs` },
  };

  static #onRollAction() {
    rollAction(this.document);
  }

  /** Portrait art (sheet display) is independent of the token/card icon. */
  static #onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: (path) => this.document.update({ [attr]: path }),
    });
    picker.browse();
  }

  /** Discard the carried item (lost — the book has no dropping-for-later). */
  static #onRemoveItem() {
    const item = carriedItem(this.document);
    if (item) this.document.deleteEmbeddedDocuments("Item", [item.id]);
  }

  /** Comfort heals an injury — the GM clicks it off the list. */
  static #onRemoveInjury(event, target) {
    const injuries = this.document.system.injuries.filter(
      (_, i) => i !== Number(target.dataset.index),
    );
    this.document.update({ "system.injuries": injuries });
  }

  /** Debuffs expire on their own; this is the Overseer's early-mercy button. */
  static #onRemoveDebuff(event, target) {
    const debuffs = this.document.system.debuffs.filter(
      (_, i) => i !== Number(target.dataset.index),
    );
    this.document.update({ "system.debuffs": debuffs });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // A misspelled personality would silently disable action rolls, so the
    // sheet offers a picker; an unknown stored value is kept as an option.
    const personality = this.document.system.personality;
    const personalities = Object.fromEntries(
      [
        ...(personality && !PERSONALITIES.includes(personality) ? [personality] : []),
        ...PERSONALITIES,
      ].map((p) => [p, p]),
    );
    const lovers = Object.fromEntries(
      game.actors
        .filter((a) => a.type === "player" && a.id !== this.document.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => [a.id, a.name]),
    );
    return {
      ...context,
      actor: this.document,
      system: this.document.system,
      cardName: this.document.system.cardName,
      cardImg: cardIcon(this.document.system.suit, this.document.system.rank),
      personalities,
      lovers,
      loverDead: !!loverOf(this.document)?.system.dead,
      loverStatusText: loverStatusText(this.document),
      item: (() => {
        const item = carriedItem(this.document);
        return item
          ? { name: item.name, img: item.img, affects: itemAffectsText(item.system) }
          : null;
      })(),
      injuries: this.document.system.injuries.map((name) => {
        const row = INJURY_TABLE.find((r) => r.name === name) ?? injuryFor(0);
        return { name, affects: injuryAffectsText(row) };
      }),
      debuffs: this.document.system.debuffs.map((d) => ({
        name: d.name,
        affects: injuryAffectsText(d),
        rounds: d.rounds,
        stuck: d.stuck,
      })),
      isGM: game.user.isGM,
    };
  }
}
