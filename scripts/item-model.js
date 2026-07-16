const fields = foundry.data.fields;

/** A modifier field for one action's rolls. */
const mod = () => new fields.NumberField({ required: true, integer: true, initial: 0 });

/**
 * A Battle Royale item (book Items Table, pp.22-25). One per player, max —
 * enforced by the createItem hook, not the schema. `mods` keys are action
 * ids; `special` is the book's freetext rider (automation deferred).
 */
export class ItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // The item's row on the d100 Items Table; null for homebrew items.
      rollNumber: new fields.NumberField({
        integer: true,
        min: 1,
        max: 100,
        nullable: true,
        initial: null,
      }),
      weapon: new fields.BooleanField({ initial: false }),
      mods: new fields.SchemaField({
        attack: mod(),
        move: mod(),
        hide: mod(),
        search: mod(),
        comfort: mod(),
        convince: mod(),
      }),
      multiTarget: new fields.BooleanField({ initial: false }),
      areaAffect: new fields.BooleanField({ initial: false }),
      scoped: new fields.BooleanField({ initial: false }),
      loseOnFailure: new fields.BooleanField({ initial: false }),
      special: new fields.StringField({ required: true, initial: "", blank: true }),
    };
  }
}
