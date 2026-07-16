# Development

Battle Royale is built inside a private monorepo (Forgejo, not this repo) that
provides shared tooling (`npm run pack`, `link`, `release`, etc.) at the repo
root. The commands below only work from inside that monorepo — cloning this
repo alone won't have `scripts/`, the root `package.json`, or sibling
packages. If you have monorepo access, read on; otherwise this file is for
reference only.

## Dev workflow (monorepo)

- `npm run link battle-royale` — symlink into `~/.local/share/FoundryVTT/Data/systems/`
- `npm run pack battle-royale` — build compendium packs from `src/packs/`
- `npm run build-items` — regenerate the items compendium sources
  (`src/packs/items/*.yml`) from `scripts/data/items.js` (the Items Table as
  data). Rerun + `npm run pack battle-royale` after editing item stats;
  commit the generated YAML.
- **Battle Royale Rulebook** compendium (`src/packs/journal/`) — the book's
  rules text (pages 1–21: Requirements through Death) as an in-Foundry
  `JournalEntry`, hand-transcribed rather than generated. Links its Items
  Table mentions to the Battle Royale Items compendium. Update by hand after
  book text changes, then `npm run pack battle-royale`.
- `npm run build-actions` — regenerate the 10 placeholder action icons
  (`assets/actions/*.webp`) from the SVG template in
  `scripts/build-action-icons.mjs` (repo root). Replace with final art anytime
  (256×256, transparent background, same filenames).
- `npm run extract-names` — regenerate `scripts/data/names.js` (18 regions ×
  first-name + surname tables) from the book PDF name appendix
  (`books/BattleRoyale/Jul_13_Battle_Royale_2.2.pdf`, pages 18–36). Rerun
  after book updates and commit.
- `npm run build-cards` — regenerate the 52 card icons (`assets/cards/*.webp`)
  from the SVG template in `scripts/build-card-icons.mjs` (repo root). Icons are
  pre-rendered webp so all clients see identical art. Tweak → rerun → commit.
- Map: raw source lives at `src/art/hanashima-island.jpg` (excluded from
  release/deploy). Shipped copy is `assets/maps/hanashima-island.webp`.
  Regenerate after art changes (square image, dimensions divisible by 10):

  ```sh
  node -e "import('sharp').then(async ({default: s}) =>
    s('packages/battle-royale/src/art/hanashima-island.jpg')
      .webp({ quality: 82 })
      .toFile('packages/battle-royale/assets/maps/hanashima-island.webp'))"
  ```

## Release prep checklist

- [x] Cover art 1200×600 (2:1), < 1MB → `media` cover entry + top-level
      `"background"` in `system.json` (setup-screen tile; worlds inherit it).
      Raw at `src/art/cover.webp`, optimized copy at `assets/cover.webp`.
- [x] Icon/logo 512×512 → `media` icon entry. Raw at `src/art/icon.webp`,
      optimized at `assets/icon.webp`.
- [x] License: CC BY-SA 4.0, same as the book (© 2026 Craig Smith) —
      `LICENSE.md` + `"license"` field in `system.json`
- [x] Public repo name + `flags.dev.publicRemote` / visibility flip for
      `npm run publish` → `github.com/zombieCraig/foundryvtt-battle-royale`
      (create the repo — private until release — before the first publish)
- [x] Name tables + personality + Waking Up chart as data
      (`scripts/data/names.js` generated, `scripts/data/tables.js` hand-copied)
- [ ] Remaining tables as machine-readable data for compendium packs:
      event chart (2d6), structures, environmental hazards
      (injury 1d10 done — `scripts/data/tables.js`; items d100 done —
      `scripts/data/items.js` → Battle Royale Items compendium)
- [x] Final book PDF → rules-facing values re-confirmed (v2.0 book, Jul 2026):
      the book carries no round-track/escalation graphic of its own, so
      `Map_Roster_Jul5.pdf` is the authoritative artifact — its track
      (⚠ 6/10/14/18/22/26/28, 💀 9/13/17/21/25/27/30) and Desperation
      Escalation bands (16–20 +1, 21–25 +2 & success 3+, 26+ +3) match
      `scripts/data/tables.js` exactly, and the book's prose (p.11 zones,
      pp.18–19 escalation) agrees
- [ ] Create `github.com/zombieCraig/foundryvtt-battle-royale` (private until
      release), then `npm run publish battle-royale`
- [ ] `npm run release battle-royale public` — cuts the GitHub release +
      manifest (`system.json` at
      `.../releases/latest/download/system.json`)
- [ ] Submit at `foundryvtt.com/packages/submit` (free/self-published, manual
      review — no Premium Content Agreement needed) pointing at that manifest
      URL
