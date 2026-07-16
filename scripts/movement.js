import {
  effectiveZoneRound,
  getCenterOrder,
  zoneCounts,
  cellState,
  isIslandScene,
} from "./rounds.js";

const GRID_CELLS = 10;

// Hanashima water squares — impassable.
// prettier-ignore
const WATER_CELLS = new Set([
  "A1", "A2", "A5", "A10", "B1", "B2", "B9", "B10", "C1", "C2",
  "D1", "D10", "E10", "F10", "G1", "H1", "H2", "H10",
  "I1", "I2", "I4", "I5", "J1", "J2", "J3", "J4", "J5", "J6", "J7",
]);

// Row A is the top of the map, so north is row - 1 (matches cellLabel).
export const DIRECTION_DELTAS = {
  N: [-1, 0],
  NE: [-1, 1],
  E: [0, 1],
  SE: [1, 1],
  S: [1, 0],
  SW: [1, -1],
  W: [0, -1],
  NW: [-1, -1],
};

const CLOCKWISE = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Parse a cell label ("E5") into {row, col}, or null if unparseable. */
export function parseCell(label) {
  const match = /^([A-J])(10|[1-9])$/i.exec(label?.trim() ?? "");
  if (!match) return null;
  return { row: match[1].toUpperCase().charCodeAt(0) - 65, col: Number(match[2]) - 1 };
}

const cellName = (row, col) => `${String.fromCharCode(65 + row)}${col + 1}`;

/** All land (non-water) cell labels — the candidate starting locations. */
export function landCells() {
  const out = [];
  for (let row = 0; row < GRID_CELLS; row++) {
    for (let col = 0; col < GRID_CELLS; col++) {
      const label = cellName(row, col);
      if (!WATER_CELLS.has(label)) out.push(label);
    }
  }
  return out;
}

/** Book: players never move into water, a destroyed, or marked-for-destruction area. */
export function isOpen(row, col, counts, centerOrder) {
  if (row < 0 || row >= GRID_CELLS || col < 0 || col >= GRID_CELLS) return false;
  if (WATER_CELLS.has(cellName(row, col))) return false;
  return !cellState(row, col, counts, centerOrder);
}

/**
 * Where a move from `fromLabel` toward `direction` actually ends up. A 2d6
 * of 4+ (`reached`) tries the intended area first; otherwise — and whenever a
 * square is blocked or off-map — rotate clockwise to the first open square.
 * Returns {label, direction, fallback} or null when boxed in (stay put).
 */
export function resolveDestination(fromLabel, direction, reached) {
  const from = parseCell(fromLabel);
  if (!from) return null;
  const counts = zoneCounts(effectiveZoneRound());
  const centerOrder = getCenterOrder();
  const start = CLOCKWISE.indexOf(direction);
  for (let i = reached ? 0 : 1; i < CLOCKWISE.length; i++) {
    const dir = CLOCKWISE[(start + i) % CLOCKWISE.length];
    const [dr, dc] = DIRECTION_DELTAS[dir];
    const row = from.row + dr;
    const col = from.col + dc;
    if (isOpen(row, col, counts, centerOrder)) {
      return { label: cellName(row, col), direction: dir, fallback: i > 0 };
    }
  }
  return null;
}

/**
 * Move a player to a cell: their island-scene token if they have one (the
 * moveToken hook then syncs system.location), else the Location field
 * directly. Two half-size tokens share a square — the mover takes the left
 * slot, a following lover the right.
 */
export async function moveActorToCell(actor, label, { slot = "left" } = {}) {
  const cell = parseCell(label);
  if (!cell) return;
  const scene = game.scenes.find(isIslandScene);
  const token = scene?.tokens.find((t) => t.actorId === actor?.id);
  if (!token) {
    if (actor.system.location !== label) await actor.update({ "system.location": label });
    return;
  }
  const { sceneX, sceneY } = scene.dimensions;
  const size = scene.grid.size;
  const x = sceneX + cell.col * size + (slot === "right" ? size / 2 : 0);
  const y = sceneY + cell.row * size + size / 4;
  await token.update({ x, y });
}
