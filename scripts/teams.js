import { moveActorToCell } from "./movement.js";
import { isStuck } from "./debuffs.js";

/** Mutual found lovers count as a team (book: "they automatically form their own team"). */
export function areTeammates(a, b) {
  const team = a.system.team?.trim();
  if (team && b.system.team?.trim() === team) return true;
  return (
    a.system.lover === b.id && b.system.lover === a.id && a.system.loverFound && b.system.loverFound
  );
}

/** Living players on the given (non-empty) team. */
export function livingTeamMembers(team) {
  return game.actors.filter(
    (p) => p.type === "player" && !p.system.dead && p.system.team?.trim() === team,
  );
}

/** Convince group size (book p.8 "join the larger team"): the living team, or just themselves. */
export function groupSize(actor) {
  const team = actor.system.team?.trim();
  return team ? livingTeamMembers(team).length : 1;
}

/** Next free numeric team label ("1", "2", …); non-numeric team names are skipped. */
export function nextTeamNumber() {
  const nums = game.actors
    .filter((a) => a.type === "player")
    .map((a) => Number(a.system.team))
    .filter((n) => Number.isInteger(n) && n > 0);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

// Suppress cascades from our own follow moves (each one re-fires updateActor).
let following = false;

/**
 * Book p.8: "When one person from a team successfully moves, all other
 * players in that team move with them." Only teammates who shared the mover's
 * old square follow — the prior location rides in via options from
 * PlayerModel._preUpdate. A found lover partner is excluded (the lover hook
 * already drags them). Hidden followers unhide through the existing
 * unhide-on-move hook — book-accurate, a successful move to a new area
 * unhides.
 */
export function registerTeamFollow() {
  Hooks.on("updateActor", async (actor, changes, options) => {
    if (!game.user.isActiveGM || actor.type !== "player") return;
    const location = changes.system?.location;
    const from = options.brPriorLocation;
    if (!location || !from || following) return;
    const team = actor.system.team?.trim();
    if (!team) return;

    const candidates = game.actors.filter(
      (p) =>
        p.type === "player" &&
        p.id !== actor.id &&
        !p.system.dead &&
        p.system.team?.trim() === team &&
        p.system.location === from &&
        !(p.system.lover === actor.id && p.system.loverFound),
    );
    // Trapped teammates stay behind (book p.22: "N turns to escape").
    const followers = candidates.filter((p) => !isStuck(p));
    const stuck = candidates.filter((p) => isStuck(p));
    if (!candidates.length) return;

    following = true;
    try {
      for (const follower of followers) {
        await moveActorToCell(follower, location, { slot: "right" });
      }
    } finally {
      following = false;
    }
    await ChatMessage.create({
      speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
      content: `
        <div class="battle-royale lover-pairs">
          ${
            followers.length
              ? `<p>👥 ${game.i18n.format("BR.Actions.TeamFollow", {
                  team,
                  names: followers.map((p) => p.name).join(", "),
                  name: actor.name,
                  cell: location,
                })}</p>`
              : ""
          }
          ${
            stuck.length
              ? `<p class="br-action-note">🕸 ${game.i18n.format("BR.Actions.FollowStuck", {
                  names: stuck.map((p) => p.name).join(", "),
                })}</p>`
              : ""
          }
        </div>`,
    });
  });
}
