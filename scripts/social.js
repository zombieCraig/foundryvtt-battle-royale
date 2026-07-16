import { SYSTEM_ID } from "./cards.js";
import { getRound, escalation } from "./rounds.js";
import { rollMods, spendMorale, d6Plus, combatantLine, injuryMod } from "./rolls.js";
import { debuffMod } from "./debuffs.js";
import { areTeammates, groupSize, nextTeamNumber } from "./teams.js";
import { hasLoverBonus, loverOf } from "./lovers.js";
import { cardHeader } from "./actions.js";
import { onSearchRoll } from "./search.js";

/** Living, visible, non-self players sharing this player's square. */
function visibleOthersAt(actor) {
  const location = actor.system.location;
  if (!location) return [];
  return game.actors.filter(
    (p) =>
      p.type === "player" &&
      p.id !== actor.id &&
      !p.system.dead &&
      !p.system.hidden &&
      p.system.location === location,
  );
}

/** Convince targets (book p.12): visible others who aren't already allies. */
export function convinceTargets(actor) {
  return visibleOthersAt(actor).filter((p) => !areTeammates(actor, p));
}

/** Prefer the actor's found living lover among candidates, else pick at random. */
function pickTarget(actor, candidates) {
  const lover = loverOf(actor);
  if (lover && actor.system.loverFound && candidates.includes(lover)) return lover;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const socialFlags = (actor, actionId) => ({
  [SYSTEM_ID]: { card: "action", actorId: actor.id, actionId },
});

/**
 * Resolve a Convince (book p.12): opposed roll against a random valid target
 * — the convincer must roll strictly higher; a tie fails. Success merges the
 * pair onto the larger side's team (tie → convincer's side); two loners form
 * a fresh numbered team. No valid targets left → resolve as a Search instead.
 */
export async function onConvinceRoll(actor) {
  const targets = convinceTargets(actor);
  if (!targets.length) {
    await ChatMessage.create({
      speaker: { alias: actor.name },
      content: `
        <div class="battle-royale success-card">
          ${cardHeader(actor)}
          <p>🗣 ${game.i18n.format("BR.Actions.ConvinceNoTarget", { name: actor.name })}</p>
        </div>`,
    });
    return onSearchRoll(actor);
  }

  const target = pickTarget(actor, targets);
  const con = rollMods(actor, "convince", { acting: true });
  const res = rollMods(target, "convince");
  const conRoll = await new Roll(d6Plus(con.mod)).evaluate();
  const resRoll = await new Roll(d6Plus(res.mod)).evaluate();
  await spendMorale(actor);
  const won = conRoll.total > resRoll.total;

  let outcome;
  if (!won) {
    outcome = `<p class="failure">🙅 ${game.i18n.format("BR.Actions.ConvinceFail", {
      target: target.name,
    })}</p>`;
  } else {
    // Book p.8: the smaller side's player joins the larger side's team; a tie
    // goes to the convincer. Two loners get the next free team number.
    const convincerSide = groupSize(actor) >= groupSize(target);
    const winner = convincerSide ? actor : target;
    const joiner = convincerSide ? target : actor;
    const winTeam = winner.system.team?.trim();
    const oldTeam = joiner.system.team?.trim();
    let teamLine;
    if (winTeam) {
      await joiner.update({ "system.team": winTeam });
      teamLine = oldTeam
        ? game.i18n.format("BR.Actions.ConvinceLeaves", {
            name: joiner.name,
            old: oldTeam,
            team: winTeam,
          })
        : game.i18n.format("BR.Actions.ConvinceJoins", { name: joiner.name, team: winTeam });
    } else {
      const team = nextTeamNumber();
      await winner.update({ "system.team": team });
      await joiner.update({ "system.team": team });
      teamLine = game.i18n.format("BR.Actions.ConvinceNewTeam", {
        a: winner.name,
        b: joiner.name,
        team,
      });
    }
    outcome = `<p class="success">🤝 ${game.i18n.format("BR.Actions.ConvinceWin", {
      convincer: actor.name,
      target: target.name,
    })}</p>
      <p class="br-action-note">👥 ${teamLine}</p>`;
  }

  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [conRoll, resRoll],
    flavor: game.i18n.localize("BR.Actions.Convince.Name"),
    flags: socialFlags(actor, "convince"),
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(actor)}
        <p>🗣 ${game.i18n.format("BR.Actions.ConvinceVs", {
          convincer: actor.name,
          target: target.name,
        })}</p>
        ${combatantLine(actor, conRoll, con.parts)}
        ${combatantLine(target, resRoll, res.parts)}
        ${outcome}
      </div>`,
  });
}

/**
 * Resolve a Comfort by the book's priority (p.9): an injured visible player
 * in the square (opposed roll, comforter strictly higher heals one injury) →
 * else the comforter's own injury (success roll) → else morale talk (success
 * roll grants +1 to someone's next action). Hidden players are invisible to
 * the first and last tiers.
 */
export async function onComfortRoll(actor) {
  const others = visibleOthersAt(actor);
  const injured = others.filter((p) => p.system.injuries.length);

  if (injured.length) {
    const target = pickTarget(actor, injured);
    const give = rollMods(actor, "comfort", { acting: true });
    // The target's roll is receptiveness, not skill — their own First Aid Kit
    // must not make them harder to comfort, so no item mods on this side.
    const resParts = [];
    if (hasLoverBonus(target))
      resParts.push({ mod: 1, label: game.i18n.localize("BR.Actions.ModLover") });
    const resInjury = injuryMod(target, "comfort");
    if (resInjury)
      resParts.push({
        mod: resInjury,
        label: game.i18n.format("BR.Actions.ModInjury", { n: resInjury }),
      });
    const resDebuff = debuffMod(target, "comfort");
    if (resDebuff)
      resParts.push({
        mod: resDebuff,
        label: game.i18n.format("BR.Actions.ModDebuff", { n: resDebuff }),
      });
    const res = {
      mod: resParts.reduce((sum, p) => sum + p.mod, 0),
      parts: resParts.length
        ? resParts.map((p) => p.label)
        : [game.i18n.localize("BR.Actions.ModNone")],
    };
    const giveRoll = await new Roll(d6Plus(give.mod)).evaluate();
    const resRoll = await new Roll(d6Plus(res.mod)).evaluate();
    await spendMorale(actor);
    const won = giveRoll.total > resRoll.total;
    const injury = target.system.injuries[0];
    if (won) await target.update({ "system.injuries": target.system.injuries.slice(1) });
    const outcome = won
      ? `<p class="success">💗 ${game.i18n.format("BR.Actions.ComfortHeal", {
          comforter: actor.name,
          target: target.name,
          injury,
        })}</p>`
      : `<p class="failure">💔 ${game.i18n.format("BR.Actions.ComfortFail", {
          target: target.name,
        })}</p>`;
    await ChatMessage.create({
      speaker: { alias: actor.name },
      rolls: [giveRoll, resRoll],
      flavor: game.i18n.localize("BR.Actions.Comfort.Name"),
      flags: socialFlags(actor, "comfort"),
      content: `
        <div class="battle-royale combat-card">
          ${cardHeader(actor)}
          <p>💗 ${game.i18n.format("BR.Actions.ComfortVs", {
            comforter: actor.name,
            target: target.name,
          })}</p>
          ${combatantLine(actor, giveRoll, give.parts)}
          ${combatantLine(target, resRoll, res.parts)}
          ${outcome}
        </div>`,
    });
    return;
  }

  // Tiers 2 and 3 share the standard success roll against the escalation
  // threshold (book: "a standard success roll of 4 or more").
  const { success } = escalation(getRound());
  const { mod, parts } = rollMods(actor, "comfort", { acting: true });
  const roll = await new Roll(d6Plus(mod)).evaluate();
  await spendMorale(actor);
  const won = roll.total >= success;

  let text;
  if (actor.system.injuries.length) {
    const injury = actor.system.injuries[0];
    if (won) await actor.update({ "system.injuries": actor.system.injuries.slice(1) });
    text = won
      ? `<p class="success">💗 ${game.i18n.format("BR.Actions.ComfortSelfHeal", {
          name: actor.name,
          injury,
          total: roll.total,
          n: success,
        })}</p>`
      : `<p class="failure">💔 ${game.i18n.format("BR.Actions.ComfortSelfFail", {
          name: actor.name,
          total: roll.total,
          n: success,
        })}</p>`;
  } else {
    // Morale talk: lift a companion's spirits, or steel yourself when alone.
    const grantee = others.length ? pickTarget(actor, others) : actor;
    if (won) await grantee.update({ "system.morale": true });
    text = won
      ? `<p class="success">⬆ ${game.i18n.format(
          grantee === actor ? "BR.Actions.ComfortMoraleSelf" : "BR.Actions.ComfortMorale",
          { name: actor.name, target: grantee.name, total: roll.total, n: success },
        )}</p>`
      : `<p class="failure">💬 ${game.i18n.format("BR.Actions.ComfortMoraleFail", {
          name: actor.name,
          total: roll.total,
          n: success,
        })}</p>`;
  }

  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.Comfort.Name"),
    flags: socialFlags(actor, "comfort"),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        ${text}
        <p class="br-action-note">${parts.join(", ")}</p>
      </div>`,
  });
}
