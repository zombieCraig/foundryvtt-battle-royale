import { SYSTEM_ID } from "./cards.js";
import { PERSONALITIES } from "./data/tables.js";
import {
  ACTIONS,
  PERSONALITY_COLUMNS,
  PERSONALITY_DICE,
  PERSONALITY_COLORS,
  actionIcon,
} from "./data/actions.js";

const colorsetId = (personality) =>
  `br-${personality
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

/**
 * Register one custom d6 per personality (e.g. Roll("1da") for Thinking).
 * Each face resolves to that personality's action column slot, and the chat
 * roll breakdown shows the action icon instead of a number — Dice So Nice is
 * optional. Must run at init, before anything can parse a roll formula.
 */
export function registerActionDice() {
  for (const personality of PERSONALITIES) {
    const letter = PERSONALITY_DICE[personality];
    const column = PERSONALITY_COLUMNS[personality];
    const cls = class extends foundry.dice.terms.DiceTerm {
      static DENOMINATION = letter;

      constructor(termData = {}) {
        super({ ...termData, faces: 6 });
      }

      /** @override */
      getResultLabel(result) {
        const action = ACTIONS[column[result.result - 1]];
        const name = game.i18n.localize(`BR.Actions.${action.key}.Name`);
        return `<img class="br-action-face" src="${actionIcon(column[result.result - 1])}" alt="${name}" data-tooltip="${name}">`;
      }
    };
    // Factory classes share a constructor name otherwise, and core derives the
    // result CSS class from it.
    Object.defineProperty(cls, "name", { value: `BRActionDie${letter.toUpperCase()}` });
    CONFIG.Dice.terms[letter] = cls;
  }
}

/**
 * Dice So Nice integration: one "Battle Royale" dice system whose 20 dice show
 * each personality's action icons on the faces, tinted with that personality's
 * color. Self-guarding — the hook never fires if the module is absent.
 */
export function registerActionDiceDSN() {
  Hooks.once("diceSoNiceReady", async (dice3d) => {
    dice3d.addSystem({ id: SYSTEM_ID, name: "Battle Royale" }, "preferred");
    for (const personality of PERSONALITIES) {
      const colors = PERSONALITY_COLORS[personality];
      await dice3d.addColorset(
        {
          name: colorsetId(personality),
          description: `Battle Royale — ${personality}`,
          category: "Battle Royale",
          background: colors.background,
          foreground: colors.foreground,
          edge: colors.background,
          outline: "none",
          material: "plastic",
        },
        "default",
      );
      dice3d.addDicePreset(
        {
          type: `d${PERSONALITY_DICE[personality]}`,
          labels: PERSONALITY_COLUMNS[personality].map((id) => actionIcon(id)),
          system: SYSTEM_ID,
          colorset: colorsetId(personality),
          // Icons render at glyph size; >1.2 starts spilling over the face edge.
          labelScale: 1,
        },
        "d6",
      );
    }
  });
}
