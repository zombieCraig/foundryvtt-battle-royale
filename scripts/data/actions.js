// Action tables hand-copied from the Battle Royale book (v2.0 PDF).
import { SYSTEM_ID } from "../cards.js";
import { PERSONALITIES } from "./tables.js";

export const actionIcon = (id) => `systems/${SYSTEM_ID}/assets/actions/${id}.webp`;

// The nine actions plus In Love (book pp.8-11). `key` indexes the i18n strings
// (BR.Actions.<Key>.Name / .Desc); `successRoll` puts a Success Roll button on
// the chat card. Overseer resolves to another action first; Mimic and In Love
// are resolved manually (the card explains how).
export const ACTIONS = {
  overseer: { code: "O", key: "Overseer", successRoll: false },
  comfort: { code: "C", key: "Comfort", successRoll: true },
  hide: { code: "H", key: "Hide", successRoll: true },
  convince: { code: "V", key: "Convince", successRoll: true },
  attack: { code: "A", key: "Attack", successRoll: true },
  search: { code: "S", key: "Search", successRoll: true },
  move: { code: "M", key: "Move", successRoll: true },
  mimic: { code: "?", key: "Mimic", successRoll: false },
  inlove: { code: "<3", key: "InLove", successRoll: false },
  abandon: { code: "X", key: "Abandon", successRoll: true },
};

// Personality Table action columns, 1d6 (book p.18). Keys are the EXACT
// display strings from PERSONALITIES (they're stored on the actor).
export const PERSONALITY_COLUMNS = {
  Thinking: ["overseer", "overseer", "overseer", "overseer", "overseer", "overseer"],
  Humanitarian: ["comfort", "comfort", "hide", "search", "move", "move"],
  Angry: ["attack", "attack", "search", "move", "move", "move"],
  Afraid: ["hide", "hide", "attack", "move", "move", "move"],
  Exhausted: ["hide", "hide", "attack", "search", "move", "move"],
  "Sick / Injured": ["hide", "convince", "attack", "search", "move", "move"],
  Silent: ["search", "hide", "attack", "move", "move", "move"],
  Outspoken: ["convince", "search", "attack", "move", "move", "move"],
  Aggressive: ["attack", "attack", "attack", "search", "move", "move"],
  Deceitful: ["convince", "search", "attack", "hide", "move", "move"],
  Simple: ["mimic", "mimic", "mimic", "mimic", "mimic", "mimic"],
  Anxious: ["hide", "hide", "search", "search", "move", "move"],
  Bully: ["attack", "attack", "search", "convince", "move", "move"],
  Political: ["convince", "convince", "attack", "search", "move", "move"],
  Depressed: ["hide", "search", "comfort", "move", "move", "move"],
  "In Love": ["inlove", "inlove", "inlove", "inlove", "inlove", "inlove"],
  Religious: ["comfort", "attack", "convince", "move", "move", "move"],
  Unstable: ["hide", "attack", "abandon", "search", "move", "move"],
  Militant: ["attack", "attack", "search", "hide", "move", "move"],
  Leader: ["attack", "convince", "convince", "overseer", "search", "move"],
};

// One Roll denomination letter per personality ("1da", "1db", ...). The roll
// grammar only accepts single letters; core reserves c, d, and f.
const LETTERS = [..."abeghijklmnopqrstuvw"];
export const PERSONALITY_DICE = Object.fromEntries(PERSONALITIES.map((p, i) => [p, LETTERS[i]]));

// Dice So Nice die theme per personality, so the die color itself signals who
// is acting. All backgrounds are light tints (the action icons are black line
// art and must stay readable on every face); hues are loosely thematic.
export const PERSONALITY_COLORS = {
  Thinking: { background: "#f2efe6", foreground: "#1a1a1a" },
  Humanitarian: { background: "#a8dcc9", foreground: "#1a1a1a" },
  Angry: { background: "#f0a3a3", foreground: "#1a1a1a" },
  Afraid: { background: "#cfc7e8", foreground: "#1a1a1a" },
  Exhausted: { background: "#d9d2b8", foreground: "#1a1a1a" },
  "Sick / Injured": { background: "#cfe0a8", foreground: "#1a1a1a" },
  Silent: { background: "#bfc7cc", foreground: "#1a1a1a" },
  Outspoken: { background: "#f5c58a", foreground: "#1a1a1a" },
  Aggressive: { background: "#e08a6d", foreground: "#1a1a1a" },
  Deceitful: { background: "#9ec9ae", foreground: "#1a1a1a" },
  Simple: { background: "#e3e3e3", foreground: "#1a1a1a" },
  Anxious: { background: "#f0e08a", foreground: "#1a1a1a" },
  Bully: { background: "#d9a878", foreground: "#1a1a1a" },
  Political: { background: "#9fb3e0", foreground: "#1a1a1a" },
  Depressed: { background: "#aebfcc", foreground: "#1a1a1a" },
  "In Love": { background: "#f2b3d1", foreground: "#1a1a1a" },
  Religious: { background: "#ead89a", foreground: "#1a1a1a" },
  Unstable: { background: "#c99ad9", foreground: "#1a1a1a" },
  Militant: { background: "#b3bd8a", foreground: "#1a1a1a" },
  Leader: { background: "#b09ccc", foreground: "#1a1a1a" },
};

// Overseer random action, 1d6 (book p.11).
export const OVERSEER_RANDOM = ["comfort", "convince", "hide", "search", "attack", "move"];

// Move direction, 2d6 (book p.8).
export const MOVE_DIRECTIONS = {
  2: "NW",
  3: "NE",
  4: "NE",
  5: "N",
  6: "S",
  7: "E",
  8: "W",
  9: "SW",
  10: "SW",
  11: "SW",
  12: "SE",
};

/** Dev drift guard: every personality needs a 6-slot column, die, and color. */
export function assertActionTables() {
  for (const p of PERSONALITIES) {
    console.assert(
      PERSONALITY_COLUMNS[p]?.length === 6 && PERSONALITY_DICE[p] && PERSONALITY_COLORS[p],
      `Battle Royale: incomplete action tables for personality "${p}"`,
    );
  }
}
