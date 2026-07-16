import { SYSTEM_ID, SUITS, RANKS } from "./cards.js";
import { NAME_TABLES, REGIONS } from "./data/names.js";
import { PERSONALITIES, WAKING_SCENES } from "./data/tables.js";
import { createGameCombat, deleteGameCombats } from "./combat.js";
import { pairLovers } from "./lovers.js";
import { giveItem } from "./items.js";
import { ITEMS } from "./data/items.js";
import { RoundTracker } from "./round-tracker.js";
import { resetEndgame } from "./endgame.js";
import { clearTraps } from "./traps.js";
import { placePlayers } from "./dispersal.js";

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

const ROMAN = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const FACE_RANKS = ["j", "q", "k", "a"];
const RED_SUITS = ["hearts", "diamonds"];

/** All 52 cards as {suit, rank}. */
function fullDeck() {
  return Object.keys(SUITS).flatMap((suit) => Object.keys(RANKS).map((rank) => ({ suit, rank })));
}

function shuffled(deck) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Deal the starting cards for the chosen roster size. */
function dealCards(countMode, customCount) {
  switch (countMode) {
    case "face":
      return shuffled(fullDeck().filter((c) => FACE_RANKS.includes(c.rank)));
    case "full":
      return shuffled(fullDeck());
    case "custom": {
      const n = Math.clamp(customCount || 12, 1, 52);
      return shuffled(fullDeck()).slice(0, n);
    }
    default:
      return shuffled(fullDeck()).slice(0, 12);
  }
}

/**
 * Diversity roll (book p.4): 1d10 per player; if the roll equals or exceeds
 * the diversity level, roll 1d6 for a new general region. Rolling the default
 * region again means "pick a nearby one" — a different sub-table within it.
 */
function pickNameTable(defaultTable, diversity) {
  if (rand(10) + 1 < diversity) return defaultTable;
  const regionKey = Object.keys(REGIONS)[rand(6)];
  const tables = REGIONS[regionKey].tables;
  if (regionKey === NAME_TABLES[defaultTable].region) {
    return pick(tables.filter((t) => t !== defaultTable));
  }
  return pick(tables);
}

function pickGender(card, genderMode) {
  if (genderMode === "random") return rand(2) ? "female" : "male";
  const red = RED_SUITS.includes(card.suit);
  const redIsFemale = genderMode === "redFemale";
  return red === redIsFemale ? "female" : "male";
}

/**
 * Unique name from the table. A first name alone is used unless it collides
 * with one already in play, in which case a surname is rolled in to
 * disambiguate; if that still collides, fall back to Roman numerals.
 */
function pickName(tableKey, gender, usedNames) {
  const table = NAME_TABLES[tableKey];
  const base = pick(table[gender]);
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  for (let attempt = 0; attempt < table.surname.length; attempt++) {
    const name = `${base} ${pick(table.surname)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  for (const suffix of ROMAN) {
    const name = suffix ? `${base} ${suffix}` : base;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  return `${base} ${usedNames.size}`; // exhausted surnames and numerals: give up gracefully
}

function setupFormHtml() {
  const l = (k) => game.i18n.localize(`BR.Setup.${k}`);
  const regionOptions = Object.values(REGIONS)
    .map(
      (region) =>
        `<optgroup label="${region.label}">` +
        region.tables.map((t) => `<option value="${t}">${NAME_TABLES[t].label}</option>`).join("") +
        `</optgroup>`,
    )
    .join("");
  const hasPlayers = !!game.actors.find((a) => a.type === "player");
  return `
    <div class="form-group">
      <label>${l("Count")}</label>
      <select name="countMode">
        <option value="random12">${l("CountRandom12")}</option>
        <option value="face">${l("CountFace")}</option>
        <option value="full">${l("CountFull")}</option>
        <option value="custom">${l("CountCustom")}</option>
      </select>
    </div>
    <div class="form-group">
      <label>${l("CustomCount")}</label>
      <input type="number" name="customCount" value="12" min="1" max="52" step="1" disabled />
    </div>
    <div class="form-group">
      <label>${l("Gender")}</label>
      <select name="genderMode">
        <option value="redFemale">${l("GenderRedFemale")}</option>
        <option value="redMale">${l("GenderRedMale")}</option>
        <option value="random">${l("GenderRandom")}</option>
      </select>
    </div>
    <div class="form-group">
      <label>${l("Region")}</label>
      <select name="region">
        <option value="random">${l("RegionRandom")}</option>
        ${regionOptions}
      </select>
    </div>
    <div class="form-group">
      <label>${l("Diversity")}</label>
      <input type="number" name="diversity" value="5" min="1" max="10" step="1" />
      <p class="hint">${l("DiversityHint")}</p>
    </div>
    ${
      hasPlayers
        ? `<div class="form-group">
            <label>${l("Clear")}</label>
            <input type="checkbox" name="clear" checked />
            <p class="hint">${l("ClearHint")}</p>
          </div>`
        : ""
    }`;
}

async function promptSetupOptions() {
  return foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("BR.Setup.Title"), icon: "fa-solid fa-users" },
    position: { width: 420 },
    content: setupFormHtml(),
    render: (event, dialog) => {
      // v13 passes the DialogV2 instance; v12-era signatures passed the element.
      const root = dialog.element ?? dialog;
      const form = root.querySelector("form");
      const mode = form.elements.countMode;
      const custom = form.elements.customCount;
      mode.addEventListener("change", () => (custom.disabled = mode.value !== "custom"));
    },
    buttons: [
      {
        action: "create",
        label: "BR.Setup.Create",
        icon: "fa-solid fa-dice",
        default: true,
        callback: (event, button) =>
          new foundry.applications.ux.FormDataExtended(button.form).object,
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" },
    ],
    rejectClose: false,
  });
}

/** Delete all player actors and their placed tokens. */
async function clearPlayers() {
  const ids = new Set(game.actors.filter((a) => a.type === "player").map((a) => a.id));
  if (!ids.size) return;
  for (const scene of game.scenes) {
    const tokenIds = scene.tokens.filter((t) => ids.has(t.actorId)).map((t) => t.id);
    if (tokenIds.length) await scene.deleteEmbeddedDocuments("Token", tokenIds);
  }
  await Actor.deleteDocuments([...ids]);
}

/**
 * Starting backpacks (book pp.5, 7): every player rolls once on the Items
 * Table (d100 — 31 and 81 are empty) and the item lands on their card. The
 * haul is whispered to the GM like the lover pairings.
 */
async function rollBackpacks(actors) {
  const players = actors.filter((a) => a.type === "player");
  if (!players.length) return;
  const lines = [];
  for (const player of players) {
    const n = rand(100) + 1;
    const item = ITEMS[n];
    if (item) await giveItem(player, n);
    lines.push(
      `<p>${player.name}: ${item?.name ?? game.i18n.localize("BR.Setup.BackpackNothing")} (${n})</p>`,
    );
  }
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `
      <div class="battle-royale lover-pairs">
        <h3>🎒 ${game.i18n.localize("BR.Setup.Backpacks")}</h3>
        ${lines.join("")}
      </div>`,
  });
}

/** Roll the Waking Up chart (book p.6) and post the scenario to chat. */
async function rollWakingScene(summary) {
  const roll = await new Roll("1d6").evaluate();
  const scene = WAKING_SCENES[roll.total - 1];
  const l = (k) => game.i18n.localize(`BR.Setup.${k}`);
  await ChatMessage.create({
    speaker: { alias: l("Overseer") },
    rolls: [roll],
    content: `
      <div class="battle-royale waking-scene">
        <h3>${l("WakingUp")}: ${scene.name}</h3>
        <p><strong>${l("Dispersal")}:</strong> ${scene.dispersal}</p>
        <p>${scene.description}</p>
        <hr />
        <p>${summary}</p>
      </div>`,
  });
  return scene;
}

/**
 * The initial game setup (book pp.2-6): ask roster questions, roll up the
 * players, and roll the Waking Up scene. Re-runnable via the Game Setup
 * macro to reset the field and play again.
 */
export async function runGameSetup() {
  if (!game.user.isGM) {
    ui.notifications.warn("BR.Setup.GMOnly", { localize: true });
    return;
  }
  const options = await promptSetupOptions();
  if (!options || options === "cancel") return;

  // Any prior game's encounter goes first (before the actors it references).
  await deleteGameCombats();
  if (options.clear) await clearPlayers();

  const defaultTable =
    options.region === "random" ? pick(Object.keys(NAME_TABLES)) : options.region;
  const diversity = Math.clamp(Number(options.diversity) || 5, 1, 10);
  const cards = dealCards(options.countMode, Number(options.customCount));

  // Seed with surviving actor names so re-runs without clearing stay unique.
  const usedNames = new Set(game.actors.map((a) => a.name));
  const players = cards.map((card) => {
    const gender = pickGender(card, options.genderMode);
    const table = pickNameTable(defaultTable, diversity);
    return {
      type: "player",
      name: pickName(table, gender, usedNames),
      system: {
        suit: card.suit,
        rank: card.rank,
        gender,
        region: NAME_TABLES[table].label,
        personality: PERSONALITIES[rand(20)],
      },
    };
  });
  const created = await Actor.createDocuments(players);
  await pairLovers(created);
  await rollBackpacks(created);

  // Fresh game: random endgame order for the center squares, and no leftover
  // Showdown/Impatience/game-over state from the previous game.
  await game.settings.set(SYSTEM_ID, "centerOrder", shuffled([0, 1, 2, 3]));
  await clearTraps();
  await resetEndgame();

  // Dead players sit out the shuffled turn order.
  const trackerConfig = game.settings.get("core", "combatTrackerConfig");
  if (!trackerConfig.skipDefeated) {
    await game.settings.set(
      "core",
      "combatTrackerConfig",
      foundry.utils.mergeObject(trackerConfig, { skipDefeated: true }, { inplace: false }),
    );
  }

  // The turn-order encounter for the whole game: every player (including
  // survivors kept from a previous game), shuffled fresh each round.
  // startCombat's 0→1 round change shuffles round 1, mirrors the `round`
  // world setting, and announces — no explicit round set needed here.
  const combat = await createGameCombat(game.actors.filter((a) => a.type === "player"));
  await combat.startCombat();

  const summary = game.i18n.format("BR.Setup.Summary", {
    count: players.length,
    region: NAME_TABLES[defaultTable].label,
    diversity,
  });
  const wakingScene = await rollWakingScene(summary);
  await placePlayers(wakingScene.dispersal);
  RoundTracker.open();
  ui.notifications.info(game.i18n.format("BR.Setup.Done", { count: players.length }));
}
