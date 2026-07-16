import { SYSTEM_ID } from "./cards.js";
import { ACTIONS } from "./data/actions.js";
import { ITEMS } from "./data/items.js";

/** The player's single carried item, or null. */
export const carriedItem = (actor) => actor?.items.contents[0] ?? null;

/** The carried item's modifier to the given action's rolls (0 if none). */
export function itemMod(actor, actionId) {
  return carriedItem(actor)?.system.mods[actionId] ?? 0;
}

/** Foundry document data for an Items Table row. */
export function itemCreateData(n) {
  const item = ITEMS[n];
  return {
    name: item.name,
    type: "item",
    img: item.weapon ? "icons/svg/sword.svg" : "icons/svg/item-bag.svg",
    system: {
      rollNumber: Number(n),
      weapon: !!item.weapon,
      mods: item.mods ?? {},
      multiTarget: !!item.multiTarget,
      areaAffect: !!item.areaAffect,
      scoped: !!item.scoped,
      loseOnFailure: !!item.loseOnFailure,
      special: item.special ?? "",
    },
  };
}

/** Hand a player row `n` of the Items Table; the single-item hook discards any old item. */
export async function giveItem(actor, n) {
  await actor.createEmbeddedDocuments("Item", [itemCreateData(n)]);
}

/**
 * Human line for an item's effects, e.g. "weapon, Attack +2, Multi-Target —
 * Victim skip next turn". Takes the item's `system` (or raw ITEMS data).
 */
export function itemAffectsText(system) {
  const parts = Object.entries(system.mods ?? {})
    .filter(([, n]) => n)
    .map(
      ([id, n]) =>
        `${game.i18n.localize(`BR.Actions.${ACTIONS[id].key}.Name`)} ${n > 0 ? "+" : ""}${n}`,
    );
  if (system.weapon && !system.mods?.attack) parts.unshift(game.i18n.localize("BR.Items.Weapon"));
  if (system.multiTarget) parts.push(game.i18n.localize("BR.Items.MultiTarget"));
  if (system.areaAffect) parts.push(game.i18n.localize("BR.Items.AreaAffect"));
  if (system.scoped) parts.push(game.i18n.localize("BR.Items.Scoped"));
  if (system.loseOnFailure) parts.push(game.i18n.localize("BR.Items.LoseOnFailure"));
  const text = parts.length ? parts.join(", ") : game.i18n.localize("BR.Items.NoAffect");
  return system.special ? `${text} — ${system.special}` : text;
}

/**
 * Looting the dead (book p.18): the killer may loot the body and exchange
 * inventory — the Overseer decides, guided by personality (an Aggressive
 * killer takes the stronger weapon; a Humanitarian might prefer a first aid
 * kit). An unlooted item is lost and cannot be retrieved. No offer when the
 * victim carried nothing.
 */
export async function offerLoot(killer, victim) {
  const item = carriedItem(victim);
  if (!item || !killer || killer.system.dead) return;
  const held = carriedItem(killer);
  const bag = (owner, carried) =>
    carried
      ? game.i18n.format("BR.Items.LootCarries", {
          name: owner.name,
          item: carried.name,
          affects: itemAffectsText(carried.system),
        })
      : game.i18n.format("BR.Items.LootCarriesNothing", { name: owner.name });
  await ChatMessage.create({
    speaker: { alias: killer.name },
    flags: { [SYSTEM_ID]: { card: "action", actorId: killer.id, victimId: victim.id } },
    content: `
      <div class="battle-royale success-card">
        <p>💰 ${game.i18n.format("BR.Items.LootOffer", {
          killer: killer.name,
          victim: victim.name,
        })}</p>
        <p class="br-action-note">🎒 ${bag(victim, item)}</p>
        <p class="br-action-note">🎒 ${bag(killer, held)}</p>
        <p class="br-action-note">${game.i18n.format("BR.Items.LootHint", {
          name: killer.name,
          personality: killer.system.personality?.trim() || "—",
        })}</p>
        <div class="br-card-buttons">
          <button type="button" data-br-action="lootTake">
            <i class="fa-solid fa-hand-holding"></i>
            ${game.i18n.format("BR.Items.LootTake", { item: item.name })}
          </button>
          <button type="button" data-br-action="lootLeave">
            <i class="fa-solid fa-ban"></i>
            ${game.i18n.localize("BR.Items.LootLeave")}
          </button>
        </div>
      </div>`,
  });
}

/** Loot card: take the victim's item (the single-item hook discards the old one). */
export async function onLootTake(killer, flags) {
  const victim = game.actors.get(flags.victimId);
  const item = carriedItem(victim);
  if (!item) {
    ui.notifications.warn("BR.Items.LootGone", { localize: true });
    return;
  }
  const data = item.toObject();
  delete data._id;
  await victim.deleteEmbeddedDocuments("Item", [item.id]);
  await killer.createEmbeddedDocuments("Item", [data]);
  await ChatMessage.create({
    speaker: { alias: killer.name },
    content: `
      <div class="battle-royale success-card">
        <p>💰 ${game.i18n.format("BR.Items.LootTaken", {
          killer: killer.name,
          victim: victim.name,
          item: data.name,
        })}</p>
      </div>`,
  });
}

/** Loot card: leave the item — lost forever (book). */
export async function onLootLeave(killer, flags) {
  const victim = game.actors.get(flags.victimId);
  const item = carriedItem(victim);
  if (!item) return;
  await victim.deleteEmbeddedDocuments("Item", [item.id]);
  await ChatMessage.create({
    speaker: { alias: killer.name },
    content: `
      <div class="battle-royale success-card">
        <p>🕳 ${game.i18n.format("BR.Items.LootLost", { item: item.name, victim: victim.name })}</p>
      </div>`,
  });
}

/**
 * A player carries one item, max (the book roster has a single Item column;
 * search compares against "their currently held item"). Whenever an item
 * lands on a player — compendium drag, Search, backpack, macro — every other
 * embedded item is discarded, with a chat line so the swap is visible.
 */
export function registerSingleItemLimit() {
  Hooks.on("createItem", async (item) => {
    if (!game.user.isActiveGM) return;
    const actor = item.parent;
    if (actor?.type !== "player") return;
    const others = actor.items.filter((i) => i.id !== item.id);
    if (!others.length) return;
    await actor.deleteEmbeddedDocuments(
      "Item",
      others.map((i) => i.id),
    );
    await ChatMessage.create({
      speaker: { alias: actor.name },
      content: `
        <div class="battle-royale success-card">
          <p>🎒 ${game.i18n.format("BR.Actions.ItemDiscarded", {
            name: actor.name,
            item: others.map((i) => i.name).join(", "),
          })}</p>
        </div>`,
      flags: { [SYSTEM_ID]: { card: "discard" } },
    });
  });
}
