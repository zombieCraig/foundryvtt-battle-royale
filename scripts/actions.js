import { SYSTEM_ID } from "./cards.js";
import { getRound, escalation } from "./rounds.js";
import {
  ACTIONS,
  PERSONALITY_COLUMNS,
  PERSONALITY_DICE,
  OVERSEER_RANDOM,
  MOVE_DIRECTIONS,
  actionIcon,
} from "./data/actions.js";
import { hasLoverBonus, loverState, victimsInSquare } from "./lovers.js";
import { parseCell, resolveDestination, moveActorToCell } from "./movement.js";
import { injuryMod, spendMorale } from "./rolls.js";
import { debuffMod, isStuck, stuckDebuff } from "./debuffs.js";
import { attackTargets, onAttackRoll, onDamageRoll, onInjuryRoll } from "./attack.js";
import { carriedItem, itemMod, itemAffectsText, onLootTake, onLootLeave } from "./items.js";
import { onSearchRoll, onSearchSuccessRoll, onItemRoll } from "./search.js";
import { convinceTargets, onConvinceRoll, onComfortRoll } from "./social.js";
import { rollEvent } from "./events.js";
// Cycle with endgame.js (it imports cardHeader) — safe because both sides
// only reference the imports inside function bodies.
import {
  isShowdown,
  showdownForcedMove,
  onDesperationPlea,
  onFinalTeamChoose,
  onFinalReckoningRoll,
} from "./endgame.js";

// Font Awesome icons for the Overseer choice dialog buttons.
const OVERSEER_FA = {
  comfort: "fa-hand-holding-heart",
  convince: "fa-comments",
  hide: "fa-eye-slash",
  search: "fa-magnifying-glass",
  attack: "fa-hand-fist",
  move: "fa-person-walking",
};

/**
 * Roll a player's action for the turn: 1d6 on their personality's action
 * column, rolled with that personality's custom die so Dice So Nice shows the
 * action faces. Posts a chat card with the follow-up buttons (success roll,
 * Overseer choice, move direction).
 */
export async function rollAction(actor) {
  if (!game.user.isGM) {
    ui.notifications.warn("BR.Setup.GMOnly", { localize: true });
    return;
  }
  if (actor?.type !== "player") return;
  if (actor.system.dead) {
    ui.notifications.warn(game.i18n.format("BR.Actions.DeadPlayer", { name: actor.name }));
    return;
  }
  const personality = actor.system.personality?.trim();
  if (!personality) {
    ui.notifications.warn(game.i18n.format("BR.Actions.NoPersonality", { name: actor.name }));
    return;
  }
  const column = PERSONALITY_COLUMNS[personality];
  if (!column) {
    ui.notifications.warn(game.i18n.format("BR.Actions.UnknownPersonality", { personality }));
    return;
  }
  const roll = await new Roll(`1d${PERSONALITY_DICE[personality]}`).evaluate();
  await postActionCard(actor, { actionId: column[roll.total - 1], roll });
}

/** One-line lover status for In Love cards and the choice dialog. */
function loverStatusLine(actor) {
  const { lover, found, dead } = loverState(actor);
  if (!lover) return game.i18n.localize("BR.Actions.LoverStatusNone");
  if (dead) return game.i18n.format("BR.Actions.LoverStatusDead", { lover: lover.name });
  if (found) return game.i18n.format("BR.Actions.LoverStatusFound", { lover: lover.name });
  return game.i18n.format("BR.Actions.LoverStatusSearching", { lover: lover.name });
}

/** Card header shared by the action and result messages. */
export function cardHeader(actor) {
  const location = actor.system.location
    ? `<span class="br-location">${actor.system.location}</span>`
    : "";
  return `
    <header class="br-card-header">
      <img class="br-card-img" src="${actor.img}" alt="" />
      <div>
        <h3>${actor.name} ${location}</h3>
        <span class="br-personality">${actor.system.personality}</span>
      </div>
    </header>`;
}

/** Trap victim tried to Move: no roll — they're held until the countdown ends. */
export async function postStuckNote(actor) {
  const debuff = stuckDebuff(actor);
  await ChatMessage.create({
    speaker: { alias: actor.name },
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p>🕸 ${game.i18n.format("BR.Actions.MoveStuckTrap", {
          name: actor.name,
          hazard: debuff?.name ?? "",
          rounds: debuff?.rounds ?? 0,
        })}</p>
      </div>`,
  });
}

// Actions resolved through a bespoke button instead of the generic success
// roll; each entry renders as "Resolve <Action>" on the action card.
const RESOLVERS = {
  attack: { brAction: "attackRoll", icon: "fa-hand-fist", key: "AttackResolve" },
  search: { brAction: "searchRoll", icon: "fa-magnifying-glass", key: "SearchResolve" },
  convince: { brAction: "convinceRoll", icon: "fa-comments", key: "ConvinceResolve" },
  comfort: { brAction: "comfortRoll", icon: "fa-hand-holding-heart", key: "ComfortResolve" },
  abandon: {
    brAction: "abandonRoll",
    icon: "fa-person-walking-arrow-right",
    key: "AbandonResolve",
  },
};

/**
 * Post the action chat card. Used for the initial personality roll and for
 * Overseer-chosen follow-ups (`roll` is optional). Follow-up buttons always
 * post new messages — editing a message's rolls would replay the 3D dice.
 */
export async function postActionCard(actor, { actionId, roll = null }) {
  // Overseer's Decree (book endgame): during the Showdown every non-combat
  // action becomes an Attack; Convince becomes a Desperation Plea (below).
  const showdown = isShowdown();
  let forcedFrom = null;
  if (showdown && ["move", "hide", "search", "comfort"].includes(actionId)) {
    forcedFrom = actionId;
    actionId = "attack";
  }
  // Book "When a Love Dies": an enraged player's Move becomes Attack while a
  // potential victim shares their square; otherwise it reverts to Move.
  let rage = false;
  if (actionId === "move" && actor.system.enraged && victimsInSquare(actor)) {
    actionId = "attack";
    rage = true;
  }
  // Book Convince (p.12): with no valid targets in the square, the player
  // searches the area instead and does not move. Not during the Showdown —
  // there a Convince must stay a Desperation Plea.
  let convinceFallback = false;
  if (!showdown && actionId === "convince" && !convinceTargets(actor).length) {
    actionId = "search";
    convinceFallback = true;
  }
  // Forced Attack with no one to fight: hunt the nearest player instead.
  if (showdown && actionId === "attack" && !attackTargets(actor).length) {
    return showdownForcedMove(actor, { roll, forcedFrom });
  }
  // Area Affect (book p.16): the carrier uses the blast only when someone
  // else shares the square — otherwise the Attack is played as a Move.
  let areaMove = false;
  if (
    !showdown &&
    actionId === "attack" &&
    carriedItem(actor)?.system.areaAffect &&
    !attackTargets(actor).length
  ) {
    actionId = "move";
    areaMove = true;
  }
  // A trap victim can't leave the square (book p.22: "N turns to escape").
  // Checked after the conversions so a Showdown-forced Attack still happens.
  if (actionId === "move" && isStuck(actor)) return postStuckNote(actor);
  const action = ACTIONS[actionId];
  const name = game.i18n.localize(`BR.Actions.${action.key}.Name`);
  const desc = game.i18n.localize(`BR.Actions.${action.key}.Desc`);

  let note = "";
  if (forcedFrom) {
    note = `<p class="br-action-note">⚔ ${game.i18n.format("BR.Endgame.ShowdownNote", {
      action: game.i18n.localize(`BR.Actions.${ACTIONS[forcedFrom].key}.Name`),
    })}</p>`;
  } else if (rage) {
    note = `<p class="br-action-note">🔥 ${game.i18n.localize("BR.Actions.RageNote")}</p>`;
  } else if (convinceFallback) {
    note = `<p class="br-action-note">🗣 ${game.i18n.localize("BR.Actions.ConvinceFallbackNote")}</p>`;
  } else if (areaMove) {
    note = `<p class="br-action-note">💣 ${game.i18n.format("BR.Actions.AreaMoveNote", {
      item: carriedItem(actor).name,
    })}</p>`;
  } else if (actionId === "mimic") {
    note = `<p class="br-action-note">${game.i18n.localize("BR.Actions.MimicNote")}</p>`;
  } else if (actionId === "inlove") {
    note = `<p class="br-action-note">${loverStatusLine(actor)}</p>
      <p class="br-action-note">${game.i18n.localize("BR.Actions.InLoveNote")}</p>`;
  }
  if (actionId === "attack") {
    const item = carriedItem(actor);
    note += item?.system.weapon
      ? `<p class="br-action-note">${game.i18n.format("BR.Actions.WeaponNote", {
          item: item.name,
          affects: itemAffectsText(item.system),
        })}</p>`
      : `<p class="br-action-note">${game.i18n.localize("BR.Actions.UnarmedNote")}</p>`;
    if (item?.system.areaAffect) {
      note += `<p class="br-action-note">💣 ${game.i18n.localize("BR.Actions.AreaNote")}</p>`;
    }
  }
  if (actionId === "hide" && actor.system.hidden) {
    note += `<p class="br-action-note">${game.i18n.localize("BR.Actions.AlreadyHidden")}</p>`;
  }
  if (showdown && actionId === "convince") {
    note += `<p class="br-action-note">💀 ${game.i18n.localize("BR.Endgame.PleaNote")}</p>`;
  }

  // During the Showdown a Convince resolves as a Desperation Plea instead.
  const resolver =
    showdown && actionId === "convince"
      ? {
          brAction: "pleaRoll",
          icon: "fa-skull",
          label: game.i18n.localize("BR.Endgame.PleaResolve"),
        }
      : RESOLVERS[actionId];

  const buttons = [];
  // Actions with their own resolve chain skip the generic Success Roll:
  // combat and the social actions are opposed or prioritized rolls, Search
  // chains people-then-items (p.10), Abandon's only roll is the move's.
  if (action.successRoll && !resolver) {
    buttons.push(
      `<button type="button" data-br-action="successRoll">
        <i class="fa-solid fa-dice-six"></i>
        ${game.i18n.format("BR.Actions.SuccessRoll", { n: escalation(getRound()).success })}
      </button>`,
    );
  }
  if (resolver) {
    const { brAction, icon, key, label } = resolver;
    buttons.push(
      `<button type="button" data-br-action="${brAction}">
        <i class="fa-solid ${icon}"></i> ${label ?? game.i18n.localize(`BR.Actions.${key}`)}
      </button>`,
    );
  }
  if (actionId === "overseer") {
    buttons.push(
      `<button type="button" data-br-action="overseerChoose">
        <i class="fa-solid fa-crown"></i> ${game.i18n.localize("BR.Actions.OverseerChoose")}
      </button>`,
    );
  }
  if (actionId === "mimic") {
    buttons.push(
      `<button type="button" data-br-action="mimicChoose">
        <i class="fa-solid fa-masks-theater"></i> ${game.i18n.localize("BR.Actions.OverseerChoose")}
      </button>`,
    );
  }
  if (actionId === "inlove") {
    buttons.push(
      `<button type="button" data-br-action="inLoveChoose">
        <i class="fa-solid fa-heart"></i> ${game.i18n.localize("BR.Actions.OverseerChoose")}
      </button>`,
    );
  }
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: roll ? [roll] : [],
    flavor: roll ? game.i18n.localize("BR.Actions.Flavor") : undefined,
    flags: { [SYSTEM_ID]: { card: "action", actorId: actor.id, actionId } },
    content: `
      <div class="battle-royale action-card">
        ${cardHeader(actor)}
        <div class="br-action-body">
          <img class="br-action-icon" src="${actionIcon(actionId)}" alt="${name}" />
          <div>
            <strong>${name}</strong>
            <p>${desc}</p>
          </div>
        </div>
        ${note}
        ${buttons.length ? `<div class="br-card-buttons">${buttons.join("")}</div>` : ""}
      </div>`,
  });
}

/** Success roll: 1d6 against the current Desperation Escalation threshold. */
async function onSuccessRoll(actor, actionId) {
  const { success } = escalation(getRound());
  const bonus = hasLoverBonus(actor);
  const injury = injuryMod(actor, actionId);
  const debuff = debuffMod(actor, actionId);
  const item = itemMod(actor, actionId);
  const morale = actor.system.morale ? 1 : 0;
  const mod = (bonus ? 1 : 0) + injury + debuff + item + morale;
  const roll = await new Roll(
    mod ? `1d6 ${mod < 0 ? "-" : "+"} ${Math.abs(mod)}` : "1d6",
  ).evaluate();
  await spendMorale(actor);
  const won = roll.total >= success;
  const name = game.i18n.localize(`BR.Actions.${ACTIONS[actionId].key}.Name`);
  const text = game.i18n.format(won ? "BR.Actions.SuccessResult" : "BR.Actions.FailureResult", {
    action: name,
    total: roll.total,
    n: success,
  });
  // A successful Hide changes state for real (book p.10). Rolling any other
  // action while hidden does NOT unhide — only moving, attacking, or being
  // discovered does.
  let effect = "";
  if (won && actionId === "hide" && !actor.system.hidden) {
    await actor.update({ "system.hidden": true });
    effect = `<p class="br-action-note">🌫 ${game.i18n.format("BR.Actions.NowHidden", { name: actor.name })}</p>`;
  }
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [roll],
    flavor: name,
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p class="${won ? "success" : "failure"}">${won ? "✅" : "❌"} ${text}</p>
        ${bonus ? `<p class="br-action-note">❤ ${game.i18n.localize("BR.Actions.LoverBonus")}</p>` : ""}
        ${injury ? `<p class="br-action-note">🩹 ${game.i18n.format("BR.Actions.ModInjury", { n: injury })}</p>` : ""}
        ${debuff ? `<p class="br-action-note">⚠ ${game.i18n.format("BR.Actions.ModDebuff", { n: debuff })}</p>` : ""}
        ${item ? `<p class="br-action-note">🎒 ${game.i18n.format("BR.Actions.ModItem", { item: carriedItem(actor).name, n: item })}</p>` : ""}
        ${morale ? `<p class="br-action-note">⬆ ${game.i18n.localize("BR.Actions.ModMorale")}</p>` : ""}
        ${effect}
      </div>`,
  });
  // A successful Move rolls the direction automatically — no extra click; a
  // failed one means the player stays put.
  if (won && actionId === "move") await onDirectionRoll(actor);
}

/** Six-action choice dialog shared by Overseer and Mimic; `last` is the 7th button. */
async function chooseActionDialog(actor, { title, icon, promptKey, last }) {
  return foundry.applications.api.DialogV2.wait({
    window: { title, icon },
    content: `<p>${game.i18n.format(promptKey, { name: actor.name })}</p>`,
    buttons: [
      ...OVERSEER_RANDOM.map((id) => ({
        action: id,
        label: `BR.Actions.${ACTIONS[id].key}.Name`,
        icon: `fa-solid ${OVERSEER_FA[id]}`,
      })),
      last,
    ],
    rejectClose: false,
  });
}

/** Overseer: pick one of the six actions, or roll the book's random 1d6. */
async function onOverseerChoose(actor) {
  const result = await chooseActionDialog(actor, {
    title: "BR.Actions.OverseerTitle",
    icon: "fa-solid fa-crown",
    promptKey: "BR.Actions.OverseerPrompt",
    last: {
      action: "random",
      label: "BR.Actions.OverseerRandom",
      icon: "fa-solid fa-dice",
      default: true,
    },
  });
  if (!result) return;
  if (result === "random") {
    const roll = await new Roll("1d6").evaluate();
    await postActionCard(actor, { actionId: OVERSEER_RANDOM[roll.total - 1], roll });
    return;
  }
  await postActionCard(actor, { actionId: result });
}

/** Mimic: copy one of the six actions, or do nothing. */
async function onMimicChoose(actor) {
  const result = await chooseActionDialog(actor, {
    title: "BR.Actions.MimicTitle",
    icon: "fa-solid fa-masks-theater",
    promptKey: "BR.Actions.MimicPrompt",
    last: {
      action: "nothing",
      label: "BR.Actions.DoNothing",
      icon: "fa-solid fa-ban",
      default: true,
    },
  });
  if (!result || result === "nothing") return;
  await postActionCard(actor, { actionId: result });
}

/**
 * Move direction: 2d6 on the book's compass table, then actually move the
 * player — token if placed, Location field otherwise. 4+ reaches the intended
 * area; a miss or a blocked/off-map square falls back clockwise to the first
 * open one; boxed in entirely means staying put. Untracked players (no
 * Location) just get the bare direction. Found lovers follow via the hook.
 */
async function onDirectionRoll(actor) {
  // Direction rolls reached outside the action card (In Love "find", Abandon)
  // still respect a trap hold.
  if (isStuck(actor)) return postStuckNote(actor);
  const roll = await new Roll("2d6").evaluate();
  const direction = MOVE_DIRECTIONS[roll.total];
  let text;
  let moved = false;
  // Injury and item Move modifiers shift the 4+ reach check but not the
  // compass — a limp slows you down, it doesn't bend the direction table.
  const moveInjury = injuryMod(actor, "move");
  const moveDebuff = debuffMod(actor, "move");
  const moveItem = itemMod(actor, "move");
  const moveMorale = actor.system.morale ? 1 : 0;
  const movePenalty = moveInjury + moveDebuff + moveItem + moveMorale;
  await spendMorale(actor);
  if (!parseCell(actor.system.location)) {
    text = game.i18n.format("BR.Actions.DirectionResult", { direction, total: roll.total });
  } else {
    const dest = resolveDestination(
      actor.system.location,
      direction,
      roll.total + movePenalty >= 4,
    );
    if (!dest) {
      text = game.i18n.format("BR.Actions.MoveStuck", {
        cell: actor.system.location,
        total: roll.total,
      });
    } else {
      await moveActorToCell(actor, dest.label);
      moved = true;
      text = game.i18n.format(dest.fallback ? "BR.Actions.MoveBlocked" : "BR.Actions.MoveResult", {
        direction,
        cell: dest.label,
        total: roll.total,
      });
    }
  }
  await ChatMessage.create({
    speaker: { alias: actor.name },
    rolls: [roll],
    flavor: game.i18n.localize("BR.Actions.Direction"),
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p>🧭 ${text}</p>
        ${moveInjury ? `<p class="br-action-note">🩹 ${game.i18n.format("BR.Actions.ModInjury", { n: moveInjury })}</p>` : ""}
        ${moveDebuff ? `<p class="br-action-note">⚠ ${game.i18n.format("BR.Actions.ModDebuff", { n: moveDebuff })}</p>` : ""}
        ${moveItem ? `<p class="br-action-note">🎒 ${game.i18n.format("BR.Actions.ModItem", { item: carriedItem(actor).name, n: moveItem })}</p>` : ""}
        ${moveMorale ? `<p class="br-action-note">⬆ ${game.i18n.localize("BR.Actions.ModMorale")}</p>` : ""}
      </div>`,
  });
  // Book p.21: every landed move rolls on the Event Chart. Followers (team,
  // lover) move via hooks and never pass through here — one roll per group.
  if (moved) await rollEvent(actor);
}

/**
 * In Love: options depend on the lover relationship — Find Lover (a random
 * move) until they meet, Attack/Comfort/Move once found, Attack/Move only
 * after the lover dies.
 */
async function onInLoveChoose(actor) {
  const { lover, found, dead } = loverState(actor);
  if (!lover) {
    ui.notifications.warn(game.i18n.format("BR.Actions.NoLover", { name: actor.name }));
    return;
  }
  const buttons = !found
    ? [
        {
          action: "find",
          label: "BR.Actions.FindLover",
          icon: "fa-solid fa-magnifying-glass-location",
          default: true,
        },
      ]
    : [
        {
          action: "attack",
          label: "BR.Actions.Attack.Name",
          icon: `fa-solid ${OVERSEER_FA.attack}`,
        },
        ...(dead
          ? []
          : [
              {
                action: "comfort",
                label: "BR.Actions.Comfort.Name",
                icon: `fa-solid ${OVERSEER_FA.comfort}`,
              },
            ]),
        { action: "move", label: "BR.Actions.Move.Name", icon: `fa-solid ${OVERSEER_FA.move}` },
      ];
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "BR.Actions.InLoveTitle", icon: "fa-solid fa-heart" },
    content: `<p>${loverStatusLine(actor)}</p>
      <p>${game.i18n.format("BR.Actions.InLovePrompt", { name: actor.name })}</p>`,
    buttons,
    rejectClose: false,
  });
  if (!result) return;
  if (result === "find") return onDirectionRoll(actor);
  await postActionCard(actor, { actionId: result });
}

/**
 * Abandon (book p.12): the player secretly leaves their team — no roll, the
 * departure just happens (whispered to the GM). With other living players at
 * their location they move away (direction roll); alone, they stay put. The
 * team is cleared BEFORE the move so team auto-follow can't drag the
 * ex-teammates along. A found lover still follows — love isn't the team.
 */
async function onAbandonRoll(actor) {
  const team = actor.system.team?.trim();
  if (team) {
    await actor.update({ "system.team": "" });
    await ChatMessage.create({
      speaker: { alias: game.i18n.localize("BR.Setup.Overseer") },
      whisper: ChatMessage.getWhisperRecipients("GM"),
      content: `
        <div class="battle-royale lover-pairs">
          <p>🚪 ${game.i18n.format("BR.Actions.AbandonLeaves", { name: actor.name, team })}</p>
        </div>`,
    });
  }
  const location = actor.system.location;
  const othersHere =
    !!location &&
    game.actors.some(
      (p) =>
        p.type === "player" &&
        p.id !== actor.id &&
        !p.system.dead &&
        p.system.location === location,
    );
  if (othersHere) return onDirectionRoll(actor);
  await ChatMessage.create({
    speaker: { alias: actor.name },
    content: `
      <div class="battle-royale success-card">
        ${cardHeader(actor)}
        <p>🧍 ${game.i18n.format("BR.Actions.AbandonStays", { name: actor.name })}</p>
        ${team ? "" : `<p class="br-action-note">${game.i18n.format("BR.Actions.AbandonNoTeam", { name: actor.name })}</p>`}
      </div>`,
  });
}

const HANDLERS = {
  successRoll: (actor, actionId) => onSuccessRoll(actor, actionId),
  overseerChoose: (actor) => onOverseerChoose(actor),
  mimicChoose: (actor) => onMimicChoose(actor),
  inLoveChoose: (actor) => onInLoveChoose(actor),
  directionRoll: (actor) => onDirectionRoll(actor),
  attackRoll: (actor) => onAttackRoll(actor),
  damageRoll: (actor, actionId, flags) => onDamageRoll(actor, flags),
  injuryRoll: (actor, actionId, flags) => onInjuryRoll(actor, flags),
  searchRoll: (actor) => onSearchRoll(actor),
  searchSuccessRoll: (actor) => onSearchSuccessRoll(actor),
  itemRoll: (actor) => onItemRoll(actor),
  convinceRoll: (actor) => onConvinceRoll(actor),
  comfortRoll: (actor) => onComfortRoll(actor),
  abandonRoll: (actor) => onAbandonRoll(actor),
  lootTake: (actor, actionId, flags) => onLootTake(actor, flags),
  lootLeave: (actor, actionId, flags) => onLootLeave(actor, flags),
  pleaRoll: (actor) => onDesperationPlea(actor),
  finalTeamChoose: (actor) => onFinalTeamChoose(actor),
  finalReckoningRoll: (actor, actionId, flags) => onFinalReckoningRoll(actor, flags),
};

/** Wire up the chat-card buttons (GM only; others don't see them). */
export function registerActionCards() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (message.getFlag(SYSTEM_ID, "card") !== "action") return;
    const buttons = html.querySelector(".br-card-buttons");
    if (!buttons) return;
    if (!game.user.isGM) {
      buttons.remove();
      return;
    }
    for (const button of buttons.querySelectorAll("[data-br-action]")) {
      button.addEventListener("click", () => {
        const flags = message.flags?.[SYSTEM_ID] ?? {};
        const actor = game.actors.get(flags.actorId);
        if (!actor) return;
        HANDLERS[button.dataset.brAction]?.(actor, flags.actionId, flags);
      });
    }
  });
}
