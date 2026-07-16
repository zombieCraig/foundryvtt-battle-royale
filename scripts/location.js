import { isIslandScene } from "./rounds.js";

const GRID_CELLS = 10;

/**
 * Grid cell label ("E5") for a scene point, or "" when off the 10×10 map.
 * Computed relative to the scene rect (same math as the zone overlay), so a
 * padded custom map still resolves correctly.
 */
export function cellLabel(scene, { x, y }) {
  const { sceneX, sceneY } = scene.dimensions;
  const size = scene.grid.size;
  const row = Math.floor((y - sceneY) / size);
  const col = Math.floor((x - sceneX) / size);
  if (row < 0 || row >= GRID_CELLS || col < 0 || col >= GRID_CELLS) return "";
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

/** Scene point at the center of a cell label ("E5"), or null if unparseable. */
export function cellCenter(scene, label) {
  const match = /^([A-J])(10|[1-9])$/i.exec(label?.trim() ?? "");
  if (!match) return null;
  const row = match[1].toUpperCase().charCodeAt(0) - 65;
  const col = Number(match[2]) - 1;
  const { sceneX, sceneY } = scene.dimensions;
  const size = scene.grid.size;
  return { x: sceneX + (col + 0.5) * size, y: sceneY + (row + 0.5) * size };
}

/**
 * Pan to and ping a player's position: their token on the viewed scene, or
 * their roster Location cell on the island map.
 */
export async function pingPlayer(actor, { warn = true } = {}) {
  if (!canvas?.ready) return;
  const token = actor?.getActiveTokens()[0];
  const point = token
    ? token.center
    : isIslandScene(canvas.scene)
      ? cellCenter(canvas.scene, actor?.system.location)
      : null;
  if (!point) {
    if (warn) ui.notifications.warn(game.i18n.format("BR.Actions.NoPing", { name: actor?.name }));
    return;
  }
  await canvas.animatePan({ x: point.x, y: point.y });
  await canvas.ping(point);
}

async function syncLocation(tokenDoc, point) {
  const actor = tokenDoc.actor;
  if (actor?.type !== "player" || !isIslandScene(tokenDoc.parent)) return;
  const label = cellLabel(tokenDoc.parent, point);
  if (label && label !== actor.system.location) {
    await actor.update({ "system.location": label });
  }
}

/**
 * Keep each player's Location field in sync with their token's grid cell.
 * Both hooks fire on every client, so only the active GM writes.
 */
export function registerLocationHooks() {
  Hooks.on("moveToken", (tokenDoc, movement) => {
    if (!game.user.isActiveGM) return;
    syncLocation(tokenDoc, tokenDoc.getCenterPoint(movement.destination));
  });
  Hooks.on("createToken", (tokenDoc) => {
    if (!game.user.isActiveGM) return;
    syncLocation(tokenDoc, tokenDoc.getCenterPoint());
  });
}
