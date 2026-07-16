import { SUIT_CHOICES, RANK_CHOICES, cardLabel, cardIcon } from "./cards.js";

const fields = foundry.data.fields;

// Names Foundry hands out for a fresh actor; these get replaced with the card name.
const DEFAULT_NAME_RE = /^(New\s+)?(Actor|Player)(\s+\(\d+\))?$/i;

/**
 * A Battle Royale contestant. One actor per playing card.
 * Name, portrait, and prototype token are derived from the card so bulk
 * creation (e.g. a macro spawning all 52) gets correct art automatically.
 * Remaining roster stats (Item, Mod) are deferred.
 */
export class PlayerModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      suit: new fields.StringField({ required: true, initial: "hearts", choices: SUIT_CHOICES }),
      rank: new fields.StringField({ required: true, initial: "2", choices: RANK_CHOICES }),
      gender: new fields.StringField({ required: true, initial: "", blank: true }),
      personality: new fields.StringField({ required: true, initial: "", blank: true }),
      region: new fields.StringField({ required: true, initial: "", blank: true }),
      location: new fields.StringField({ required: true, initial: "", blank: true }),
      lover: new fields.StringField({ required: true, initial: "", blank: true }), // Actor id
      loverFound: new fields.BooleanField({ initial: false }),
      enraged: new fields.BooleanField({ initial: false }),
      hidden: new fields.BooleanField({ initial: false }),
      morale: new fields.BooleanField({ initial: false }), // one-shot +1 to the next action

      injuries: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      // Timed hazard penalties; `stuck` marks a trap victim (Move blocked).
      debuffs: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, initial: "" }),
          affects: new fields.ObjectField(),
          rounds: new fields.NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          stuck: new fields.BooleanField({ initial: false }),
        }),
        { initial: [] },
      ),
      kills: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      team: new fields.StringField({ required: true, initial: "" }),
      dead: new fields.BooleanField({ initial: false }),
    };
  }

  /** e.g. "Jack of Hearts" */
  get cardName() {
    return cardLabel(this.suit, this.rank);
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const img = cardIcon(this.suit, this.rank);
    const keepName = data.name && !DEFAULT_NAME_RE.test(data.name);
    this.parent.updateSource({
      name: keepName ? data.name : this.cardName,
      img,
      prototypeToken: {
        width: 0.5,
        height: 0.5,
        actorLink: true,
        texture: { src: img },
        displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
      },
    });
  }

  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    // Team auto-follow needs to know which square the mover left; the hook
    // only sees post-update state, so the old location rides in the options.
    if (changes.system?.location !== undefined) options.brPriorLocation = this.location;
    const suit = changes.system?.suit;
    const rank = changes.system?.rank;
    if (suit === undefined && rank === undefined) return;
    const newSuit = suit ?? this.suit;
    const newRank = rank ?? this.rank;
    const img = cardIcon(newSuit, newRank);
    // Only auto-rename when the name is still the derived one (don't clobber customs).
    if (changes.name === undefined && this.parent.name === this.cardName) {
      changes.name = cardLabel(newSuit, newRank);
    }
    changes.img ??= img;
    if (foundry.utils.getProperty(changes, "prototypeToken.texture.src") === undefined) {
      foundry.utils.setProperty(changes, "prototypeToken.texture.src", img);
    }
  }
}
