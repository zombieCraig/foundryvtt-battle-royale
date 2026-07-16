/**
 * Timed hazard debuffs (book p.22): failed environmental-hazard saves apply
 * stat penalties. Each entry mirrors the Injury Table's `affects` shape and
 * carries a round countdown — decremented on every round advance, removed at
 * zero. `stuck: true` marks a trap victim whose Move action is blocked.
 */

/** Total debuff penalty this player suffers on the given action's rolls. */
export function debuffMod(actor, actionId) {
  return (actor?.system.debuffs ?? []).reduce((sum, d) => sum + (d.affects?.[actionId] ?? 0), 0);
}

/** Is the player held by a trap (Move action blocked)? */
export const isStuck = (actor) => (actor?.system.debuffs ?? []).some((d) => d.stuck);

/** The trap debuff holding the player (name/rounds for messages). */
export const stuckDebuff = (actor) => (actor?.system.debuffs ?? []).find((d) => d.stuck);

/**
 * Apply (or refresh) a debuff. A same-name entry is replaced rather than
 * stacked — re-failing the same hazard resets its countdown; different
 * hazards stack additively via debuffMod.
 */
export async function applyDebuff(actor, { name, affects, rounds, stuck = false }) {
  const debuffs = foundry.utils.deepClone(actor.system.debuffs).filter((d) => d.name !== name);
  debuffs.push({ name, affects, rounds, stuck });
  await actor.update({ "system.debuffs": debuffs });
}

/**
 * Round-advance countdown: decrement every living player's debuffs, drop the
 * expired ones, and push one recovery line per player into the round card.
 */
export async function expireDebuffs(lines) {
  for (const p of game.actors.filter((a) => a.type === "player" && !a.system.dead)) {
    if (!p.system.debuffs.length) continue;
    const kept = [];
    const expired = [];
    for (const d of foundry.utils.deepClone(p.system.debuffs)) {
      d.rounds -= 1;
      (d.rounds > 0 ? kept : expired).push(d);
    }
    await p.update({ "system.debuffs": kept });
    if (!expired.length) continue;
    lines.push(
      `<p class="br-action-note">💪 ${game.i18n.format("BR.Rounds.DebuffExpired", {
        name: p.name,
        debuffs: expired.map((d) => d.name).join(", "),
      })}</p>`,
    );
  }
}
