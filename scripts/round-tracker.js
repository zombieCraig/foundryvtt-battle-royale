import { SYSTEM_ID } from "./cards.js";
import { WARNING_ROUNDS, LETHAL_ROUNDS, MAX_ROUND } from "./data/tables.js";
import {
  getRound,
  getCenterOrder,
  getShowdownRound,
  effectiveZoneRound,
  zoneCounts,
  escalation,
  nextRound,
  prevRound,
  CENTER_CELLS,
} from "./rounds.js";
import { getGameCombat } from "./combat.js";
import { rollAction } from "./actions.js";
import { pingPlayer } from "./location.js";
import { carriedItem } from "./items.js";
import { runFinalDay } from "./endgame.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Short zone label for the status list: "Ring 2" or "F6". */
function zoneShortName(i, centerOrder) {
  if (i <= 4) return game.i18n.format("BR.Rounds.RingShort", { n: i });
  const cell = CENTER_CELLS[centerOrder[i - 5]];
  return `${String.fromCharCode(65 + cell.row)}${cell.col + 1}`;
}

/** Floating GM widget tracking the current round, zones, and escalation. */
export class RoundTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: "br-round-tracker",
    classes: [SYSTEM_ID, "round-tracker"],
    position: { width: 280, height: "auto" },
    window: { title: "BR.Rounds.Title", icon: "fa-solid fa-stopwatch", resizable: false },
    actions: {
      next: RoundTracker.#onNext,
      back: RoundTracker.#onBack,
      rollAction: RoundTracker.#onRollAction,
      nextPlayer: RoundTracker.#onNextPlayer,
      finalDay: RoundTracker.#onFinalDay,
    },
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/round-tracker.hbs` },
  };

  /** Open (or focus) the singleton tracker. */
  static open() {
    this.#instance ??= new RoundTracker();
    this.#instance.render({ force: true });
    return this.#instance;
  }

  /** Re-render if open — called when the round setting changes. */
  static rerender() {
    if (this.#instance?.rendered) this.#instance.render();
  }

  /** Advance the round — with a confirm when players haven't acted yet. */
  static async #onNext() {
    const combat = getGameCombat();
    const remaining = RoundTracker.#remainingPlayers(combat);
    if (remaining.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "BR.Rounds.EarlyNextTitle", icon: "fa-solid fa-forward-step" },
        content: `<p>${game.i18n.format("BR.Rounds.EarlyNextConfirm", {
          n: remaining.length,
          names: remaining.map((c) => c.name).join(", "),
        })}</p>`,
        rejectClose: false,
      });
      if (!ok) return;
    }
    nextRound();
  }

  static #onBack() {
    prevRound();
  }

  static #onFinalDay() {
    runFinalDay();
  }

  static #onRollAction() {
    const actor = getGameCombat()?.combatant?.actor;
    if (actor) rollAction(actor);
  }

  /** Living combatants still to act after the current turn this round. */
  static #remainingPlayers(combat) {
    if (!combat || combat.round < 1) return [];
    return combat.turns.slice((combat.turn ?? 0) + 1).filter((c) => !c.isDefeated);
  }

  /** Anyone still to act after the current turn this round? */
  static #hasNextPlayer(combat) {
    return RoundTracker.#remainingPlayers(combat).length > 0;
  }

  static async #onNextPlayer() {
    const combat = getGameCombat();
    if (!RoundTracker.#hasNextPlayer(combat)) return;
    await combat.nextTurn();
    // Show the Overseer where the new player is (quiet if untracked).
    const actor = combat.combatant?.actor;
    if (actor) pingPlayer(actor, { warn: false });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const round = getRound();
    // Zone math runs on the frozen round once a Showdown is declared.
    const counts = zoneCounts(effectiveZoneRound(round));
    const centerOrder = getCenterOrder();
    const showdown = !!getShowdownRound();
    const gameOver = game.settings.get(SYSTEM_ID, "gameOver");

    const status = [];
    if (counts.lethal > 0) {
      const zones = Array.fromRange(counts.lethal, 1)
        .map((i) => zoneShortName(i, centerOrder))
        .join(", ");
      status.push({
        kind: "lethal",
        text: `💀 ${game.i18n.format("BR.Rounds.StatusLethal", { zones })}`,
      });
    }
    if (counts.warned > counts.lethal) {
      const zones = Array.fromRange(counts.warned - counts.lethal, counts.lethal + 1)
        .map((i) => zoneShortName(i, centerOrder))
        .join(", ");
      status.push({
        kind: "warning",
        text: `⚠️ ${game.i18n.format("BR.Rounds.StatusWarned", { zones })}`,
      });
    }
    if (!showdown) {
      const nextWarn = WARNING_ROUNDS.find((r) => r > round);
      if (round > 0 && nextWarn) {
        status.push({
          kind: "upcoming",
          text: game.i18n.format("BR.Rounds.NextWarning", { n: nextWarn }),
        });
      }
      const nextLethal = LETHAL_ROUNDS.find((r) => r >= round);
      if (counts.warned > counts.lethal && nextLethal) {
        status.push({
          kind: "upcoming",
          text: game.i18n.format("BR.Rounds.NextLethal", { n: nextLethal }),
        });
      }
    }
    if (showdown) {
      status.push({
        kind: "lethal",
        text: `⚔ ${game.i18n.localize("BR.Endgame.StatusShowdown")}`,
      });
      const deathless = game.settings.get(SYSTEM_ID, "deathlessRounds");
      if (deathless >= 2 && !gameOver) {
        status.push({
          kind: deathless >= 3 ? "lethal" : "warning",
          text: `⏳ ${game.i18n.format("BR.Endgame.StatusImpatience", { n: deathless })}`,
        });
      }
    }
    if (gameOver) {
      status.push({
        kind: "lethal",
        text: `🏆 ${game.i18n.localize("BR.Endgame.StatusGameOver")}`,
      });
    }

    const living = game.actors.filter((a) => a.type === "player" && !a.system.dead).length;
    const combat = getGameCombat();
    const combatant = combat?.combatant;
    const upItem = combatant?.actor ? carriedItem(combatant.actor) : null;
    return {
      ...context,
      round,
      started: round > 0,
      upNow: combatant
        ? {
            name: combatant.name,
            img: combatant.img,
            personality: combatant.actor?.system.personality ?? "",
            weapon: upItem?.system.weapon ? upItem.name : "",
          }
        : null,
      canNextPlayer: RoundTracker.#hasNextPlayer(combat),
      status,
      esc: escalation(round),
      isGM: game.user.isGM,
      canBack: round > 0,
      canNext: round < MAX_ROUND,
      // Round 30 done with survivors: Next is capped, the Final Day takes over.
      finalDay: game.user.isGM && round === MAX_ROUND && living > 1 && !gameOver,
    };
  }
}
