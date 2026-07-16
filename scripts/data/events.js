// Event Chart data (book pp.21-22). Both tables are d66: roll 2d6, read the
// first die as tens and the second as ones (1-1 … 6-6).

/** Index into a 36-entry d66 table from the two dice. */
export const d66Index = (tens, ones) => (tens - 1) * 6 + (ones - 1);

/** Structures table (book p.21) — pure flavor, no mechanical effect. */
// prettier-ignore
export const STRUCTURES = [
  "Statue", "Fountain", "Mobile home", "Children's Park", "Library", "Abandoned home",
  "Water tower", "Old well", "Barn", "Parking lot with junked vehicles", "Deserted railway station", "Warehouse",
  "Rusted factory", "Abandoned chemical plant", "Old church", "Apartment complex", "Empty convenience store", "Locked up bank",
  "Fire station", "Food truck", "Brewery", "Theater", "School", "Gas station",
  "Farm", "Old guard house", "Small prison", "Run down motel", "Deserted bowling alley", "Tavern / Bar",
  "Office complex", "Outdoor mall", "Tool shop", "Restaurant", "Grocery", "Graveyard",
];

/**
 * Environmental Hazards table (book p.22). Everyone in the square rolls 1d6
 * against `threshold`; a failure applies `fail`:
 *   injuryShift — roll the Injury Table (1d10) with this shift
 *   death       — killed outright
 *   loseItem    — carried item is destroyed
 *   debuff      — timed stat penalty: `affects` mirrors the Injury Table
 *                 shape ({actionId: -N}); lasts through the next round
 *   note        — non-mechanical effect the Overseer adjudicates
 * A top-level `trap: { escapeRounds }` marks a persistent trap: failures are
 * stuck (Move blocked) for the escape countdown and the cell stays armed —
 * everyone there re-rolls the save each round until all have passed.
 */
export const HAZARDS = [
  {
    name: "Thick Fog",
    threshold: 3,
    save: "to navigate",
    fail: { debuff: { affects: { move: -1 } } },
  },
  {
    name: "Minor Tremor",
    threshold: 3,
    save: "to keep balance",
    fail: { debuff: { affects: { move: -1 } } },
  },
  { name: "Sudden Downpour", threshold: 4, save: "to protect gear", fail: { loseItem: true } },
  {
    name: "Gale-Force Winds",
    threshold: 4,
    save: "to move/aim",
    fail: { debuff: { affects: { move: -1, attack: -1 } } },
  },
  {
    name: "Snare Traps (Net)",
    threshold: 5,
    save: "to spot",
    fail: { debuff: { affects: { move: -3, attack: -1 } } },
  },
  {
    name: "Tracker Wasp Swarm (Small)",
    threshold: 4,
    save: "to evade",
    fail: { injuryShift: -2 },
  },
  { name: "Spore Cloud (Coughing)", threshold: 4, save: "to resist", fail: { injuryShift: 0 } },
  {
    name: "Intense Heat Wave",
    threshold: 4,
    save: "to resist fatigue",
    fail: { debuff: { affects: { move: -2 } } },
  },
  { name: "Carnivorous Squirrels", threshold: 4, save: "to fight off", fail: { injuryShift: 0 } },
  {
    name: "Landslide / Rockfall",
    threshold: 5,
    save: "to dodge",
    fail: { debuff: { affects: { move: -1 } } },
  },
  {
    name: "Barbed Net Wall (Drops)",
    threshold: 4,
    save: "to avoid trap",
    fail: { injuryShift: 0 },
  },
  { name: "Scalding Steam Geysers", threshold: 5, save: "to dodge", fail: { injuryShift: 1 } },
  { name: "Sniper", threshold: 4, save: "to evade", fail: { injuryShift: 2 } },
  {
    name: "Quicksand Pit (Trap)",
    threshold: 4,
    save: "to spot",
    trap: { escapeRounds: 2 },
    fail: { debuff: { affects: { move: -3, attack: -2 } } },
  },
  { name: "Poison Gas Cloud (Slow)", threshold: 4, save: "to escape area", fail: { death: true } },
  {
    name: "Hallucinogenic Mist",
    threshold: 5,
    save: "to resist",
    fail: { note: "Ignore friends" },
  },
  { name: "Stampede (Mutated deer)", threshold: 5, save: "to dodge", fail: { injuryShift: 2 } },
  { name: "Fire", threshold: 4, save: "to outrun", fail: { injuryShift: 2 } },
  {
    name: "Oil Slick (Flammable)",
    threshold: 3,
    save: "to cross safely",
    fail: { injuryShift: 0, debuff: { affects: { move: -1 } } },
  },
  { name: "Acid Rain (Light)", threshold: 4, save: "to find cover", fail: { injuryShift: 0 } },
  {
    name: "Fast-Growing Thorny Vines",
    threshold: 4,
    save: "to cut through",
    fail: { debuff: { affects: { move: -3 } } },
  },
  {
    name: "Automated Turret (Single)",
    threshold: 5,
    save: "to find cover",
    fail: { injuryShift: 3 },
  },
  { name: "Poison Wasp Swarm (Large)", threshold: 6, save: "to evade", fail: { death: true } },
  {
    name: "Flash Flood (Gorge/stream)",
    threshold: 5,
    save: "to reach high ground",
    fail: { death: true },
  },
  {
    name: "Localized Blizzard (Whiteout)",
    threshold: 5,
    save: "to navigate",
    fail: { debuff: { affects: { move: -2 } } },
  },
  { name: "Mutated Wolves (Pack)", threshold: 5, save: "to hide/fight", fail: { injuryShift: 2 } },
  {
    name: "Tar Pits Erupt (Trap)",
    threshold: 4,
    save: "to avoid",
    trap: { escapeRounds: 2 },
    fail: { debuff: { affects: { move: -3, attack: -2 } } },
  },
  {
    name: "Sonic Pulse (Disorienting)",
    threshold: 5,
    save: "to resist",
    fail: {
      debuff: {
        affects: { attack: -2, move: -2, hide: -2, search: -2, comfort: -2, convince: -2 },
      },
    },
  },
  {
    name: "Landmines (Small field)",
    threshold: 6,
    save: "to cross safely",
    fail: { injuryShift: 3 },
  },
  { name: "Acid Rain (Heavy)", threshold: 5, save: "to find cover", fail: { death: true } },
  {
    name: "Poison Dart Traps (Area)",
    threshold: 5,
    save: "to spot triggers",
    fail: { death: true },
  },
  {
    name: "Flesh-Eating Bacteria (Water source)",
    threshold: 5,
    save: "to identify",
    fail: { death: true },
  },
  {
    name: "Lightning Storm (Targeted)",
    threshold: 5,
    save: "to find cover",
    fail: { death: true },
  },
  { name: "Spinning Blades", threshold: 4, save: "to evade", fail: { injuryShift: 2 } },
  { name: "Earthquake (Major)", threshold: 6, save: "to avoid injury", fail: { injuryShift: 0 } },
  { name: "Volcano Erupts (Lava flow)", threshold: 6, save: "to escape", fail: { death: true } },
];
