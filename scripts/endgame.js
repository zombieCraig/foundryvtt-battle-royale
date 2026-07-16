import { SYSTEM_ID } from "./cards.js";
import {
  getRound,
  getShowdownRound,
  effectiveZoneRound,
  zoneCounts,
  getCenterOrder,
} from "./rounds.js";
import { MAX_ROUND, PERSONALITIES, FINAL_RECKONING } from "./data/tables.js";
import { ACTIONS, PERSONALITY_COLUMNS } from "./data/actions.js";
import { d6Plus, combatantLine, rollMods, spendMorale } from "./rolls.js";
import { carriedItem, itemMod, offerLoot } from "./items.js";
import { loverOf } from "./lovers.js";
import { nextTeamNumber } from "./teams.js";
import { getGameCombat } from "./combat.js";
import { parseCell, isOpen, DIRECTION_DELTAS, moveActorToCell } from "./movement.js";
import { isStuck } from "./debuffs.js";
// Cycles with rounds.js / actions.js / social.js / events.js — safe because
// every cross-reference lives inside a function body (nothing runs at import).
import { cardHeader, postStuckNote } from "./actions.js";
import { convinceTargets, onConvinceRoll } from "./social.js";
import { rollEvent } from "./events.js";

const livingPlayers = () => game.actors.filter((a) => a.type === "player" && !a.system.dead);
const overseer = () => ({ alias: game.i18n.localize("BR.Setup.Overseer") });
const getSetting = (key) => game.settings.get(SYSTEM_ID, key);
const setSetting = (key, value) => game.settings.set(SYSTEM_ID, key, value);
const chebyshev = (a, b) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
const cellLabel = (row, col) => `${String.fromCharCode(65 + row)}${col + 1}`;

/** Has the Overseer's Decree been announced? */
export const isShowdown = () => !!getShowdownRound();

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Deaths land from many sources (combat, hazards, zones, pleas, detonations,
// the sheet's Dead checkbox) — they all pass through this hook. Endgame code
// that kills people passes { brEndgame: true } in the update options and runs
// its own single check afterwards, so a multi-kill burst (zone sweep,
// reckoning tie) can never crown a winner between two updates. Hook-driven
// checks are serialized through one promise chain for the same reason.
let queue = Promise.resolve();
function queueEndgameCheck() {
  queue = queue
    .then(() => checkEndgame())
    .catch((err) => console.error("Battle Royale | endgame check failed", err));
  return queue;
}

export function registerEndgameTriggers() {
  Hooks.on("updateActor", (actor, changes, options) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    if (changes.system?.dead !== true) return;
    // Any death feeds the Impatience counter, whoever caused it.
    if (isShowdown() && !getSetting("deathThisRound")) setSetting("deathThisRound", true);
    if (!options.brEndgame) queueEndgameCheck();
  });
}

/**
 * The endgame state machine: game over at 0–1 living, the Overseer's Decree
 * at 5 or fewer, the Final Reckoning at exactly 2. Every transition is
 * guarded by a world setting, so repeat calls are no-ops.
 */
export async function checkEndgame() {
  if (getSetting("gameOver") || getRound() < 1) return;
  const living = livingPlayers();
  if (living.length <= 1) return endGame(living[0] ?? null);
  if (living.length <= 5 && !isShowdown()) await declareShowdown(living.length);
  if (living.length === 2 && isShowdown() && !getSetting("reckoningRolled")) {
    await triggerFinalReckoning(living);
  }
}

/** Book "Overseer's Decree": 5 or fewer remain — the Showdown begins. */
async function declareShowdown(n) {
  await setSetting("showdownRound", getRound());
  await ChatMessage.create({
    speaker: overseer(),
    content: `
      <div class="battle-royale round-advance">
        <h3>📢 ${game.i18n.localize("BR.Endgame.DecreeTitle")}</h3>
        <p>${game.i18n.format("BR.Endgame.DecreeBody", { n })}</p>
      </div>`,
  });
}

/**
 * Round-advance endgame bookkeeping — called by announceRound after the round
 * card posts (active GM only, both the combat and no-combat paths).
 */
export async function endgameRoundChecks() {
  if (getSetting("gameOver")) return;
  // Overseer's Impatience (book): consecutive deathless rounds after the
  // Decree — 3 draws a warning, 4+ detonates a random necklace each round;
  // any death (detonations included) resets the count. Suspended while a
  // Final Reckoning is pending — a finalist's necklace blowing up would
  // strand the resolve button.
  if (isShowdown() && !getSetting("reckoningRolled")) {
    const deathless = getSetting("deathThisRound") ? 0 : getSetting("deathlessRounds") + 1;
    if (deathless >= 4) {
      const living = livingPlayers();
      const victim = living[Math.floor(Math.random() * living.length)];
      if (victim) await detonateNecklace(victim);
      await setSetting("deathlessRounds", 0);
    } else {
      await setSetting("deathlessRounds", deathless);
      if (deathless === 3) {
        await ChatMessage.create({
          speaker: overseer(),
          content: `
            <div class="battle-royale round-advance">
              <p class="warning">⏳ ${game.i18n.format("BR.Endgame.ImpatienceWarning", {
                n: deathless,
              })}</p>
            </div>`,
        });
      }
    }
  }
  await setSetting("deathThisRound", false);
  await checkEndgame();
  await offerFinalTeamChoice();
}

/** Kill a player by necklace detonation (Impatience or the Final Day). */
async function detonateNecklace(victim) {
  await victim.update({ "system.dead": true }, { brEndgame: true });
  await ChatMessage.create({
    speaker: overseer(),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(victim)}
        <p class="failure">💥 ${game.i18n.format("BR.Endgame.Detonation", {
          name: victim.name,
        })}</p>
      </div>`,
  });
}

/**
 * Book "Final Team": every living player is on one team of 3+ — the first
 * player in the round's turn order must choose one teammate to save,
 * fracturing the team in two. The split itself clears the trigger, so a
 * dismissed card simply re-offers next round.
 */
async function offerFinalTeamChoice() {
  if (getSetting("gameOver")) return;
  const living = livingPlayers();
  if (living.length < 3) return;
  const team = living[0].system.team?.trim();
  if (!team || !living.every((p) => p.system.team?.trim() === team)) return;
  const chooser =
    getGameCombat()?.turns?.find((c) => !c.isDefeated)?.actor ??
    living[Math.floor(Math.random() * living.length)];
  await ChatMessage.create({
    speaker: overseer(),
    flags: { [SYSTEM_ID]: { card: "action", actorId: chooser.id, actionId: "finalTeam" } },
    content: `
      <div class="battle-royale round-advance">
        <h3>💔 ${game.i18n.localize("BR.Endgame.FinalTeamTitle")}</h3>
        <p>${game.i18n.format("BR.Endgame.FinalTeamBody", { team, name: chooser.name })}</p>
        <div class="br-card-buttons">
          <button type="button" data-br-action="finalTeamChoose">
            <i class="fa-solid fa-people-arrows"></i>
            ${game.i18n.localize("BR.Endgame.FinalTeamChoose")}
          </button>
        </div>
      </div>`,
  });
}

/** Resolve the Final Team save: dialog with the lover pre-selected, or random. */
export async function onFinalTeamChoose(chooser) {
  const living = livingPlayers();
  const team = chooser.system.team?.trim();
  // The card can outlive the situation (deaths, an abandon, a plea) — re-verify.
  if (
    chooser.system.dead ||
    !team ||
    living.length < 3 ||
    !living.every((p) => p.system.team?.trim() === team)
  ) {
    ui.notifications.warn(game.i18n.localize("BR.Endgame.FinalTeamStale"));
    return;
  }
  const mates = living.filter((p) => p.id !== chooser.id);
  // "If there is someone who logically makes sense... that is the one they
  // pick" — a found lover is the obvious pre-selection.
  const lover = loverOf(chooser);
  const preferred =
    chooser.system.loverFound && mates.some((p) => p.id === lover?.id) ? lover.id : mates[0].id;
  const options = mates
    .map(
      (p) => `<option value="${p.id}"${p.id === preferred ? " selected" : ""}>${p.name}</option>`,
    )
    .join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "BR.Endgame.FinalTeamTitle", icon: "fa-solid fa-people-arrows" },
    content: `
      <p>${game.i18n.format("BR.Endgame.FinalTeamPrompt", { name: chooser.name, team })}</p>
      <select name="saved" style="width: 100%">${options}</select>`,
    buttons: [
      {
        action: "save",
        label: "BR.Endgame.FinalTeamSave",
        icon: "fa-solid fa-heart",
        default: true,
        callback: (event, button) => button.form.elements.saved.value,
      },
      { action: "random", label: "BR.Endgame.FinalTeamRandom", icon: "fa-solid fa-dice" },
    ],
    rejectClose: false,
  });
  if (!result) return;
  const saved =
    result === "random" ? mates[Math.floor(Math.random() * mates.length)] : game.actors.get(result);
  if (!saved) return;
  const newTeam = nextTeamNumber();
  await chooser.update({ "system.team": newTeam });
  await saved.update({ "system.team": newTeam });
  await ChatMessage.create({
    speaker: overseer(),
    content: `
      <div class="battle-royale lover-pairs">
        <p>💔 ${game.i18n.format("BR.Endgame.FinalTeamResult", {
          name: chooser.name,
          saved: saved.name,
          newTeam,
          team,
          others: mates
            .filter((p) => p.id !== saved.id)
            .map((p) => p.name)
            .join(", "),
        })}</p>
      </div>`,
  });
}

/**
 * Showdown Convince (book Decree): a Desperation Plea — the same opposed roll
 * as a Convince, but a win talks the target into giving up and dying.
 */
export async function onDesperationPlea(actor) {
  if (!isShowdown()) return onConvinceRoll(actor);
  const targets = convinceTargets(actor);
  if (!targets.length) return showdownForcedMove(actor);
  // Plain random pick — no lover preference; a lethal plea must not
  // preferentially target a beloved.
  const target = targets[Math.floor(Math.random() * targets.length)];
  const con = rollMods(actor, "convince", { acting: true });
  const res = rollMods(target, "convince");
  const conRoll = await new Roll(d6Plus(con.mod)).evaluate();
  const resRoll = await new Roll(d6Plus(res.mod)).evaluate();
  await spendMorale(actor);
  const won = conRoll.total > resRoll.total;
  let outcome;
  if (won) {
    await target.update({ "system.dead": true }, { brEndgame: true });
    await actor.update({ "system.kills": actor.system.kills + 1 });
    outcome = `<p class="failure">💀 ${game.i18n.format("BR.Endgame.PleaWin", {
      convincer: actor.name,
      target: target.name,
    })}</p>`;
  } else {
    outcome = `<p class="success">🙅 ${game.i18n.format("BR.Endgame.PleaFail", {
      target: target.name,
    })}</p>`;
  }
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [conRoll, resRoll],
    flavor: game.i18n.localize("BR.Endgame.PleaFlavor"),
    flags: { [SYSTEM_ID]: { card: "action", actorId: actor.id, actionId: "convince" } },
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(actor)}
        <p>🗣 ${game.i18n.format("BR.Endgame.PleaVs", {
          convincer: actor.name,
          target: target.name,
        })}</p>
        ${combatantLine(actor, conRoll, con.parts)}
        ${combatantLine(target, resRoll, res.parts)}
        ${outcome}
      </div>`,
  });
  if (won) {
    await offerLoot(actor, target);
    await checkEndgame();
  }
}

/**
 * Showdown forced Attack with no one to fight: hunt instead — move one square
 * toward the nearest living player (hidden included, ties random).
 * Interpretation: the book forces combat but freezes zones; without this,
 * scattered players would stand still while the Overseer detonates them one
 * by one. A landed move rolls the Event Chart like any other move.
 */
export async function showdownForcedMove(actor, { roll = null, forcedFrom = null } = {}) {
  // A trap holds even the hunt — the victim struggles instead of stepping.
  if (isStuck(actor)) return postStuckNote(actor);
  const from = parseCell(actor.system.location);
  const candidates = livingPlayers()
    .filter((p) => p.id !== actor.id)
    .map((p) => ({ p, cell: parseCell(p.system.location) }))
    .filter((c) => c.cell);

  let text;
  let dest = null;
  if (!from || !candidates.length) {
    text = game.i18n.format("BR.Endgame.ForcedMoveStuck", {
      name: actor.name,
      cell: actor.system.location || "—",
    });
  } else {
    let nearest = candidates[0];
    for (const c of candidates.slice(1)) {
      const d = chebyshev(from, c.cell);
      const best = chebyshev(from, nearest.cell);
      if (d < best || (d === best && Math.random() < 0.5)) nearest = c;
    }
    const best = chebyshev(from, nearest.cell);
    if (best === 0) {
      // Someone IS here — just hidden and untargetable (book p.10).
      text = game.i18n.format("BR.Endgame.ForcedMoveHidden", {
        name: actor.name,
        cell: actor.system.location,
      });
    } else {
      const counts = zoneCounts(effectiveZoneRound());
      const centerOrder = getCenterOrder();
      const step = Object.values(DIRECTION_DELTAS)
        .map(([dr, dc]) => ({ row: from.row + dr, col: from.col + dc }))
        .filter((cell) => chebyshev(cell, nearest.cell) < best)
        .sort(
          (a, b) => chebyshev(a, nearest.cell) - chebyshev(b, nearest.cell) || Math.random() - 0.5,
        )
        .find((cell) => isOpen(cell.row, cell.col, counts, centerOrder));
      if (step) {
        dest = cellLabel(step.row, step.col);
        await moveActorToCell(actor, dest);
        // Destination only — never name the target; the nearest player may
        // be hidden.
        text = game.i18n.format("BR.Endgame.ForcedMove", {
          name: actor.name,
          cell: cellLabel(from.row, from.col),
          dest,
        });
      } else {
        text = game.i18n.format("BR.Endgame.ForcedMoveStuck", {
          name: actor.name,
          cell: actor.system.location,
        });
      }
    }
  }
  const note = forcedFrom
    ? `<p class="br-action-note">⚔ ${game.i18n.format("BR.Endgame.ShowdownNote", {
        action: game.i18n.localize(`BR.Actions.${ACTIONS[forcedFrom].key}.Name`),
      })}</p>`
    : "";
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: roll ? [roll] : [],
    flavor: roll ? game.i18n.localize("BR.Actions.Flavor") : undefined,
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p>🏃 ${text}</p>
        ${note}
      </div>`,
  });
  if (dest) await rollEvent(actor);
}

/**
 * Book: lovers reveal their original personality before the Final Reckoning —
 * 1d20 on the Personality Table, re-rolling further "In Love" results.
 */
async function ensureReckoningPersonality(actor) {
  const current = actor.system.personality?.trim();
  if (current && current !== "In Love") return;
  let roll;
  let personality;
  do {
    roll = await new Roll("1d20").evaluate();
    personality = PERSONALITIES[roll.total - 1];
  } while (personality === "In Love");
  await actor.update({ "system.personality": personality });
  await ChatMessage.create({
    speaker: overseer(),
    rolls: [roll],
    flavor: game.i18n.localize("BR.Sheet.Personality"),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p>🎭 ${game.i18n.format("BR.Endgame.ReckoningReroll", {
          name: actor.name,
          personality,
        })}</p>
      </div>`,
  });
}

/** Roll the 2d6 scenario and post the trigger card with the resolve button. */
async function triggerFinalReckoning(pair) {
  await setSetting("reckoningRolled", true);
  for (const p of pair) await ensureReckoningPersonality(p);
  const roll = await new Roll("2d6").evaluate();
  const scenario = FINAL_RECKONING[roll.total];
  const skillName =
    scenario.skill === "attackKills"
      ? game.i18n.localize("BR.Endgame.SkillAttackKills")
      : game.i18n.localize(`BR.Actions.${ACTIONS[scenario.skill].key}.Name`);
  const [a, b] = pair;
  await ChatMessage.create({
    speaker: overseer(),
    rolls: [roll],
    flavor: game.i18n.localize("BR.Endgame.ReckoningTitle"),
    flags: {
      [SYSTEM_ID]: {
        card: "action",
        actorId: a.id,
        actionId: "finalReckoning",
        opponentId: b.id,
        scenario: roll.total,
      },
    },
    content: `
      <div class="battle-royale round-advance">
        <h3>⚖ ${game.i18n.localize("BR.Endgame.ReckoningTitle")}</h3>
        <p>${game.i18n.format("BR.Endgame.ReckoningIntro", { a: a.name, b: b.name })}</p>
        <p><strong>${game.i18n.format("BR.Endgame.ReckoningScenario", {
          n: roll.total,
          name: scenario.name,
        })}</strong></p>
        <p>${scenario.description}</p>
        <p class="br-action-note">${game.i18n.format("BR.Endgame.ReckoningSkill", {
          skill: skillName,
        })}</p>
        <div class="br-card-buttons">
          <button type="button" data-br-action="finalReckoningRoll">
            <i class="fa-solid fa-scale-balanced"></i>
            ${game.i18n.localize("BR.Endgame.ReckoningResolve")}
          </button>
        </div>
      </div>`,
  });
}

/**
 * Final Reckoning bonus (book): +1 per face of the scenario's skill on the
 * player's personality column (the book example: Silent has 1 Hide, Anxious
 * has 2). "Attack + Kill Count" also adds the carried item's Attack modifier
 * and total kills. Thinking always gets +1 (their column is all Overseer).
 * RAW quirk: a natural Simple scores 0 on everything.
 */
function reckoningBonus(actor, skill) {
  const personality = actor.system.personality?.trim();
  const column = PERSONALITY_COLUMNS[personality] ?? [];
  const actionId = skill === "attackKills" ? "attack" : skill;
  const faces = column.filter((a) => a === actionId).length;
  const parts = [];
  if (faces) {
    parts.push({
      mod: faces,
      label: game.i18n.format("BR.Endgame.BonusFaces", {
        action: game.i18n.localize(`BR.Actions.${ACTIONS[actionId].key}.Name`),
        n: faces,
      }),
    });
  }
  if (skill === "attackKills") {
    const item = itemMod(actor, "attack");
    if (item) {
      parts.push({
        mod: item,
        label: game.i18n.format("BR.Actions.ModItem", { item: carriedItem(actor).name, n: item }),
      });
    }
    if (actor.system.kills) {
      parts.push({
        mod: actor.system.kills,
        label: game.i18n.format("BR.Endgame.BonusKills", { n: actor.system.kills }),
      });
    }
  }
  if (personality === "Thinking") {
    parts.push({ mod: 1, label: game.i18n.localize("BR.Endgame.BonusThinking") });
  }
  return {
    mod: parts.reduce((sum, p) => sum + p.mod, 0),
    parts: parts.length ? parts.map((p) => p.label) : [game.i18n.localize("BR.Actions.ModNone")],
  };
}

/** Resolve the Final Reckoning: 1d6 + skill bonus each; tie = both die. */
export async function onFinalReckoningRoll(actor, flags) {
  if (getSetting("gameOver")) return;
  const opponent = game.actors.get(flags.opponentId);
  const scenario = FINAL_RECKONING[flags.scenario];
  if (!opponent || !scenario || actor.system.dead || opponent.system.dead) return;
  const aBonus = reckoningBonus(actor, scenario.skill);
  const bBonus = reckoningBonus(opponent, scenario.skill);
  const aRoll = await new Roll(d6Plus(aBonus.mod)).evaluate();
  const bRoll = await new Roll(d6Plus(bBonus.mod)).evaluate();
  const tie = aRoll.total === bRoll.total;
  let outcome;
  if (tie) {
    // Book: "In the event of a tie, neither player survives."
    await actor.update({ "system.dead": true }, { brEndgame: true });
    await opponent.update({ "system.dead": true }, { brEndgame: true });
    outcome = `<p class="failure">💥 ${game.i18n.format("BR.Endgame.ReckoningTie", {
      w: aRoll.total,
      l: bRoll.total,
    })}</p>`;
  } else {
    const winner = aRoll.total > bRoll.total ? actor : opponent;
    const loser = winner === actor ? opponent : actor;
    // No kill credit — this is the Overseer's scenario, not a murder.
    await loser.update({ "system.dead": true }, { brEndgame: true });
    outcome = `<p class="success">🏆 ${game.i18n.format("BR.Endgame.ReckoningWin", {
      winner: winner.name,
      loser: loser.name,
      w: Math.max(aRoll.total, bRoll.total),
      l: Math.min(aRoll.total, bRoll.total),
    })}</p>`;
  }
  await ChatMessage.create({
    speaker: overseer(),
    rolls: [aRoll, bRoll],
    flavor: game.i18n.localize("BR.Endgame.ReckoningTitle"),
    content: `
      <div class="battle-royale combat-card">
        <h3>⚖ ${scenario.name}</h3>
        ${combatantLine(actor, aRoll, aBonus.parts)}
        ${combatantLine(opponent, bRoll, bBonus.parts)}
        ${outcome}
      </div>`,
  });
  await checkEndgame();
}

/**
 * The final day (book): round 30 ends with more than one player alive — the
 * Overseer detonates necklaces at random until a single player remains.
 */
export async function runFinalDay() {
  if (!game.user.isGM) {
    ui.notifications.warn("BR.Setup.GMOnly", { localize: true });
    return;
  }
  if (getRound() < MAX_ROUND || getSetting("gameOver")) return;
  const living = livingPlayers();
  if (living.length <= 1) return checkEndgame();
  if (getSetting("reckoningRolled") && living.length === 2) {
    ui.notifications.warn(game.i18n.localize("BR.Endgame.FinalDayReckoning"));
    return;
  }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "BR.Endgame.FinalDayTitle", icon: "fa-solid fa-explosion" },
    content: `<p>${game.i18n.format("BR.Endgame.FinalDayConfirm", { n: living.length })}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  const order = shuffled(living);
  while (order.length > 1) await detonateNecklace(order.shift());
  await checkEndgame();
}

/** Post the victory (or no-winners) card. Book: "there are no winners, only a spectacle and a story." */
async function endGame(winner) {
  await setSetting("gameOver", true);
  const content = winner
    ? `
      <div class="battle-royale success-card">
        ${cardHeader(winner)}
        <p class="success">🎺 ${game.i18n.format("BR.Endgame.Victory", {
          name: winner.name,
          kills: winner.system.kills,
        })}</p>
      </div>`
    : `
      <div class="battle-royale round-advance">
        <p class="lethal">🕊 ${game.i18n.localize("BR.Endgame.NoWinners")}</p>
      </div>`;
  await ChatMessage.create({ speaker: overseer(), content });
  await postGameSummary(winner);
}

/** Final roster summary: the winner (if any) and every player's kill count. */
async function postGameSummary(winner) {
  const players = game.actors
    .filter((a) => a.type === "player")
    .sort((a, b) => b.system.kills - a.system.kills || a.name.localeCompare(b.name));
  const headline = winner
    ? `<p class="success">🏆 ${game.i18n.format("BR.Endgame.SummaryWinner", {
        name: winner.name,
        kills: winner.system.kills,
      })}</p>`
    : `<p class="lethal">🕊 ${game.i18n.localize("BR.Endgame.SummaryNoWinner")}</p>`;
  const rows = players
    .map(
      (p) =>
        `<p class="br-action-note">${p === winner ? "🏆" : "💀"} ${game.i18n.format(
          "BR.Endgame.SummaryLine",
          { name: p.name, kills: p.system.kills },
        )}</p>`,
    )
    .join("\n");
  await ChatMessage.create({
    speaker: overseer(),
    content: `
      <div class="battle-royale round-advance">
        <h3>📜 ${game.i18n.localize("BR.Endgame.SummaryTitle")}</h3>
        ${headline}
        ${rows}
      </div>`,
  });
}

/** GM escape hatch: clear all endgame state (e.g. after mass-reviving). */
export async function resetEndgame() {
  await setSetting("showdownRound", 0);
  await setSetting("deathThisRound", false);
  await setSetting("deathlessRounds", 0);
  await setSetting("reckoningRolled", false);
  await setSetting("gameOver", false);
}
