// Setup tables hand-copied from the Battle Royale book (v2.0 PDF).

// Personality Table, 1d20 (book p.18). Action columns live in actions.js.
export const PERSONALITIES = [
  "Thinking",
  "Humanitarian",
  "Angry",
  "Afraid",
  "Exhausted",
  "Sick / Injured",
  "Silent",
  "Outspoken",
  "Aggressive",
  "Deceitful",
  "Simple",
  "Anxious",
  "Bully",
  "Political",
  "Depressed",
  "In Love",
  "Religious",
  "Unstable",
  "Militant",
  "Leader",
];

// Round track (roster sheet). Warning rounds mark the next zone at the START
// of that round; lethal rounds close it at the END of theirs.
export const WARNING_ROUNDS = [6, 10, 14, 18, 22, 26, 28];
export const LETHAL_ROUNDS = [9, 13, 17, 21, 25, 27, 30];
export const MAX_ROUND = 30;

// Desperation Escalation (roster sheet): damage bonus + success threshold.
export const ESCALATION = [
  { max: 15, damage: 0, success: 4 },
  { max: 20, damage: 1, success: 4 },
  { max: 25, damage: 2, success: 3 },
  { max: Infinity, damage: 3, success: 3 },
];

// Injury Table, 1d10 (book p.21). `affects` keys are action ids — the penalty
// applies to that action's rolls. Damage Chart modifiers (−2/+2) can push the
// total below 1 or above 10, hence the two out-of-range results.
export const INJURY_TABLE = [
  { name: "Sprained Ankle", affects: { move: -1 } },
  { name: "Head Injury", affects: { hide: -1, search: -1 } },
  { name: "Bloodied Arm", affects: { attack: -1 } },
  { name: "Mangled Calf", affects: { move: -2 } },
  { name: "Severed Finger", affects: { attack: -1 } },
  { name: "Damaged Eye", affects: { search: -2 } },
  { name: "Burned", affects: { hide: -2, attack: -1 } },
  { name: "Broken Bone", affects: { attack: -2 } },
  { name: "Severed Limb", affects: { attack: -3, move: -2 } },
  { name: "Bleeding Out", affects: { attack: -3, move: -4 } },
];
const INJURY_UNDER = { name: "Flesh Wound", affects: {} };
const INJURY_OVER = { name: "Dismembered", affects: {}, dead: true };

/** Injury Table result for a modified 1d10 total. */
export function injuryFor(total) {
  if (total < 1) return INJURY_UNDER;
  if (total > 10) return INJURY_OVER;
  return INJURY_TABLE[total - 1];
}

// Final Reckoning table, 2d6 (book endgame): the scenario staged when only
// two players remain. `skill` is an action id — the player's bonus is how
// many faces of that action their personality column holds — or
// "attackKills": Attack faces plus the carried item's Attack modifier plus
// the player's kill count.
export const FINAL_RECKONING = {
  2: {
    name: "Final Secret",
    skill: "search",
    description:
      "The way out is revealed but it is hidden. The first to find it will be saved and the other will be trapped and executed.",
  },
  3: {
    name: "Potent Key",
    skill: "convince",
    description:
      "The exit key is revealed, however, whoever grabs the key will be poisoned by the environment and will die. A player must convince the other player to fetch the key for them. If they fail then they will do it instead.",
  },
  4: {
    name: "Paranoia",
    skill: "hide",
    description:
      "Consumed with paranoia the other attacks them. Can they hide long enough to strike from behind or will they get caught?",
  },
  5: {
    name: "Last Breath",
    skill: "comfort",
    description:
      "The partner collapses and is near death. They will try to save them. However, in order to save them they will have to sacrifice the last of their own resources.",
  },
  6: {
    name: "Last Stand-off",
    skill: "attackKills",
    description:
      "The necklaces start beeping quicker and quicker — if they don't act immediately they will both explode. They immediately attack each other.",
  },
  7: {
    name: "The Race",
    skill: "move",
    description:
      "Both see the look in each other's eyes as they both consider the same thing. Run into the lethal zone before the other can in order to save them.",
  },
  8: {
    name: "Environmental Impact",
    skill: "move",
    description:
      "A hazardous environment begins to destroy the area around them. They must run to evade it but only one will be quick enough.",
  },
  9: {
    name: "Sudden Brutality",
    skill: "attackKills",
    description:
      "The urge to survive overwhelms them and they immediately brutally attack the other person.",
  },
  10: {
    name: "Guilt Trip",
    skill: "convince",
    description:
      "They try to convince the other partner to give up and let them win. If they can not convince their partner to end it then they will allow their partner to kill them instead.",
  },
  11: {
    name: "Rescue",
    skill: "comfort",
    description:
      "The partner becomes trapped and if not immediately saved will die. They desperately try to save them but in order to save them they will have to sacrifice themselves.",
  },
  12: {
    name: "Swarm",
    skill: "hide",
    description:
      "A swarm of creatures have come to hunt down the remaining players. Once only one is left the creatures will be summoned back away. This will come down to who can hide the best.",
  },
};

// Waking Up chart, 1d6 (book p.6). Determines the starting scenario.
export const WAKING_SCENES = [
  {
    name: "Abandoned Room",
    dispersal: "Roll Call",
    description:
      "They wake up, surrounded by armed guards. A projection flickers alive which tells them the rules. One by one a name is called and a soldier tosses them a backpack and they must leave immediately.",
  },
  {
    name: "Scattered",
    dispersal: "Dispersed",
    description:
      "People wake up scattered through land and buildings. Confused they find a backpack with instructions inside. A siren can be heard alerting the players to the game starting immediately.",
  },
  {
    name: "Air Drop",
    dispersal: "Dispersed",
    description:
      "They wake up on a plane. A commander orders the rules and one by one grabs a person, hands them a backpack and tosses them out the open door.",
  },
  {
    name: "The Platform",
    dispersal: "Centralized",
    description:
      "They wake to the rush of wind as they are all on a platform rising from the ground. The sky can be seen above them. An announcement alerts them to the game starting. As they reach the top they can see scattered bags in a circle around them. A siren blares and the game starts.",
  },
  {
    name: "Prison",
    dispersal: "Roll Call",
    description:
      "Each person awakes in their own small cell with a metal door and no windows. An intercom cracks to life and explains the rules. One by one a cell door opens at random and as the person leaves a backpack drops from a chute.",
  },
  {
    name: "Stadium",
    dispersal: "Centralized",
    description:
      "A giant metal door clangs open to reveal a brightly lit stadium. The stands are replaced by giant screens showing cheering crowds. In front of them are burned out cars and barrels with a pile of backpacks. A large exit gate is on the other side. A buzzer sounds and everyone runs towards the backpacks.",
  },
];
