import { isIslandScene } from "./rounds.js";
import { parseCell, landCells } from "./movement.js";

const rand = (n) => Math.floor(Math.random() * n);

/**
 * Place (or move) each player's island token at their starting cell. Four
 * half-size tokens tile a square; later arrivals stack on the quadrants.
 * The createToken/moveToken hooks sync each player's Location field.
 */
async function placeTokens(scene, placements) {
  const { sceneX, sceneY } = scene.dimensions;
  const size = scene.grid.size;
  const perCell = {};
  const creates = [];
  const moves = [];
  for (const { actor, label } of placements) {
    const cell = parseCell(label);
    if (!cell) continue;
    const i = perCell[label] ?? 0;
    perCell[label] = i + 1;
    const x = sceneX + cell.col * size + (i % 2) * (size / 2);
    const y = sceneY + cell.row * size + (Math.floor(i / 2) % 2) * (size / 2);
    const existing = scene.tokens.find((t) => t.actorId === actor.id);
    if (existing) moves.push({ _id: existing.id, x, y });
    else creates.push((await actor.getTokenDocument({ x, y })).toObject());
  }
  if (moves.length) await scene.updateEmbeddedDocuments("Token", moves);
  if (creates.length) await scene.createEmbeddedDocuments("Token", creates);
}

/** Ask the GM for the single starting cell (Roll Call / Centralized). */
async function promptStartCell(dispersal) {
  const cells = landCells();
  const options = cells.map((c) => `<option value="${c}">${c}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "BR.Dispersal.Title", icon: "fa-solid fa-location-dot" },
    content: `
      <p>${game.i18n.format("BR.Dispersal.Prompt", { method: dispersal })}</p>
      <div class="form-group">
        <label>${game.i18n.localize("BR.Dispersal.Cell")}</label>
        <select name="cell">${options}</select>
      </div>`,
    buttons: [
      {
        action: "place",
        label: "BR.Dispersal.Place",
        icon: "fa-solid fa-location-dot",
        default: true,
        callback: (event, button) => button.form.elements.cell.value,
      },
      { action: "random", label: "BR.Dispersal.Random", icon: "fa-solid fa-dice" },
      { action: "skip", label: "BR.Dispersal.Skip", icon: "fa-solid fa-xmark" },
    ],
    rejectClose: false,
  });
  if (!result || result === "skip") return null;
  return result === "random" ? cells[rand(cells.length)] : result;
}

/**
 * Book p.7: the Dispersal Method sets initial placement. Roll Call and
 * Centralized start everyone at one location (GM-chosen or random); Dispersed
 * rolls a random land cell per player. Interpretation: a water roll re-rolls
 * to a safe cell — the book offers "consider them dead" or "re-roll / nearest
 * safe" and we take the fair option. Roll Call's staged release stays manual:
 * the Overseer decides who has entered the game each round.
 */
export async function placePlayers(dispersal) {
  const scene = game.scenes.find(isIslandScene);
  if (!scene) return;
  const players = game.actors.filter((a) => a.type === "player" && !a.system.dead);
  if (!players.length) return;
  const cells = landCells();
  let placements;
  let lines;
  if (dispersal === "Dispersed") {
    placements = players.map((actor) => ({ actor, label: cells[rand(cells.length)] }));
    lines = [
      `<p>${game.i18n.format("BR.Dispersal.PlacedScattered", { n: players.length })}</p>`,
      ...placements.map(
        ({ actor, label }) => `<p class="br-action-note">📍 ${actor.name} — ${label}</p>`,
      ),
    ];
  } else {
    const label = await promptStartCell(dispersal);
    if (!label) return;
    placements = players.map((actor) => ({ actor, label }));
    lines = [
      `<p>${game.i18n.format("BR.Dispersal.PlacedAll", { n: players.length, cell: label })}</p>`,
    ];
    if (dispersal === "Roll Call") {
      lines.push(
        `<p class="br-action-note">${game.i18n.localize("BR.Dispersal.RollCallNote")}</p>`,
      );
    }
  }
  await placeTokens(scene, placements);
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
    content: `
      <div class="battle-royale round-advance">
        <h3>📍 ${game.i18n.localize("BR.Dispersal.Title")}</h3>
        ${lines.join("\n")}
      </div>`,
  });
}
