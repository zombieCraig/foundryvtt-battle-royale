import { INJURY_TABLE } from "./data/tables.js";
import { hasLoverBonus } from "./lovers.js";
import { carriedItem, itemMod } from "./items.js";
import { debuffMod } from "./debuffs.js";

/** Total injury penalty this player suffers on the given action's rolls. */
export function injuryMod(actor, actionId) {
  const rows = new Map(INJURY_TABLE.map((row) => [row.name, row]));
  return (actor?.system.injuries ?? []).reduce(
    (sum, name) => sum + (rows.get(name)?.affects[actionId] ?? 0),
    0,
  );
}

/** "1d6 − 2" style formula — avoids Foundry's ugly "1d6 + -2" rendering. */
export const d6Plus = (mod) => (mod ? `1d6 ${mod < 0 ? "-" : "+"} ${Math.abs(mod)}` : "1d6");

/** One combatant's line on the combat card. */
export function combatantLine(actor, roll, parts) {
  return `<p class="br-combatant"><strong>${actor.name}</strong>: ${roll.total}
    <span class="br-mods">(${parts.join(", ")})</span></p>`;
}

/**
 * Modifier breakdown for one side of an opposed or success roll. `acting`
 * adds the one-shot morale +1 (only the player's own action roll gets it) —
 * the caller spends it with spendMorale() after evaluating.
 */
export function rollMods(actor, actionId, { acting = false } = {}) {
  const parts = [];
  if (hasLoverBonus(actor))
    parts.push({ mod: 1, label: game.i18n.localize("BR.Actions.ModLover") });
  const injury = injuryMod(actor, actionId);
  if (injury)
    parts.push({ mod: injury, label: game.i18n.format("BR.Actions.ModInjury", { n: injury }) });
  const debuff = debuffMod(actor, actionId);
  if (debuff)
    parts.push({ mod: debuff, label: game.i18n.format("BR.Actions.ModDebuff", { n: debuff }) });
  const item = itemMod(actor, actionId);
  if (item) {
    parts.push({
      mod: item,
      label: game.i18n.format("BR.Actions.ModItem", { item: carriedItem(actor).name, n: item }),
    });
  }
  if (acting && actor.system.morale)
    parts.push({ mod: 1, label: game.i18n.localize("BR.Actions.ModMorale") });
  return {
    mod: parts.reduce((sum, p) => sum + p.mod, 0),
    parts: parts.length ? parts.map((p) => p.label) : [game.i18n.localize("BR.Actions.ModNone")],
  };
}

/** Clear the one-shot morale bonus once it has modified a roll (win or lose). */
export async function spendMorale(actor) {
  if (actor?.system.morale) await actor.update({ "system.morale": false });
}
