import { SYSTEM_ID } from "./cards.js";
import { ACTIONS } from "./data/actions.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** Minimal stat editor for a Battle Royale item. */
export class ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "item-sheet"],
    position: { width: 320, height: "auto" },
    window: { resizable: false },
    form: { submitOnChange: true },
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/item-sheet.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      item: this.document,
      system: this.document.system,
      mods: Object.entries(this.document.system.mods).map(([id, value]) => ({
        id,
        value,
        label: game.i18n.localize(`BR.Actions.${ACTIONS[id].key}.Name`),
      })),
      isGM: game.user.isGM,
    };
  }
}
