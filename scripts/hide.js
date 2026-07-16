/**
 * Hidden state (book Hide Rules, p.10). `system.hidden` is the source of
 * truth — the sheet checkbox, the Hide action, and Search discovery all flip
 * it; these hooks keep the map and the book's unhide triggers in sync.
 */

/**
 * Mirror Hidden onto the map: toggle the core "invisible" status effect
 * whenever it flips (same pattern as the death marker; tokens are
 * actor-linked). No overlay — the skull keeps that slot.
 */
export function registerHiddenMarker() {
  Hooks.on("updateActor", async (actor, changes) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    const hidden = changes.system?.hidden;
    if (hidden === undefined) return;
    await actor.toggleStatusEffect("invisible", { active: hidden });
  });
}

/**
 * Book unhide triggers this hook can see: a successful move to a new area
 * ("after a successful move they are no longer hidden", p.9) — which arrives
 * as a location change, whether from the Direction Roll, a token drag, or a
 * manual edit. Death also clears it (a corpse isn't hiding). Attacking from
 * hiding unhides in the attack resolution itself.
 */
export function registerUnhideTriggers() {
  Hooks.on("updateActor", async (actor, changes) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    if (!actor.system.hidden) return;
    if (changes.system?.location || changes.system?.dead === true) {
      await actor.update({ "system.hidden": false });
    }
  });
}
