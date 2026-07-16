import { moveActorToCell } from "./movement.js";
import { PERSONALITIES } from "./data/tables.js";
import { isStuck } from "./debuffs.js";

const IN_LOVE = "In Love";

/** The actor this player loves, or null. */
export const loverOf = (actor) => game.actors.get(actor?.system.lover) ?? null;

/** Lover relationship snapshot; `dead` is derived so it can never desync. */
export function loverState(actor) {
  const lover = loverOf(actor);
  return { lover, found: !!actor?.system.loverFound, dead: !!lover?.system.dead };
}

/** Book: "Once they have found each other, all rolls receive a +1 bonus." */
export function hasLoverBonus(actor) {
  if (actor?.system.personality?.trim() !== IN_LOVE || !actor.system.loverFound) return false;
  const lover = loverOf(actor);
  return !!lover && !lover.system.dead;
}

/** Anyone alive and visible sharing this player's square? (Rage needs a victim; hidden players can't be targeted.) */
export function victimsInSquare(actor) {
  const location = actor?.system.location;
  if (!location) return false;
  return game.actors.some(
    (p) =>
      p.type === "player" &&
      p.id !== actor.id &&
      !p.system.dead &&
      !p.system.hidden &&
      p.system.location === location,
  );
}

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Resolve In Love players after the roster is rolled up (book "Resolving In
 * Love"): pair them off with each other; an odd one out falls for a random
 * other contestant — a one-sided love, which is book-legal. Pairings are
 * whispered to the GM.
 */
export async function pairLovers(actors) {
  const players = actors.filter((a) => a.type === "player");
  const pool = shuffled(players.filter((a) => a.system.personality === IN_LOVE));
  if (!pool.length) return;

  const lines = [];
  while (pool.length >= 2) {
    const a = pool.pop();
    const b = pool.pop();
    await a.update({ "system.lover": b.id });
    await b.update({ "system.lover": a.id });
    lines.push(game.i18n.format("BR.Actions.LoverPair", { a: a.name, b: b.name }));
  }
  if (pool.length) {
    const a = pool.pop();
    const others = players.filter((p) => p.id !== a.id);
    if (others.length) {
      const b = others[Math.floor(Math.random() * others.length)];
      await a.update({ "system.lover": b.id });
      lines.push(game.i18n.format("BR.Actions.LoverPairOneSided", { a: a.name, b: b.name }));
    }
  }
  if (!lines.length) return;

  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `
      <div class="battle-royale lover-pairs">
        <h3>❤ ${game.i18n.localize("BR.Actions.LoverPairs")}</h3>
        ${lines.map((line) => `<p>${line}</p>`).join("")}
      </div>`,
  });
}

async function announceFound(a, b) {
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
    content: `
      <div class="battle-royale lover-pairs">
        <p>❤ ${game.i18n.format("BR.Actions.LoverFoundMsg", { a: a.name, b: b.name })}</p>
      </div>`,
  });
}

/**
 * Book "When a Love Dies": the In Love player re-rolls their personality
 * (1d20), falls into an insatiable rage, and their Move actions become
 * Attacks while a potential victim shares their square (checked per roll in
 * postActionCard). Marking the lover Dead is the death announcement, so this
 * fires on that flip.
 */
async function onLoverDeath(deadActor) {
  const mourners = game.actors.filter(
    (p) =>
      p.type === "player" &&
      !p.system.dead &&
      !p.system.enraged &&
      p.system.lover === deadActor.id &&
      p.system.personality?.trim() === IN_LOVE,
  );
  for (const mourner of mourners) {
    const roll = await new Roll("1d20").evaluate();
    const personality = PERSONALITIES[roll.total - 1];
    await mourner.update({ "system.personality": personality, "system.enraged": true });
    await ChatMessage.create({
      speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
      rolls: [roll],
      content: `
        <div class="battle-royale lover-pairs">
          <p>🔥 ${game.i18n.format("BR.Actions.RageAnnounce", {
            name: mourner.name,
            lover: deadActor.name,
            personality,
          })}</p>
        </div>`,
    });
  }
}

/**
 * Lover reactions to location changes (from token moves or manual edits):
 * landing in the lover's square marks them Found; once found, a lover follows
 * whenever their beloved moves. Runs on the active GM only — the hook fires
 * on every client. Recursion settles naturally: the follower's own update
 * finds both locations already equal.
 */
export function registerLoverHooks() {
  Hooks.on("updateActor", async (actor, changes) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    if (changes.system?.dead === true) await onLoverDeath(actor);
    const location = changes.system?.location;
    if (!location) return;

    const partners = game.actors.filter(
      (p) =>
        p.type === "player" &&
        p.id !== actor.id &&
        (p.system.lover === actor.id || actor.system.lover === p.id),
    );
    for (const partner of partners) {
      // Same square → the In Love side(s) mark their lover as Found.
      if (partner.system.location === location) {
        let found = false;
        for (const [side, other] of [
          [actor, partner],
          [partner, actor],
        ]) {
          if (side.system.lover === other.id && !side.system.loverFound && !side.system.dead) {
            await side.update({ "system.loverFound": true });
            found = true;
          }
        }
        if (found) await announceFound(actor, partner);
      }
      // Found lovers follow when their beloved moves away — unless trapped.
      if (
        partner.system.lover === actor.id &&
        partner.system.loverFound &&
        !partner.system.dead &&
        !isStuck(partner) &&
        partner.system.location !== location
      ) {
        await moveActorToCell(partner, location, { slot: "right" });
      }
    }
  });
}
