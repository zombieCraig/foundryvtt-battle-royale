import { SYSTEM_ID } from "./cards.js";
import { isIslandScene } from "./rounds.js";

const MAP_SRC = `systems/${SYSTEM_ID}/assets/maps/hanashima-island.webp`;
const GRID_CELLS = 10; // book map is a 10×10 grid (cols 1-10, rows A-J)
const GRID_THICKNESS = 3; // core default (1px) is too faint on the island art

/** One-time upgrade: thicken grid lines on a scene created before v0.10.0. */
async function patchIslandGrid() {
  const scene = game.scenes.find(isIslandScene);
  if (!scene || scene.getFlag(SYSTEM_ID, "gridPatched")) return;
  await scene.update({
    "grid.thickness": GRID_THICKNESS,
    [`flags.${SYSTEM_ID}.gridPatched`]: true,
  });
}

/**
 * Create the Hanashima Island scene on first world launch.
 * GM-only, idempotent via a world setting. If the map image is missing the
 * flag is NOT set, so creation retries on the next launch.
 */
export async function createIslandScene() {
  if (!game.users.activeGM?.isSelf) return;
  await patchIslandGrid();
  if (game.settings.get(SYSTEM_ID, "sceneCreated")) return;

  const loadTexture = foundry.canvas.loadTexture ?? globalThis.loadTexture;
  let tex = null;
  try {
    tex = await loadTexture(MAP_SRC);
  } catch {
    tex = null;
  }
  if (!tex) {
    ui.notifications.warn("BR.Scene.MapMissing", { localize: true });
    return;
  }

  const size = Math.round(tex.width / GRID_CELLS);
  const sceneData = {
    name: "Hanashima Island",
    active: true,
    navigation: true,
    width: tex.width,
    height: tex.height,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size,
      thickness: GRID_THICKNESS,
      distance: 1,
      units: "",
    },
    tokenVision: false,
    flags: { [SYSTEM_ID]: { autoCreated: true, gridPatched: true } },
  };
  // v14 moved the background texture (and fog toggle) onto scene levels; the old
  // top-level fields are read-only shims that creation data silently drops.
  if (game.release.generation >= 14) {
    sceneData.levels = [{ name: "Island", background: { src: MAP_SRC } }];
    sceneData.fog = { mode: CONST.FOG_EXPLORATION_MODES.DISABLED };
  } else {
    sceneData.background = { src: MAP_SRC };
    sceneData.fog = { exploration: false };
  }
  await Scene.create(sceneData);
  await game.settings.set(SYSTEM_ID, "sceneCreated", true);
  ui.notifications.info("Battle Royale: Hanashima Island scene created.");
}
