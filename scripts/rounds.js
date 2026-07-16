import { SYSTEM_ID } from "./cards.js";
import { getGameCombat } from "./combat.js";
import { WARNING_ROUNDS, LETHAL_ROUNDS, MAX_ROUND, ESCALATION } from "./data/tables.js";
import { expireDebuffs } from "./debuffs.js";
import { sweepTraps } from "./traps.js";
// Cycle with endgame.js (it imports our zone accessors) — safe because both
// sides only reference the imports inside function bodies.
import { endgameRoundChecks } from "./endgame.js";

const GRID_CELLS = 10;
const HIGHLIGHT_LAYER = "br-zones";
const WARN_COLOR = 0xffcc00;
const LETHAL_COLOR = 0xcc0000;

// The four center squares (E5, E6, F6, F5), clockwise from top-left. The
// `centerOrder` world setting stores a permutation of indices into this list:
// the order the endgame zones (warning/lethal pairs 5-7) consume them. The
// last square in the order is never marked lethal (book: "the last area will
// never be marked for termination").
export const CENTER_CELLS = [
  { row: 4, col: 4 },
  { row: 4, col: 5 },
  { row: 5, col: 5 },
  { row: 5, col: 4 },
];

export const getRound = () => game.settings.get(SYSTEM_ID, "round");
export const getCenterOrder = () => game.settings.get(SYSTEM_ID, "centerOrder");

/** Round the Overseer's Decree fired (0 = no Showdown yet). */
export const getShowdownRound = () => game.settings.get(SYSTEM_ID, "showdownRound");

/**
 * The round all zone math should use. The Showdown freezes zone progression
 * (book: "Zone Freeze"), so once declared the effective round is clamped to
 * the decree round. Escalation is NOT clamped — desperation keeps rising.
 */
export function effectiveZoneRound(round = getRound()) {
  const showdown = getShowdownRound();
  return showdown ? Math.min(round, showdown) : round;
}

/**
 * How many warning/lethal zone events have fired by this round. Warnings fire
 * at the start of their round; skulls at the end (i.e. once play moves past).
 */
export function zoneCounts(round) {
  return {
    warned: WARNING_ROUNDS.filter((r) => r <= round).length,
    lethal: LETHAL_ROUNDS.filter((r) => r < round).length,
  };
}

/** Desperation Escalation tier for a round. */
export function escalation(round) {
  return ESCALATION.find((tier) => round <= tier.max);
}

/** Ring index of a cell, 1 (outermost) to 5 (center 2×2). */
const ringOf = (row, col) => Math.min(row, col, GRID_CELLS - 1 - row, GRID_CELLS - 1 - col) + 1;

/**
 * Zone state of one cell: "lethal", "warned", or null. Zone events 1-4 close
 * whole rings; events 5-7 consume the center squares one at a time in
 * `centerOrder`. The final center square never turns lethal.
 */
export function cellState(row, col, counts, centerOrder) {
  const ring = ringOf(row, col);
  if (ring <= 4) {
    if (ring <= Math.min(counts.lethal, 4)) return "lethal";
    if (ring <= Math.min(counts.warned, 4)) return "warned";
    return null;
  }
  const cell = CENTER_CELLS.findIndex((c) => c.row === row && c.col === col);
  const position = centerOrder.indexOf(cell);
  if (position < counts.lethal - 4) return "lethal";
  if (position < counts.warned - 4) return "warned";
  return null;
}

const rowLetter = (row) => String.fromCharCode(65 + row);

/** Human name for zone event #i (1-7): a ring, or a single center square. */
export function zoneName(i, centerOrder) {
  if (i <= 4) {
    return game.i18n.format("BR.Rounds.Ring", {
      n: i,
      rows: `${rowLetter(i - 1)}/${rowLetter(GRID_CELLS - i)}`,
      cols: `${i}/${GRID_CELLS + 1 - i}`,
    });
  }
  const cell = CENTER_CELLS[centerOrder[i - 5]];
  return game.i18n.format("BR.Rounds.CenterSquare", {
    cell: `${rowLetter(cell.row)}${cell.col + 1}`,
  });
}

/** Is this the auto-created island scene the zone overlay applies to? */
export const isIslandScene = (scene) =>
  !!scene && (!!scene.flags?.[SYSTEM_ID]?.autoCreated || scene.name === "Hanashima Island");

/**
 * Tint the island grid to match the current round's zones: yellow warning,
 * red lethal. Pure client-side draw via the grid highlight layer — redrawn on
 * canvasReady and whenever the `round` setting changes on any client.
 */
export function drawZoneOverlay() {
  if (!canvas?.ready || !isIslandScene(canvas.scene)) return;
  const grid = canvas.interface.grid;
  grid.addHighlightLayer(HIGHLIGHT_LAYER);
  grid.clearHighlightLayer(HIGHLIGHT_LAYER);

  const counts = zoneCounts(effectiveZoneRound());
  if (!counts.warned) return;
  const centerOrder = getCenterOrder();
  const { sceneX, sceneY } = canvas.scene.dimensions;
  const size = canvas.scene.grid.size;
  for (let row = 0; row < GRID_CELLS; row++) {
    for (let col = 0; col < GRID_CELLS; col++) {
      const state = cellState(row, col, counts, centerOrder);
      if (!state) continue;
      grid.highlightPosition(HIGHLIGHT_LAYER, {
        x: sceneX + col * size,
        y: sceneY + row * size,
        color: state === "lethal" ? LETHAL_COLOR : WARN_COLOR,
        alpha: state === "lethal" ? 0.45 : 0.35,
      });
    }
  }
}

// Duplicate of movement.js parseCell — importing it would create a static
// cycle (movement.js imports this module).
function parseLoc(label) {
  const match = /^([A-J])(10|[1-9])$/i.exec(label?.trim() ?? "");
  if (!match) return null;
  return { row: match[1].toUpperCase().charCodeAt(0) - 65, col: Number(match[2]) - 1 };
}

/** Kill every living player standing in a lethal cell as of `round`. */
async function sweepLethalZones(round, centerOrder, lines) {
  const counts = zoneCounts(round);
  if (!counts.lethal) return;
  for (const p of game.actors.filter((a) => a.type === "player" && !a.system.dead)) {
    const cell = parseLoc(p.system.location);
    if (!cell || cellState(cell.row, cell.col, counts, centerOrder) !== "lethal") continue;
    // brEndgame: the single checkEndgame in endgameRoundChecks handles the
    // aftermath — per-death hook checks racing this loop would misfire.
    await p.update({ "system.dead": true }, { brEndgame: true });
    lines.push(
      `<p class="lethal">💀 ${game.i18n.format("BR.Rounds.ZoneKilled", {
        name: p.name,
        cell: p.system.location,
      })}</p>`,
    );
  }
}

/** Post the round advance (and any zone/escalation events) to chat. */
export async function announceRound(from, to) {
  const centerOrder = getCenterOrder();
  const lines = [];
  // The Showdown freezes zone progression — no new warnings or skulls.
  if (!getShowdownRound()) {
    // Skulls fire when play moves past their round; warnings on arrival.
    LETHAL_ROUNDS.forEach((r, i) => {
      if (r >= from && r < to) {
        lines.push(
          `<p class="lethal">💀 ${game.i18n.format("BR.Rounds.LethalNow", {
            zone: zoneName(i + 1, centerOrder),
          })}</p>`,
        );
      }
    });
    WARNING_ROUNDS.forEach((r, i) => {
      if (r > from && r <= to) {
        lines.push(
          `<p class="warning">⚠️ ${game.i18n.format("BR.Rounds.WarningNow", {
            zone: zoneName(i + 1, centerOrder),
          })}</p>`,
        );
      }
    });
  }
  // Sweep on every advance (not just lethal-event rounds) — catches anyone
  // hand-placed into an already-destroyed square.
  await sweepLethalZones(effectiveZoneRound(to), centerOrder, lines);
  const tier = escalation(to);
  if (tier !== escalation(from)) {
    lines.push(`<p class="escalation">${game.i18n.format("BR.Rounds.EscalationChat", tier)}</p>`);
  }
  // Countdown before the trap sweep, so a re-failed save refreshes the full
  // escape timer instead of being decremented in the same breath.
  await expireDebuffs(lines);
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
    content: `
      <div class="battle-royale round-advance">
        <h3>${game.i18n.format("BR.Rounds.Round", { n: to })}</h3>
        ${lines.join("\n")}
      </div>`,
  });
  // Armed traps re-trigger after the round card so their saves read in order.
  await sweepTraps();
  // Decree / Impatience / Final Team / Reckoning — after the round card so
  // the Overseer's endgame announcements read in order.
  await endgameRoundChecks();
}

/** Set the current round (GM only). Advancing announces events in chat. */
export async function setRound(round) {
  if (!game.user.isGM) {
    ui.notifications.warn("BR.Setup.GMOnly", { localize: true });
    return;
  }
  const from = getRound();
  const to = Math.clamp(round, 0, MAX_ROUND);
  if (to === from) return;
  const combat = getGameCombat();
  if (combat) {
    // The combat is the round master: its _onUpdate reshuffles the turn
    // order, mirrors the setting, and announces. turnEvents: false skips
    // core's per-skipped-turn event dispatch (huge on multi-round jumps).
    await combat.update({ round: to, turn: to > 0 ? 0 : null }, { turnEvents: false });
    return;
  }
  await game.settings.set(SYSTEM_ID, "round", to);
  if (to > from) await announceRound(from, to);
}

export const nextRound = () => setRound(getRound() + 1);
export const prevRound = () => setRound(getRound() - 1);
