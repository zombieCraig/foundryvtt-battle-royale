import { SYSTEM_ID } from "./cards.js";
import { HAZARDS } from "./data/events.js";
import { applyDebuff } from "./debuffs.js";

/**
 * Armed trap hazards (book p.22): "Some events work like a trap and they will
 * continue to have an effect each round until everyone in that area has
 * passed their success roll." State lives in the `armedTraps` world setting —
 * `{ [cellLabel]: { index, passed: [actorIds] } }` — so it survives combat
 * deletion and multi-session games.
 */

export const getArmedTraps = () => game.settings.get(SYSTEM_ID, "armedTraps");

/** Arm (or re-arm) a trap in a cell, remembering who already passed. */
export async function armTrap(cell, index, passedIds) {
  const traps = foundry.utils.deepClone(getArmedTraps());
  traps[cell] = { index, passed: passedIds };
  await game.settings.set(SYSTEM_ID, "armedTraps", traps);
}

/** Fresh game: no leftover armed traps. */
export const clearTraps = () => game.settings.set(SYSTEM_ID, "armedTraps", {});

/** Living players standing in the cell. */
const playersAt = (cell) =>
  game.actors.filter((p) => p.type === "player" && !p.system.dead && p.system.location === cell);

/**
 * Round-start sweep: everyone in an armed cell who hasn't passed the save yet
 * (newcomers included) re-rolls it; failures are stuck again for the full
 * escape countdown. The trap disarms once every living occupant has passed —
 * or silently, when nobody living is left in the cell.
 */
export async function sweepTraps() {
  const traps = foundry.utils.deepClone(getArmedTraps());
  let changed = false;
  for (const [cell, state] of Object.entries(traps)) {
    const hazard = HAZARDS[state.index];
    const occupants = playersAt(cell);
    if (!occupants.length) {
      delete traps[cell];
      changed = true;
      continue;
    }
    const pending = occupants.filter((p) => !state.passed.includes(p.id));
    const rolls = [];
    const lines = [
      `<p>☠ ${game.i18n.format("BR.Rounds.TrapSweep", {
        hazard: hazard.name,
        cell,
        n: hazard.threshold,
        save: hazard.save,
      })}</p>`,
    ];
    for (const p of pending) {
      const save = await new Roll("1d6").evaluate();
      rolls.push(save);
      const args = { name: p.name, total: save.total, n: hazard.threshold };
      if (save.total >= hazard.threshold) {
        state.passed.push(p.id);
        lines.push(
          `<p class="success">${game.i18n.format("BR.Actions.EventHazardSafe", args)}</p>`,
        );
      } else {
        await applyDebuff(p, {
          name: hazard.name,
          affects: hazard.fail.debuff.affects,
          rounds: hazard.trap.escapeRounds,
          stuck: true,
        });
        lines.push(
          `<p class="failure">${game.i18n.format("BR.Actions.EventHazardFail", args)}</p>
          <p class="br-action-note">🕸 ${game.i18n.format("BR.Actions.EventHazardStuckNote", {
            name: p.name,
            hazard: hazard.name,
            rounds: hazard.trap.escapeRounds,
          })}</p>`,
        );
      }
    }
    if (occupants.every((p) => state.passed.includes(p.id))) {
      delete traps[cell];
      lines.push(
        `<p class="success">${game.i18n.format("BR.Rounds.TrapDisarmed", {
          hazard: hazard.name,
          cell,
        })}</p>`,
      );
    }
    changed = true;
    await ChatMessage.create({
      speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
      rolls,
      content: `
        <div class="battle-royale success-card">
          ${lines.join("\n")}
        </div>`,
    });
  }
  if (changed) await game.settings.set(SYSTEM_ID, "armedTraps", traps);
}
