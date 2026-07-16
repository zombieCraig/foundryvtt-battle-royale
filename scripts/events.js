import { STRUCTURES, HAZARDS, d66Index } from "./data/events.js";
import { parseCell } from "./movement.js";
import { areTeammates } from "./teams.js";
import { onAttackRoll, onInjuryRoll, injuryAffectsText } from "./attack.js";
import { carriedItem } from "./items.js";
import { cardHeader } from "./actions.js";
import { applyDebuff } from "./debuffs.js";
import { armTrap } from "./traps.js";

/** Living players (hidden included) sharing the actor's square. */
function othersAt(actor) {
  const location = actor.system.location;
  return game.actors.filter(
    (p) =>
      p.type === "player" && p.id !== actor.id && !p.system.dead && p.system.location === location,
  );
}

/** Roll a d66: 2d6 read as tens-ones (1-1 … 6-6). */
async function rollD66() {
  const roll = await new Roll("2d6").evaluate();
  const [tens, ones] = roll.dice[0].results.map((r) => r.result);
  return { roll, index: d66Index(tens, ones) };
}

function postEventCard(actor, rolls, body) {
  return ChatMessage.create({
    speaker: { alias: actor.name },
    rolls,
    flavor: game.i18n.localize("BR.Actions.EventFlavor"),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        ${body}
      </div>`,
  });
}

/**
 * Hostility (Event Chart 5): a random living non-teammate in the square
 * begins combat with the mover; nobody around means they are safe. A hidden
 * hostile attacks with the cover bonus and unhides — onAttackRoll handles it.
 */
async function resolveHostility(actor, eventRoll) {
  const hostiles = othersAt(actor).filter((p) => !areTeammates(actor, p));
  if (!hostiles.length) {
    return postEventCard(
      actor,
      [eventRoll],
      `<p>🕊 ${game.i18n.format("BR.Actions.EventSafe", { name: actor.name })}</p>`,
    );
  }
  const hostile = hostiles[Math.floor(Math.random() * hostiles.length)];
  await postEventCard(
    actor,
    [eventRoll],
    `<p>😠 ${game.i18n.format("BR.Actions.EventHostility", {
      hostile: hostile.name,
      name: actor.name,
    })}</p>`,
  );
  return onAttackRoll(hostile, { defender: actor });
}

/**
 * Environmental Hazard (Event Chart 6): everyone in the square — mover,
 * teammates, hidden players alike — individually saves 1d6 vs the hazard's
 * threshold. Failures resolve per the table: Injury Table rolls chain their
 * own cards; deaths and item losses land immediately; stat penalties apply
 * as timed debuffs; trap failures are stuck and the cell stays armed.
 */
async function resolveHazard(actor, eventRoll, cell) {
  const { roll: d66, index } = await rollD66();
  const hazard = HAZARDS[index];
  const rolls = [eventRoll, d66];
  const lines = [
    `<p>☠ ${game.i18n.format("BR.Actions.EventHazard", {
      cell,
      hazard: hazard.name,
      n: hazard.threshold,
      save: hazard.save,
    })}</p>`,
  ];
  const failed = [];
  for (const p of [actor, ...othersAt(actor)]) {
    const save = await new Roll("1d6").evaluate();
    rolls.push(save);
    const args = { name: p.name, total: save.total, n: hazard.threshold };
    if (save.total >= hazard.threshold) {
      lines.push(`<p class="success">${game.i18n.format("BR.Actions.EventHazardSafe", args)}</p>`);
    } else {
      lines.push(`<p class="failure">${game.i18n.format("BR.Actions.EventHazardFail", args)}</p>`);
      failed.push(p);
    }
  }
  const { fail } = hazard;
  for (const p of failed) {
    if (fail.death) {
      await p.update({ "system.dead": true });
      lines.push(
        `<p class="failure">💀 ${game.i18n.format("BR.Actions.EventHazardDead", {
          name: p.name,
          hazard: hazard.name,
        })}</p>`,
      );
    }
    if (fail.loseItem) {
      const item = carriedItem(p);
      if (item) {
        await p.deleteEmbeddedDocuments("Item", [item.id]);
        lines.push(
          `<p>🎒 ${game.i18n.format("BR.Actions.ItemDiscarded", { name: p.name, item: item.name })}</p>`,
        );
      }
    }
    if (fail.debuff) {
      const rounds = hazard.trap?.escapeRounds ?? fail.debuff.rounds ?? 2;
      await applyDebuff(p, {
        name: hazard.name,
        affects: fail.debuff.affects,
        rounds,
        stuck: !!hazard.trap,
      });
      lines.push(
        `<p class="br-action-note">⚠ ${game.i18n.format("BR.Actions.EventHazardDebuff", {
          name: p.name,
          affects: injuryAffectsText(fail.debuff),
        })}</p>`,
      );
      if (hazard.trap) {
        lines.push(
          `<p class="br-action-note">🕸 ${game.i18n.format("BR.Actions.EventHazardStuckNote", {
            name: p.name,
            hazard: hazard.name,
            rounds,
          })}</p>`,
        );
      }
    }
    if (fail.note) {
      lines.push(
        `<p class="br-action-note">⚠ ${game.i18n.format("BR.Actions.EventHazardNote", {
          name: p.name,
          note: fail.note,
        })}</p>`,
      );
    }
  }
  if (failed.length && hazard.trap) {
    const passedIds = [actor, ...othersAt(actor)]
      .filter((p) => !failed.includes(p))
      .map((p) => p.id);
    await armTrap(cell, index, passedIds);
    lines.push(
      `<p class="br-action-note">${game.i18n.format("BR.Actions.EventHazardTrapArmed", {
        hazard: hazard.name,
        cell,
      })}</p>`,
    );
  }
  await postEventCard(actor, rolls, lines.join("\n"));
  // Injury rolls after the hazard card so the cause reads before the wounds.
  if (fail.injuryShift !== undefined) {
    for (const p of failed) await onInjuryRoll(p, { injuryShift: fail.injuryShift });
  }
}

/**
 * Event Chart (book p.21), rolled after every landed move: 1-2 uneventful,
 * 3-4 a structure (flavor only), 5 hostility, 6 environmental hazard.
 */
export async function rollEvent(actor) {
  if (!parseCell(actor.system.location)) return;
  const cell = actor.system.location;
  const roll = await new Roll("1d6").evaluate();
  if (roll.total <= 2) {
    return postEventCard(
      actor,
      [roll],
      `<p>🌾 ${game.i18n.format("BR.Actions.EventUneventful", { name: actor.name, cell })}</p>`,
    );
  }
  if (roll.total <= 4) {
    const { roll: d66, index } = await rollD66();
    return postEventCard(
      actor,
      [roll, d66],
      `<p>🏚 ${game.i18n.format("BR.Actions.EventStructure", {
        name: actor.name,
        structure: STRUCTURES[index],
      })}</p>
      <p class="br-action-note">${game.i18n.localize("BR.Actions.EventStructureNote")}</p>`,
    );
  }
  if (roll.total === 5) return resolveHostility(actor, roll);
  return resolveHazard(actor, roll, cell);
}
