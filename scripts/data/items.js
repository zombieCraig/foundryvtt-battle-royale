/**
 * Items Table (book pp.22-25), rolled as d100 (the book keeps 2d10 aside as
 * percentile dice, p.5). Keyed by roll number; 31 and 81 have no printed
 * entries — the roll finds nothing of value.
 *
 * Fields: `weapon` marks anything that negates the unarmed −1 (book p.18:
 * "Items that grant an 'Attack +X' bonus are always considered weapons");
 * `mods` keys are action ids; `multiTarget` / `areaAffect` / `scoped` are the
 * special properties (Multi-Target and Area Affect are automated in combat;
 * they count +1 in upgrade ties, book p.11); `loseOnFailure` (a drawback — no
 * tie bonus) discards the thrown weapon on a failed attack; `special` is the
 * verbatim rider, surfaced on cards for the Overseer to adjudicate.
 *
 * Pure data, zero imports — the compendium pack builder imports this too.
 */
export const ITEMS = {
  1: { name: "Kitchen Knife", weapon: true },
  2: { name: "9mm Pistol", weapon: true, mods: { attack: 1 } },
  3: { name: "Baseball Bat (Wood)", weapon: true },
  4: { name: "Flashlight", mods: { move: 1 } },
  5: { name: "Crowbar", weapon: true },
  6: { name: ".22 Pistol (Low Caliber)", weapon: true, mods: { attack: 1 } },
  7: { name: "Box Cutter", weapon: true },
  8: { name: "Pipe Wrench", weapon: true },
  9: { name: "Duct Tape", weapon: true, special: "Target Move - 1" },
  10: { name: "Revolver (.38)", weapon: true, mods: { attack: 1 } },
  11: { name: "Hatchet", weapon: true },
  12: { name: "Pump-Action Shotgun", weapon: true, mods: { attack: 2 } },
  13: { name: "Binoculars", mods: { move: 2 } },
  14: { name: "Tire Iron", weapon: true },
  15: { name: "Screwdriver", weapon: true },
  16: { name: "Compact Pistol", weapon: true },
  17: { name: "Molotov Cocktail (x1)", weapon: true, areaAffect: true },
  18: { name: "Rope (15m)", mods: { move: 1 } },
  19: { name: "Combat Knife", weapon: true },
  20: { name: "SMG (e.g., Mac-10)", weapon: true, mods: { attack: 2 } },
  21: { name: "Hunting Rifle (No scope)", weapon: true, mods: { attack: 1 } },
  22: { name: "Basic First Aid Kit", mods: { comfort: 2 } },
  23: { name: "Machete", weapon: true, mods: { attack: 1 } },
  24: { name: "Crossbow", weapon: true, mods: { attack: 1 } },
  25: { name: "Double-Barrel Shotgun", weapon: true, mods: { attack: 2 } },
  26: { name: "Heavy Revolver (.44)", weapon: true, mods: { attack: 2 } },
  27: { name: "Pot Lid (Improvised Shield)", weapon: true, special: "Attacker - 1" },
  28: { name: "Baseball Bat (Metal)", weapon: true },
  29: { name: "Taser", weapon: true, special: "Victim skip next turn" },
  30: { name: "SMG (Uzi)", weapon: true, mods: { attack: 1 }, multiTarget: true },
  32: { name: "Hammer", weapon: true },
  33: { name: "Meat Cleaver", weapon: true },
  34: { name: "Sawed-Off Shotgun", weapon: true, mods: { attack: 2 }, multiTarget: true },
  35: { name: "Throwing Knives (x3)", weapon: true },
  36: { name: "Wrench", weapon: true },
  37: { name: "Tactical Pistol (Threaded barrel)", weapon: true },
  38: { name: "Golf Club", weapon: true },
  39: {
    name: "Smoke Grenade (x1)",
    weapon: true,
    areaAffect: true,
    special: "Victim Attack - 2, Move - 2",
  },
  40: { name: "Assault Rifle (e.g., AKM)", weapon: true, mods: { attack: 3 }, multiTarget: true },
  41: { name: "Zip Ties (x10)", weapon: true, special: "Target Move - 3" },
  42: { name: "Nail Gun", weapon: true },
  43: { name: "Rebar (Sharp)", weapon: true },
  44: { name: "Bowie Knife", weapon: true, mods: { attack: 1 } },
  45: { name: "Semi-Auto Shotgun", weapon: true, mods: { attack: 2 } },
  46: { name: "Multi-tool", mods: { move: 1 } },
  47: { name: "Flare Gun (1 flare)", weapon: true },
  48: { name: "SMG (e.g., MP5)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  49: { name: "Compound Bow", weapon: true, mods: { attack: 1 } },
  50: { name: "Flashbang (x1)", weapon: true, areaAffect: true, special: "Actions - 2" },
  51: { name: "Small Mirror (for peeking)", mods: { move: 1 } },
  52: { name: "Sledgehammer", weapon: true },
  53: { name: "Service Revolver (.357)", weapon: true, mods: { attack: 1 } },
  54: { name: "Carbine (Short-barrel AR)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  55: { name: "Rangefinder", mods: { move: 1 }, special: "Attack + 2 with ranged weapon" },
  56: { name: "Broken Bottle", weapon: true },
  57: {
    name: "Assault Rifle (e.g., M4/AR-15)",
    weapon: true,
    mods: { attack: 2 },
    multiTarget: true,
  },
  58: { name: "Tactical Tomahawk", weapon: true, mods: { attack: 1 } },
  59: { name: "Construction Helmet", special: "Attacker - 1" },
  60: { name: "Frag Grenade (x1)", weapon: true, areaAffect: true, special: "Injury Table" },
  61: { name: "Machine Pistol", weapon: true, mods: { attack: 1 }, multiTarget: true },
  62: {
    name: "Hunting Rifle (Bolt-Action, Scoped)",
    weapon: true,
    mods: { attack: 1 },
    scoped: true,
  },
  63: { name: "SMG (e.g., P90)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  64: { name: "Thick Work Gloves", special: "Attacker Additional - 1" },
  65: { name: "Fire Axe", weapon: true, mods: { attack: 1 } },
  66: {
    name: "Tactical Shotgun (e.g., SPAS-12)",
    weapon: true,
    mods: { attack: 2 },
    multiTarget: true,
  },
  67: { name: "Metal Detector", mods: { search: 2 } },
  68: {
    name: "Marksman Rifle (DMR, Semi-auto)",
    weapon: true,
    mods: { attack: 2 },
    multiTarget: true,
  },
  69: { name: "Energy Drink", mods: { move: 1 } },
  70: { name: "Trench Knife", weapon: true, mods: { attack: 1 } },
  71: { name: "Sporting Rifle (.22)", weapon: true, mods: { attack: 1 } },
  72: {
    name: "Antique SMG (e.g., Thompson)",
    weapon: true,
    mods: { attack: 1 },
    multiTarget: true,
  },
  73: { name: "Throwing Hatchet (x1)", weapon: true, loseOnFailure: true },
  74: { name: "Painkillers (bottle)", mods: { comfort: 1 } },
  75: { name: "Bullpup Rifle (e.g., AUG)", weapon: true, mods: { attack: 1 } },
  76: { name: "Desert Eagle (.50)", weapon: true, mods: { attack: 1 } },
  77: { name: "Breach Shotgun (Shorty)", weapon: true, mods: { attack: 1 }, multiTarget: true },
  78: { name: "Canned Food", mods: { comfort: 1 } },
  79: { name: "Shuriken (x5)", weapon: true, loseOnFailure: true },
  80: { name: "Tactical SMG (Silenced)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  82: { name: "Assault Rifle (Burst Fire)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  83: { name: "Bullhorn", mods: { convince: 1 } },
  84: { name: "Battle Rifle (e.g., FAL)", weapon: true, mods: { attack: 2 } },
  85: { name: "Katana", weapon: true, mods: { attack: 2 } },
  86: { name: "Combat Shotgun (Drum Mag)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  87: { name: "Sticky Bomb (C4)", weapon: true, areaAffect: true, special: "Death" },
  88: { name: "Liquor bottle", mods: { comfort: 1 } },
  89: {
    name: "Sniper Rifle (Bolt-Action, Scoped)",
    weapon: true,
    mods: { attack: 2 },
    scoped: true,
  },
  90: { name: "Light Machine Gun (LMG)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  91: { name: "Antique Flintlock Pistol", weapon: true },
  92: { name: "Lever-Action Shotgun", weapon: true, mods: { attack: 1 }, multiTarget: true },
  93: {
    name: "Assault Rifle (Scoped)",
    weapon: true,
    mods: { attack: 2 },
    multiTarget: true,
    scoped: true,
  },
  94: { name: "Heavy LMG (Belt-fed)", weapon: true, mods: { attack: 2 }, multiTarget: true },
  95: {
    name: "Grenade Launcher (Single Shot, M79)",
    weapon: true,
    areaAffect: true,
    special: "Injury Table + 2",
  },
  96: { name: "Shotgun (Slug rounds)", weapon: true, mods: { attack: 1 }, multiTarget: true },
  97: { name: "Antique Blunderbuss", weapon: true },
  98: { name: "Anti-Materiel Rifle (.50 Cal)", weapon: true },
  99: { name: "Camoflauge", mods: { hide: 2 } },
  100: { name: "Chainsaw (Gas powered)", weapon: true, mods: { attack: 2 } },
};

/** The rolled item, or null — 31, 81, and out-of-range rolls find nothing. */
export function itemFor(total) {
  return ITEMS[total] ?? null;
}

/**
 * Ranking within an item class for the upgrade comparison (book p.11):
 * weapons rank by Attack bonus, with multi-target / area-affect / scoped
 * counting +1; non-weapons rank by their combined positive modifiers.
 */
export function upgradeScore(item) {
  const propBonus = item.multiTarget || item.areaAffect || item.scoped ? 1 : 0;
  if (item.weapon) return (item.mods?.attack ?? 0) + propBonus;
  return Object.values(item.mods ?? {}).reduce((sum, n) => sum + Math.max(0, n), 0) + propBonus;
}

/**
 * Book upgrade criteria (p.11): an Attack item always beats a non-Attack
 * item; within a class the higher score wins; a tie keeps the held item.
 * A player with no item always picks up whatever they find.
 */
export function isUpgrade(found, held) {
  if (!held) return true;
  if (!!found.weapon !== !!held.weapon) return !!found.weapon;
  return upgradeScore(found) > upgradeScore(held);
}

// The action ids item modifiers may target (must stay in sync with ACTIONS).
const MOD_ACTIONS = ["attack", "move", "hide", "search", "comfort", "convince"];

/** Dev drift guard: 98 printed entries, every mod keyed to a real action. */
export function assertItemTable() {
  const entries = Object.entries(ITEMS);
  console.assert(entries.length === 98, `Battle Royale: items table has ${entries.length}/98 rows`);
  console.assert(!ITEMS[31] && !ITEMS[81], "Battle Royale: rolls 31/81 must stay empty");
  for (const [n, item] of entries) {
    for (const key of Object.keys(item.mods ?? {})) {
      console.assert(
        MOD_ACTIONS.includes(key),
        `Battle Royale: item ${n} "${item.name}" has unknown mod "${key}"`,
      );
    }
  }
}
