import { SYSTEM_ID } from "./cards.js";
import { isIslandScene } from "./rounds.js";

/** A player's token on the island scene, if the GM has placed one. */
const islandToken = (actor) =>
  game.scenes.find(isIslandScene)?.tokens.find((t) => t.actorId === actor?.id);

/**
 * Raise a token above every other token on its scene. TokenDocument#sort
 * persists (v12+), so one GM write syncs the stacking order to every client.
 * No-op when already on top — keeps sort values from growing needlessly.
 */
async function bringToTop(token) {
  const others = token.parent.tokens.filter((t) => t.id !== token.id);
  if (!others.some((t) => t.sort >= token.sort)) return;
  await token.update({ sort: Math.max(...others.map((t) => t.sort)) + 1 });
}

/** Sink a token beneath every other token on its scene (dead bodies). */
async function sendToBottom(token) {
  const others = token.parent.tokens.filter((t) => t.id !== token.id);
  if (!others.some((t) => t.sort <= token.sort)) return;
  await token.update({ sort: Math.min(...others.map((t) => t.sort)) - 1 });
}

/**
 * Raise the currently-active combatant's token to the top of its pile.
 * Exposed so BRCombat can call it itself once a round's reshuffle has
 * actually settled — the generic `updateCombat` hook below skips round
 * changes because it fires before that async reshuffle lands (it would read
 * the stale, pre-reshuffle `combatant`).
 */
export async function raiseActiveCombatantToken(combat) {
  if (!game.user.isActiveGM) return;
  const token = islandToken(combat.combatant?.actor);
  if (token) await bringToTop(token);
}

/**
 * Keep stacked squares readable: the active player's token pops to the top of
 * the pile each turn, and corpses sink beneath the living (revival lifts them
 * back up). Both hooks fire on every client, so only the active GM writes.
 */
export function registerTokenOrder() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!game.user.isActiveGM || !combat.getFlag(SYSTEM_ID, "game")) return;
    // Round changes reshuffle turn order asynchronously after this fires
    // (see BRCombat#onRoundChanged) — it raises the new round's leader
    // itself once that settles, so skip round changes here.
    if ("round" in changed || !("turn" in changed)) return;
    await raiseActiveCombatantToken(combat);
  });
  Hooks.on("updateActor", async (actor, changes) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    const dead = changes.system?.dead;
    if (dead === undefined) return;
    const token = islandToken(actor);
    if (token) await (dead ? sendToBottom(token) : bringToTop(token));
  });
}

/**
 * Remove every dead player's token from the island (GM only, confirmed
 * first). The roster keeps their final Location; re-dragging the actor onto
 * the map restores the token if they're ever revived.
 */
export async function cleanupBodies() {
  if (!game.user.isGM) {
    ui.notifications.warn("BR.Setup.GMOnly", { localize: true });
    return;
  }
  const scene = game.scenes.find(isIslandScene);
  const ids = scene?.tokens.filter((t) => t.actor?.system.dead).map((t) => t.id) ?? [];
  if (!ids.length) {
    ui.notifications.info("BR.Tokens.CleanupNone", { localize: true });
    return;
  }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "BR.Tokens.CleanupTitle", icon: "fa-solid fa-broom" },
    content: `<p>${game.i18n.format("BR.Tokens.CleanupConfirm", { n: ids.length })}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await scene.deleteEmbeddedDocuments("Token", ids);
  ui.notifications.info(game.i18n.format("BR.Tokens.CleanupDone", { n: ids.length }));
}
