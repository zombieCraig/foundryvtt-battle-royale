// Single source of truth for the 52 playing cards.
// Icon files are pre-rendered by `npm run build-cards` at the repo root.
export const SYSTEM_ID = "battle-royale";

export const SUITS = {
  hearts: { label: "Hearts", glyph: "♥" },
  diamonds: { label: "Diamonds", glyph: "♦" },
  spades: { label: "Spades", glyph: "♠" },
  clubs: { label: "Clubs", glyph: "♣" },
};

export const RANKS = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  j: "Jack",
  q: "Queen",
  k: "King",
  a: "Ace",
};

/** "j","hearts" → "Jack of Hearts" */
export function cardLabel(suit, rank) {
  return `${RANKS[rank]} of ${SUITS[suit].label}`;
}

/** "j","hearts" → "systems/battle-royale/assets/cards/hearts-j.webp" */
export function cardIcon(suit, rank) {
  return `systems/${SYSTEM_ID}/assets/cards/${suit}-${rank}.webp`;
}

/** Choice maps for schema fields / sheet selects. */
export const SUIT_CHOICES = Object.fromEntries(Object.entries(SUITS).map(([k, v]) => [k, v.label]));
export const RANK_CHOICES = { ...RANKS };
