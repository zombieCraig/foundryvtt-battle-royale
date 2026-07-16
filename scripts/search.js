import { SYSTEM_ID } from "./cards.js";
import { getRound, escalation } from "./rounds.js";
import { itemFor, isUpgrade } from "./data/items.js";
import { rollMods, spendMorale, d6Plus, combatantLine } from "./rolls.js";
import { carriedItem, giveItem, itemAffectsText } from "./items.js";
import { cardHeader } from "./actions.js";

const searchFlags = (actor) => ({
  [SYSTEM_ID]: { card: "action", actorId: actor.id, actionId: "search" },
});

/**
 * Resolve a Search (book p.10): if someone is hiding in the square, the
 * searcher must roll opposed against them first — discovery reveals them and
 * stops the search; otherwise the search moves on to the item roll.
 */
export async function onSearchRoll(actor) {
  const location = actor.system.location;
  const hidden = location
    ? game.actors.filter(
        (p) =>
          p.type === "player" &&
          p.id !== actor.id &&
          !p.system.dead &&
          p.system.location === location &&
          p.system.hidden,
      )
    : [];
  if (!hidden.length) return onSearchSuccessRoll(actor);

  const target = hidden[Math.floor(Math.random() * hidden.length)];
  const seek = rollMods(actor, "search", { acting: true });
  const conceal = rollMods(target, "hide");
  const seekRoll = await new Roll(d6Plus(seek.mod)).evaluate();
  const hideRoll = await new Roll(d6Plus(conceal.mod)).evaluate();
  await spendMorale(actor);
  // Opposed roll: the searcher needs the higher total; a tie does nothing.
  const found = seekRoll.total > hideRoll.total;
  if (found) await target.update({ "system.hidden": false });

  const result = found
    ? `<p class="success">👁 ${game.i18n.format("BR.Actions.SearchDiscovered", {
        searcher: actor.name,
        target: target.name,
      })}</p>`
    : `<p>🌫 ${game.i18n.format("BR.Actions.SearchNoOne", { name: actor.name })}</p>
      <div class="br-card-buttons">
        <button type="button" data-br-action="searchSuccessRoll">
          <i class="fa-solid fa-dice-six"></i>
          ${game.i18n.format("BR.Actions.SuccessRoll", { n: escalation(getRound()).success })}
        </button>
      </div>`;

  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [seekRoll, hideRoll],
    flavor: game.i18n.localize("BR.Actions.SearchVsHide"),
    flags: searchFlags(actor),
    content: `
      <div class="battle-royale combat-card">
        ${cardHeader(actor)}
        <p>🔍 ${game.i18n.format("BR.Actions.SearchOpposed", { name: actor.name })}</p>
        ${combatantLine(actor, seekRoll, seek.parts)}
        ${combatantLine(target, hideRoll, conceal.parts)}
        ${result}
      </div>`,
  });
}

/** No one to find — roll to find items instead (1d6 vs the escalation threshold). */
export async function onSearchSuccessRoll(actor) {
  const { success } = escalation(getRound());
  const { mod, parts } = rollMods(actor, "search", { acting: true });
  const roll = await new Roll(d6Plus(mod)).evaluate();
  await spendMorale(actor);
  const won = roll.total >= success;
  const text = game.i18n.format(won ? "BR.Actions.SuccessResult" : "BR.Actions.FailureResult", {
    action: game.i18n.localize("BR.Actions.Search.Name"),
    total: roll.total,
    n: success,
  });
  const buttons = won
    ? `<div class="br-card-buttons">
        <button type="button" data-br-action="itemRoll">
          <i class="fa-solid fa-sack-xmark"></i> ${game.i18n.localize("BR.Actions.ItemRoll")}
        </button>
      </div>`
    : "";
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.Search.Name"),
    flags: searchFlags(actor),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p class="${won ? "success" : "failure"}">${won ? "✅" : "❌"} ${text}</p>
        <p class="br-action-note">${parts.join(", ")}</p>
        ${buttons}
      </div>`,
  });
}

/**
 * Items Table (book pp.22-25): d100 — the book's 2d10 kept as percentile
 * dice. Rolls 31 and 81 have no entry (nothing of value). A found item is
 * taken only if it's an upgrade over the held one (book p.11); no item means
 * always take. The single-item hook posts the discard line on a swap.
 */
export async function onItemRoll(actor) {
  const roll = await new Roll("1d100").evaluate();
  const found = itemFor(roll.total);
  const held = carriedItem(actor);

  let text;
  let take = false;
  if (!found) {
    text = `<p>🕳 ${game.i18n.format("BR.Actions.SearchNothing", {
      name: actor.name,
      total: roll.total,
    })}</p>`;
  } else {
    take = isUpgrade(found, held?.system);
    text = `<p class="${take ? "success" : ""}">🎒 ${game.i18n.format(
      take ? "BR.Actions.ItemTaken" : "BR.Actions.ItemLeft",
      {
        name: actor.name,
        item: found.name,
        affects: itemAffectsText(found),
        held: held?.name,
        total: roll.total,
      },
    )}</p>`;
  }

  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.ItemFlavor"),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        ${text}
      </div>`,
  });
  if (take) await giveItem(actor, roll.total);
}
