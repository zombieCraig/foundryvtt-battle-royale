import { SYSTEM_ID } from "./cards.js";
import { getRound, escalation } from "./rounds.js";
import { ACTIONS } from "./data/actions.js";
import { injuryFor } from "./data/tables.js";
import { hasLoverBonus } from "./lovers.js";
import { cardHeader } from "./actions.js";
import { carriedItem, offerLoot } from "./items.js";
import { injuryMod, d6Plus, combatantLine, spendMorale } from "./rolls.js";
import { debuffMod } from "./debuffs.js";
import { areTeammates } from "./teams.js";
import { checkEndgame } from "./endgame.js";

/** Human line for an injury's penalties, e.g. "Attack −1, Move −2". */
export function injuryAffectsText(injury) {
  const parts = Object.entries(injury.affects).map(
    (entry) => `${game.i18n.localize(`BR.Actions.${ACTIONS[entry[0]].key}.Name`)} ${entry[1]}`,
  );
  return parts.length ? parts.join(", ") : game.i18n.localize("BR.Actions.InjuryNoAffect");
}

/**
 * Book attack targeting (p.11): everyone alive in the attacker's square,
 * minus allies — same team or the attacker's found beloved — unless the
 * attacker is Deceitful (doesn't respect the group split) or enraged
 * ("any teams they were part of are ignored"). Hidden players can't be
 * targeted at all (p.10) — only-hidden squares count as empty.
 */
export function attackTargets(attacker) {
  const location = attacker.system.location;
  if (!location) return [];
  const others = game.actors.filter(
    (p) =>
      p.type === "player" &&
      p.id !== attacker.id &&
      !p.system.dead &&
      !p.system.hidden &&
      p.system.location === location,
  );
  if (attacker.system.enraged || attacker.system.personality?.trim() === "Deceitful") return others;
  const team = attacker.system.team?.trim();
  return others.filter(
    (p) =>
      !(team && p.system.team?.trim() === team) &&
      !(attacker.system.lover === p.id && attacker.system.loverFound),
  );
}

/**
 * Combat roll modifiers for one side (book p.18): the carried weapon's Attack
 * bonus — or unarmed −1 without one (any weapon negates the penalty even at
 * +0) — Teammate Assistance +1 per living teammate in the square (max +2,
 * none while enraged — teams are ignored), lover +1, cover +1 when attacking
 * from hiding (p.10), morale +1 when it's this side's own action, injury
 * Attack penalties.
 */
function combatMods(actor, opponent, { cover = false, morale = false } = {}) {
  const item = carriedItem(actor);
  const weaponMod = item?.system.weapon ? item.system.mods.attack : -1;
  const weaponLabel = item?.system.weapon
    ? `${item.name}${weaponMod ? ` ${weaponMod > 0 ? "+" : ""}${weaponMod}` : ""}`
    : game.i18n.localize("BR.Actions.ModUnarmed");
  const parts = [{ mod: weaponMod, label: weaponLabel }];
  if (cover) parts.push({ mod: 1, label: game.i18n.localize("BR.Actions.ModCover") });
  if (!actor.system.enraged) {
    const assist = Math.min(
      2,
      game.actors.filter(
        (p) =>
          p.type === "player" &&
          p.id !== actor.id &&
          p.id !== opponent.id &&
          !p.system.dead &&
          p.system.location === actor.system.location &&
          areTeammates(actor, p),
      ).length,
    );
    if (assist)
      parts.push({ mod: assist, label: game.i18n.format("BR.Actions.ModTeam", { n: assist }) });
  }
  if (hasLoverBonus(actor))
    parts.push({ mod: 1, label: game.i18n.localize("BR.Actions.ModLover") });
  if (morale && actor.system.morale)
    parts.push({ mod: 1, label: game.i18n.localize("BR.Actions.ModMorale") });
  const injury = injuryMod(actor, "attack");
  if (injury)
    parts.push({ mod: injury, label: game.i18n.format("BR.Actions.ModInjury", { n: injury }) });
  const debuff = debuffMod(actor, "attack");
  if (debuff)
    parts.push({ mod: debuff, label: game.i18n.format("BR.Actions.ModDebuff", { n: debuff }) });
  return { mod: parts.reduce((sum, p) => sum + p.mod, 0), parts: parts.map((p) => p.label) };
}

/**
 * Resolve an Attack (book p.18): pick a random valid defender in the square,
 * opposed 1d6 + mods, highest wins, tie hurts no one. The loser's fate hangs
 * on the follow-up Damage Roll button. A Hostility event forces the defender
 * (the player who just moved in) instead of rolling for one.
 */
export async function onAttackRoll(actor, { defender: forced } = {}) {
  // Area Affect (book p.16): the carrier "will use it" whenever anyone else
  // shares the square — the blast replaces the opposed exchange entirely.
  if (carriedItem(actor)?.system.areaAffect) return onAreaAffectRoll(actor);
  let defender = forced ?? null;
  if (!defender) {
    const targets = attackTargets(actor);
    if (!targets.length) {
      await ChatMessage.create({
        speaker: { alias: actor.name },
        content: `
          <div class="battle-royale success-card">
            ${cardHeader(actor)}
            <p>⚔ ${game.i18n.format("BR.Actions.AttackNoTarget", { name: actor.name })}</p>
          </div>`,
      });
      return;
    }
    defender = targets[Math.floor(Math.random() * targets.length)];
  }
  // Multi-Attack (book p.18): a Multi-Target weapon also aims at up to two
  // more valid targets — never allies or the hidden. They only get to dodge,
  // and only if the attacker wins the main exchange.
  const extras = carriedItem(actor)?.system.multiTarget
    ? attackTargets(actor)
        .filter((p) => p.id !== defender.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2)
    : [];
  // Attacking from hiding: +1 from cover, and the hiding spot is spent after
  // the attack whether it lands or not (book p.10).
  const cover = !!actor.system.hidden;
  const atk = combatMods(actor, defender, { cover, morale: true });
  const def = combatMods(defender, actor);
  const atkRoll = await new Roll(d6Plus(atk.mod)).evaluate();
  const defRoll = await new Roll(d6Plus(def.mod)).evaluate();
  await spendMorale(actor);

  const tie = atkRoll.total === defRoll.total;
  const winner = atkRoll.total > defRoll.total ? actor : defender;
  const loser = winner === actor ? defender : actor;
  const result = tie
    ? `<p class="failure">🤝 ${game.i18n.localize("BR.Actions.AttackTie")}</p>`
    : `<p class="success">⚔ ${game.i18n.format("BR.Actions.AttackWin", {
        winner: winner.name,
        w: Math.max(atkRoll.total, defRoll.total),
        l: Math.min(atkRoll.total, defRoll.total),
      })}</p>`;
  const buttons = tie
    ? ""
    : `<div class="br-card-buttons">
        <button type="button" data-br-action="damageRoll">
          <i class="fa-solid fa-skull-crossbones"></i>
          ${game.i18n.format("BR.Actions.DamageRoll", { name: loser.name })}
        </button>
      </div>`;
  // Item riders (Taser, Duct Tape, Multi-Target…) aren't automated — surface
  // them so the Overseer can adjudicate.
  const specials = [actor, defender]
    .map((side) => ({ side, item: carriedItem(side) }))
    .filter(({ item }) => item?.system.special)
    .map(
      ({ side, item }) =>
        `<p class="br-action-note">🎒 ${side.name} — ${item.name}: ${item.system.special}</p>`,
    )
    .join("");
  const spray = extras.length
    ? `<p class="br-action-note">🔫 ${game.i18n.format("BR.Actions.MultiTargetNote", {
        item: carriedItem(actor).name,
        names: extras.map((p) => p.name).join(", "),
      })}</p>`
    : "";

  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [atkRoll, defRoll],
    flavor: game.i18n.localize("BR.Actions.Attack.Name"),
    flags: {
      [SYSTEM_ID]: { card: "action", actorId: loser.id, actionId: "attack", killerId: winner.id },
    },
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(actor)}
        <p>⚔ ${game.i18n.format("BR.Actions.AttackVs", { attacker: actor.name, defender: defender.name })}</p>
        ${combatantLine(actor, atkRoll, atk.parts)}
        ${combatantLine(defender, defRoll, def.parts)}
        ${result}
        ${specials}
        ${spray}
        ${buttons}
      </div>`,
  });
  if (cover) await actor.update({ "system.hidden": false });
  // Spray resolves only when the attacker beats the main target — a defeat
  // stops it (book), and a tie means the target didn't "fail".
  if (!tie && winner === actor) {
    for (const target of extras) await onSprayRoll(actor, target, atkRoll);
  }
  // Thrown weapons (#73/#79 "On failure, item is lost"): the attack didn't
  // land — win or the throw is gone. A tie hurts no one, but the throw is
  // still spent. An "(xN)" in the name is the remaining count: each failure
  // burns one, and the item only disappears with the last.
  const thrown = carriedItem(actor);
  if (thrown?.system.loseOnFailure && (tie || winner !== actor)) {
    const count = Number(/\(x(\d+)\)/i.exec(thrown.name)?.[1] ?? 1);
    const base = thrown.name.replace(/\s*\(x\d+\)/i, "");
    let line;
    if (count > 1) {
      await thrown.update({ name: thrown.name.replace(/\(x\d+\)/i, `(x${count - 1})`) });
      line = game.i18n.format("BR.Actions.ThrownSpent", {
        name: actor.name,
        item: base,
        n: count - 1,
      });
    } else {
      await actor.deleteEmbeddedDocuments("Item", [thrown.id]);
      line = game.i18n.format("BR.Actions.ThrownLost", { name: actor.name, item: base });
    }
    await ChatMessage.create({
      speaker: { alias: actor.name },
      content: `
        <div class="battle-royale success-card">
          <p>🕳 ${line}</p>
        </div>`,
    });
  }
}

/**
 * Area Affect attack (book p.16): the attacker rolls 1d6 as the evade
 * threshold — a 1 is a dud — and everyone else in the square (allies and the
 * hidden included; a blast doesn't discriminate) rolls to match or exceed it.
 * Failures chain the normal Damage Roll with kill credit. Modifier riders
 * (Smoke Grenade et al.) aren't automated: the book limits them to the
 * victim's next turn, surfaced on the card for the Overseer.
 */
async function onAreaAffectRoll(actor) {
  const item = carriedItem(actor);
  const location = actor.system.location;
  const others = location
    ? game.actors.filter(
        (p) =>
          p.type === "player" &&
          p.id !== actor.id &&
          !p.system.dead &&
          p.system.location === location,
      )
    : [];
  if (!others.length) {
    await ChatMessage.create({
      speaker: { alias: actor.name },
      content: `
        <div class="battle-royale success-card">
          ${cardHeader(actor)}
          <p>⚔ ${game.i18n.format("BR.Actions.AttackNoTarget", { name: actor.name })}</p>
        </div>`,
    });
    return;
  }
  const roll = await new Roll("1d6").evaluate();
  const dud = roll.total === 1;
  const result = dud
    ? `<p class="success">💨 ${game.i18n.format("BR.Actions.AreaDud", { item: item.name })}</p>`
    : `<p class="failure">💥 ${game.i18n.format("BR.Actions.AreaThreshold", { n: roll.total })}</p>`;
  const special = item.system.special
    ? `<p class="br-action-note">🎒 ${item.name}: ${item.system.special}</p>
      <p class="br-action-note">${game.i18n.localize("BR.Actions.AreaModifierNote")}</p>`
    : "";
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.AreaFlavor"),
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(actor)}
        <p>💣 ${game.i18n.format("BR.Actions.AreaVs", {
          name: actor.name,
          item: item.name,
          cell: location,
          names: others.map((p) => p.name).join(", "),
        })}</p>
        ${result}
        ${special}
      </div>`,
  });
  // Throwing from hiding spends the spot, same as any attack (book p.10).
  if (actor.system.hidden) await actor.update({ "system.hidden": false });
  if (dud) return;
  for (const target of others) await onEvadeRoll(actor, target, roll.total);
}

/** One victim's 1d6 evade roll against the blast threshold. */
async function onEvadeRoll(attacker, target, threshold) {
  const roll = await new Roll("1d6").evaluate();
  const evaded = roll.total >= threshold;
  const args = { name: target.name, n: roll.total, t: threshold };
  const body = evaded
    ? `<p class="success">🏃 ${game.i18n.format("BR.Actions.AreaEvade", args)}</p>`
    : `<p class="failure">💥 ${game.i18n.format("BR.Actions.AreaHit", args)}</p>
      <div class="br-card-buttons">
        <button type="button" data-br-action="damageRoll">
          <i class="fa-solid fa-skull-crossbones"></i>
          ${game.i18n.format("BR.Actions.DamageRoll", { name: target.name })}
        </button>
      </div>`;
  await ChatMessage.create({
    speaker: { alias: target.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.AreaEvadeFlavor"),
    flags: {
      [SYSTEM_ID]: {
        card: "action",
        actorId: target.id,
        actionId: "attack",
        killerId: attacker.id,
      },
    },
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(target)}
        ${body}
      </div>`,
  });
}

/**
 * Multi-Attack spray (book p.19): an extra target "can only attempt to
 * dodge" — the attacker's main roll stands against their full defensive
 * roll (they just can't harm the attacker), and a tie favors the dodger.
 * A failed dodge hangs on the normal Damage Roll button.
 */
async function onSprayRoll(attacker, target, atkRoll) {
  const def = combatMods(target, attacker);
  const defRoll = await new Roll(d6Plus(def.mod)).evaluate();
  const hit = atkRoll.total > defRoll.total;
  const args = { name: target.name, d: defRoll.total, a: atkRoll.total };
  const body = hit
    ? `<p class="failure">🔫 ${game.i18n.format("BR.Actions.SprayHit", args)}</p>
      <div class="br-card-buttons">
        <button type="button" data-br-action="damageRoll">
          <i class="fa-solid fa-skull-crossbones"></i>
          ${game.i18n.format("BR.Actions.DamageRoll", { name: target.name })}
        </button>
      </div>`
    : `<p class="success">🔫 ${game.i18n.format("BR.Actions.SprayDodge", args)}</p>`;
  await ChatMessage.create({
    speaker: { alias: target.name },
    rolls: [defRoll],
    flavor: game.i18n.localize("BR.Actions.SprayFlavor"),
    flags: {
      [SYSTEM_ID]: {
        card: "action",
        actorId: target.id,
        actionId: "attack",
        killerId: attacker.id,
      },
    },
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(target)}
        ${combatantLine(target, defRoll, def.parts)}
        ${body}
      </div>`,
  });
}

/**
 * Damage Chart (book p.18) for the combat loser: 1d6 + Desperation damage
 * bonus. 4+ = murdered (kill tick to the winner); 1–3 = Injury Table with
 * −2 / 0 / +2.
 */
export async function onDamageRoll(victim, flags) {
  const { damage } = escalation(getRound());
  const roll = await new Roll(d6Plus(damage)).evaluate();
  const killer = game.actors.get(flags.killerId);

  let body;
  if (roll.total >= 4) {
    await victim.update({ "system.dead": true }, { brEndgame: true });
    if (killer) await killer.update({ "system.kills": killer.system.kills + 1 });
    body = `<p class="failure">💀 ${game.i18n.format("BR.Actions.DamageDead", {
      name: victim.name,
      total: roll.total,
    })}</p>`;
  } else {
    const injuryShift = { 1: -2, 2: 0, 3: 2 }[roll.total];
    const die = injuryShift
      ? `1d10 ${injuryShift < 0 ? "−" : "+"} ${Math.abs(injuryShift)}`
      : "1d10";
    body = `<p>🩸 ${game.i18n.format("BR.Actions.DamageInjury", { name: victim.name, total: roll.total })}</p>
      <div class="br-card-buttons">
        <button type="button" data-br-action="injuryRoll">
          <i class="fa-solid fa-user-injured"></i>
          ${game.i18n.format("BR.Actions.InjuryRoll", { die })}
        </button>
      </div>`;
  }

  await ChatMessage.create({
    speaker: { alias: victim.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.DamageFlavor"),
    flags: {
      [SYSTEM_ID]: {
        card: "action",
        actorId: victim.id,
        actionId: "attack",
        killerId: flags.killerId,
        injuryShift: { 1: -2, 2: 0, 3: 2 }[roll.total] ?? 0,
      },
    },
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(victim)}
        ${body}
      </div>`,
  });
  if (roll.total >= 4 && killer) await offerLoot(killer, victim);
  if (roll.total >= 4) await checkEndgame();
}

/**
 * Injury Table (book p.21): 1d10 + the Damage Chart shift. Out-of-range
 * totals hit Flesh Wound (<1) or Dismembered (>10, fatal). The injury lands
 * on the victim's sheet; its penalties apply to future rolls automatically.
 */
export async function onInjuryRoll(victim, flags) {
  const shift = flags.injuryShift ?? 0;
  const roll = await new Roll(
    shift ? `1d10 ${shift < 0 ? "-" : "+"} ${Math.abs(shift)}` : "1d10",
  ).evaluate();
  const injury = injuryFor(roll.total);
  const killer = game.actors.get(flags.killerId);

  let text;
  if (injury.dead) {
    await victim.update({ "system.dead": true }, { brEndgame: true });
    if (killer) await killer.update({ "system.kills": killer.system.kills + 1 });
    text = `<p class="failure">💀 ${game.i18n.format("BR.Actions.InjuryDead", {
      name: victim.name,
      injury: injury.name,
      total: roll.total,
    })}</p>`;
  } else {
    await victim.update({ "system.injuries": [...victim.system.injuries, injury.name] });
    text = `<p>🩹 ${game.i18n.format("BR.Actions.InjuryResult", {
      name: victim.name,
      injury: injury.name,
      affects: injuryAffectsText(injury),
      total: roll.total,
    })}</p>`;
  }

  await ChatMessage.create({
    speaker: { alias: victim.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.InjuryFlavor"),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(victim)}
        ${text}
      </div>`,
  });
  if (injury.dead && killer) await offerLoot(killer, victim);
  if (injury.dead) await checkEndgame();
}
