import { SYSTEM_ID } from "./cards.js";
import { MAX_ROUND } from "./data/tables.js";
import { announceRound } from "./rounds.js";
import { rollAction } from "./actions.js";
import { pingPlayer } from "./location.js";
import { raiseActiveCombatantToken } from "./tokens.js";

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The persistent encounter that drives the whole 30-round game. */
export const getGameCombat = () => game.combats.find((c) => c.getFlag(SYSTEM_ID, "game"));

/**
 * Create the game encounter with one (tokenless) combatant per player actor.
 * Scene stays null so the encounter is visible from every scene.
 */
export async function createGameCombat(actors, { round = 0 } = {}) {
  return Combat.create({
    active: true,
    round,
    turn: round > 0 ? 0 : null,
    flags: { [SYSTEM_ID]: { game: true } },
    combatants: actors.map((a) => ({ actorId: a.id })),
  });
}

export async function deleteGameCombats() {
  const ids = game.combats.filter((c) => c.getFlag(SYSTEM_ID, "game")).map((c) => c.id);
  if (ids.length) await Combat.deleteDocuments(ids);
}

/**
 * The game combat: players are re-shuffled every round (book rule). The combat
 * round is the master value — every round change reshuffles the turn order,
 * mirrors the `round` world setting (which drives the zone overlay and the
 * round tracker widget), and announces zone events in chat.
 */
export class BRCombat extends Combat {
  /** @override */
  async _preUpdate(changed, options, user) {
    if ("round" in changed) changed.round = Math.clamp(changed.round ?? 0, 0, MAX_ROUND);
    return super._preUpdate(changed, options, user);
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    // `current` still holds the pre-update round; super mutates it.
    const from = this.current?.round ?? 0;
    super._onUpdate(changed, options, userId);
    if (!("round" in changed)) return; // excludes our own flags write
    const to = this.round;
    if (to === from || !game.user.isActiveGM) return;
    this.#onRoundChanged(from, to); // deliberately not awaited (core idiom)
  }

  async #onRoundChanged(from, to) {
    if (to >= 1) {
      await this.ensureRoundOrder();
      await raiseActiveCombatantToken(this);
    }
    if (game.settings.get(SYSTEM_ID, "round") !== to) {
      await game.settings.set(SYSTEM_ID, "round", to);
    }
    if (to > from) await announceRound(from, to);
  }

  /**
   * Apply this round's turn order: living players shuffled, dead sunk to the
   * bottom with null initiative. Orders are stored per round (as actor ids)
   * in a flag, so going Back re-applies the exact same order.
   */
  async ensureRoundOrder() {
    const round = this.round;
    if (round < 1) return;
    const orders = this.getFlag(SYSTEM_ID, "orders") ?? {};
    let order = orders[round];
    const living = this.combatants.filter((c) => !c.isDefeated).map((c) => c.actorId);
    if (!order) {
      order = shuffled(living);
    } else {
      // Players revived or added since this order was rolled join at the end.
      order = [...order, ...living.filter((id) => !order.includes(id))];
    }
    if (!orders[round] || order.length !== orders[round].length) {
      await this.setFlag(SYSTEM_ID, "orders", { ...orders, [round]: order });
    }
    const updates = this.combatants.map((c) => ({
      _id: c.id,
      initiative: c.isDefeated ? null : order.length - order.indexOf(c.actorId),
    }));
    // combatTurn: keep the pointer where the round update put it — without it,
    // core makes the pointer follow the old combatant to its new sorted slot.
    await this.updateEmbeddedDocuments("Combatant", updates, {
      combatTurn: this.turn ?? 0,
      turnEvents: false,
    });
  }
}

/**
 * Mirror the Dead field onto the map: toggle the core "dead" status effect
 * (skull overlay) whenever it flips. Tokens are actor-linked, so the effect
 * shows on the island token; unchecking Dead clears it again.
 */
export function registerDeathMarker() {
  Hooks.on("updateActor", async (actor, changes) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    const dead = changes.system?.dead;
    if (dead === undefined) return;
    await actor.toggleStatusEffect("dead", { active: dead, overlay: true });
  });
}

/** A player's combatant. Dead is tracked on the actor, nowhere else. */
export class BRCombatant extends Combatant {
  /** @override */
  get isDefeated() {
    return this.actor?.type === "player" ? !!this.actor.system.dead : super.isDefeated;
  }
}

export class BRCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {
  // Merged with core's options up the inheritance chain.
  static DEFAULT_OPTIONS = {
    actions: {
      brRollAction: BRCombatTracker.#onRollAction,
      brPing: BRCombatTracker.#onPing,
    },
  };

  #rowActor(target) {
    const id = target.closest("[data-combatant-id]")?.dataset.combatantId;
    return this.viewed?.combatants.get(id)?.actor;
  }

  static #onRollAction(event, target) {
    const actor = this.#rowActor(target);
    if (actor) rollAction(actor);
  }

  static #onPing(event, target) {
    const actor = this.#rowActor(target);
    if (actor) pingPlayer(actor);
  }

  /**
   * The skull button toggles the actor's Dead field (same field as the sheet
   * checkbox) instead of the combatant flag + core status effect.
   * @override
   */
  async _onToggleDefeatedStatus(combatant) {
    if (combatant.actor?.type !== "player") return super._onToggleDefeatedStatus(combatant);
    await combatant.actor.update({ "system.dead": !combatant.isDefeated });
  }

  /**
   * Add a Roll Action die button to every living player's row. Injected after
   * render — overriding the core row template would cost far more than this.
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (!game.user.isGM) return;
    const rollLabel = game.i18n.localize("BR.Actions.RollAction");
    const pingLabel = game.i18n.localize("BR.Actions.Ping");
    for (const row of this.element.querySelectorAll(".combatant[data-combatant-id]")) {
      const combatant = this.viewed?.combatants.get(row.dataset.combatantId);
      if (combatant?.actor?.type !== "player") continue;
      const controls = row.querySelector(".combatant-controls");
      controls?.insertAdjacentHTML(
        "afterbegin",
        `<button type="button" class="inline-control combatant-control icon fa-solid fa-location-crosshairs"
                 data-action="brPing" data-tooltip aria-label="${pingLabel}"></button>`,
      );
      if (combatant.isDefeated) continue;
      controls?.insertAdjacentHTML(
        "afterbegin",
        `<button type="button" class="inline-control combatant-control icon fa-solid fa-dice"
                 data-action="brRollAction" data-tooltip aria-label="${rollLabel}"></button>`,
      );
    }
  }
}
