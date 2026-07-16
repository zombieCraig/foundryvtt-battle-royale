import { SYSTEM_ID } from "./cards.js";
import { PlayerModel } from "./player-model.js";
import { PlayerSheet } from "./player-sheet.js";
import { ItemModel } from "./item-model.js";
import { ItemSheet } from "./item-sheet.js";
import { registerSingleItemLimit } from "./items.js";
import { registerHiddenMarker, registerUnhideTriggers } from "./hide.js";
import { assertItemTable } from "./data/items.js";
import { createIslandScene } from "./auto-scene.js";
import { runGameSetup } from "./setup.js";
import { drawZoneOverlay, getRound, nextRound, setRound } from "./rounds.js";
import {
  BRCombat,
  BRCombatant,
  BRCombatTracker,
  createGameCombat,
  getGameCombat,
  registerDeathMarker,
} from "./combat.js";
import { RoundTracker } from "./round-tracker.js";
import { registerActionDice, registerActionDiceDSN } from "./action-dice.js";
import { rollAction, registerActionCards } from "./actions.js";
import { registerLocationHooks } from "./location.js";
import { registerLoverHooks } from "./lovers.js";
import { registerTeamFollow } from "./teams.js";
import { assertActionTables } from "./data/actions.js";
import { registerEndgameTriggers, runFinalDay, resetEndgame } from "./endgame.js";
import { registerTokenOrder, cleanupBodies } from "./tokens.js";

Hooks.once("init", () => {
  // Before anything can parse a roll formula — the personality dice extend
  // the roll grammar (1da, 1db, ...).
  registerActionDice();
  assertActionTables();
  assertItemTable();

  CONFIG.Actor.dataModels.player = PlayerModel;
  CONFIG.Item.dataModels.item = ItemModel;
  CONFIG.Combat.documentClass = BRCombat;
  CONFIG.Combatant.documentClass = BRCombatant;
  CONFIG.ui.combat = BRCombatTracker;

  // Namespaced collection path is valid on both v13 and v14 (bare `Actors` is deprecated).
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, PlayerSheet, {
    types: ["player"],
    makeDefault: true,
    label: "BR.Sheet.Player",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, ItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "BR.Sheet.Item",
  });

  game.settings.register(SYSTEM_ID, "sceneCreated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(SYSTEM_ID, "setupDone", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  // Current round; 0 = game not started. Zones + widget derive from it, so a
  // change on the GM client re-syncs every client's map and tracker.
  game.settings.register(SYSTEM_ID, "round", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => {
      drawZoneOverlay();
      RoundTracker.rerender();
    },
  });

  // Order the endgame zones consume the four center squares (indices into
  // CENTER_CELLS). Shuffled by Game Setup; the last is never lethal.
  game.settings.register(SYSTEM_ID, "centerOrder", {
    scope: "world",
    config: false,
    type: Array,
    default: [0, 1, 2, 3],
  });

  // Armed trap hazards by cell: { [cellLabel]: { index, passed } }. Swept at
  // every round start; cleared by Game Setup.
  game.settings.register(SYSTEM_ID, "armedTraps", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  // Endgame state (book: Overseer's Decree, Impatience, Final Reckoning).
  // showdownRound doubles as the zone-freeze clamp (0 = no Showdown yet).
  game.settings.register(SYSTEM_ID, "showdownRound", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => {
      drawZoneOverlay();
      RoundTracker.rerender();
    },
  });

  // Did anyone die this round? Feeds the Overseer's Impatience counter.
  game.settings.register(SYSTEM_ID, "deathThisRound", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  // Consecutive deathless rounds since the Decree (3 warns, 4+ detonates).
  game.settings.register(SYSTEM_ID, "deathlessRounds", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });

  // A Final Reckoning card has been posted and awaits its resolve button.
  game.settings.register(SYSTEM_ID, "reckoningRolled", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  // The victory (or no-winners) card has been posted.
  game.settings.register(SYSTEM_ID, "gameOver", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => RoundTracker.rerender(),
  });

  game.battleroyale = {
    setup: runGameSetup,
    nextRound,
    setRound,
    tracker: () => RoundTracker.open(),
    rollAction,
    finalDay: runFinalDay,
    resetEndgame,
    cleanupBodies,
  };
});

registerActionDiceDSN();
registerActionCards();
registerLocationHooks();
registerLoverHooks();
// After the lover hooks: on one update the lover found-flip/follow runs
// before the team drags the rest of the group along.
registerTeamFollow();
registerDeathMarker();
registerTokenOrder();
registerEndgameTriggers();
registerSingleItemLimit();
registerHiddenMarker();
registerUnhideTriggers();

Hooks.on("canvasReady", () => drawZoneOverlay());

// Tokenless combatants never re-render the tracker on actor updates (core
// only does that via placed tokens), so refresh it when Dead flips.
Hooks.on("updateActor", (actor, changed) => {
  if (actor.type === "player" && foundry.utils.hasProperty(changed, "system.dead")) {
    ui.combat?.render();
  }
});

// Keep the widget's "up now" line current as turns cycle within a round.
Hooks.on("updateCombat", () => RoundTracker.rerender());
Hooks.on("deleteCombat", () => RoundTracker.rerender());

Hooks.once("ready", async () => {
  await createIslandScene();
  if (!game.user.isGM) return;
  // Offer game setup once per world; the Game Setup macro re-runs it anytime.
  if (!game.settings.get(SYSTEM_ID, "setupDone")) {
    await game.settings.set(SYSTEM_ID, "setupDone", true);
    await runGameSetup();
    return;
  }
  RoundTracker.open();
  // Mid-game worlds without a turn-order encounter (set up before this
  // feature, or the GM clicked End Combat): recreate it at the current round.
  const players = game.actors.filter((a) => a.type === "player");
  if (players.length && getRound() >= 1 && !getGameCombat()) {
    const combat = await createGameCombat(players, { round: getRound() });
    await combat.ensureRoundOrder();
  }
});
