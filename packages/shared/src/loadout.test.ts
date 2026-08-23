import { describe, expect, it } from 'vitest';
import { planLoadout, slotsCovered, type PlannableGear } from './loadout';

/**
 * What applying a loadout would do.
 *
 * The planner is the whole of the risk in the feature: a loadout is saved once and applied
 * months later, by which time relics have been sold, champions have ascended, and the vault
 * has a cap that unequipping can hit. Every case below is a state of the world a player
 * will reach without doing anything unusual.
 */

const piece = (
  id: string,
  slot: PlannableGear['slot'],
  on: string | null = null,
): PlannableGear => ({
  id,
  slot,
  equippedChampionId: on,
});

const HERO = { id: 'hero', ascension: 6 };

describe('planLoadout', () => {
  it('equips a loose relic and takes off what was in its slot', () => {
    const owned = [piece('new', 'weapon'), piece('old', 'weapon', 'hero')];
    const plan = planLoadout(['new'], owned, HERO);
    expect(plan.equip.map((entry) => entry.gearId)).toEqual(['new']);
    expect(plan.remove.map((entry) => entry.gearId)).toEqual(['old']);
    // One loose relic worn, one worn relic loosed: the vault is exactly as full.
    expect(plan.vaultDelta).toBe(0);
  });

  it('leaves alone a slot the loadout does not cover', () => {
    // A loadout saved before a champion had boots must not strip the boots they have now.
    const owned = [piece('sword', 'weapon'), piece('boots', 'boots', 'hero')];
    const plan = planLoadout(['sword'], owned, HERO);
    expect(plan.remove).toHaveLength(0);
    expect(plan.vaultDelta).toBe(-1);
  });

  it('takes a relic off another champion without touching the vault', () => {
    const owned = [piece('sword', 'weapon', 'other')];
    const plan = planLoadout(['sword'], owned, HERO);
    expect(plan.equip[0]?.fromChampionId).toBe('other');
    // It goes straight from one champion to the other; nothing is loosed and nothing is
    // taken up. A planner that counted this as a removal would refuse on a full vault.
    expect(plan.vaultDelta).toBe(0);
  });

  it('skips a relic that is no longer owned rather than refusing the whole apply', () => {
    // Months-old loadouts naming sold relics are the ordinary case, not an error.
    const plan = planLoadout(['gone', 'sword'], [piece('sword', 'weapon')], HERO);
    expect(plan.equip.map((entry) => entry.gearId)).toEqual(['sword']);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]?.reason).toBe('missing');
  });

  it('skips an accessory the champion has not ascended to, and says the number', () => {
    const owned = [piece('ring', 'ring'), piece('amulet', 'amulet'), piece('banner', 'banner')];
    const plan = planLoadout(['ring', 'amulet', 'banner'], owned, { id: 'hero', ascension: 2 });
    expect(plan.equip.map((entry) => entry.gearId)).toEqual(['ring']);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual(['ascension', 'ascension']);
    expect(plan.skipped[0]?.detail).toMatch(/ascension 4/);
    expect(plan.skipped[1]?.detail).toMatch(/ascension 6/);
  });

  it('is a no-op applied twice', () => {
    // The relic is already on the target: it is neither equipped again nor listed as coming
    // off, and the slot still counts as covered so nothing else is stripped from it.
    const owned = [piece('sword', 'weapon', 'hero')];
    const plan = planLoadout(['sword'], owned, HERO);
    expect(plan.equip).toHaveLength(0);
    expect(plan.remove).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('alreadyOn');
    expect(plan.vaultDelta).toBe(0);
  });

  it('counts the vault correctly for a whole set arriving from the vault', () => {
    const owned = [
      piece('w', 'weapon'),
      piece('h', 'helm'),
      piece('s', 'shield'),
      piece('oldW', 'weapon', 'hero'),
      piece('oldH', 'helm', 'hero'),
    ];
    const plan = planLoadout(['w', 'h', 's'], owned, HERO);
    expect(plan.equip).toHaveLength(3);
    expect(plan.remove).toHaveLength(2);
    // Three loose worn, two worn loosed — one more slot in use than before.
    expect(plan.vaultDelta).toBe(-1);
  });

  it('plans nothing from an empty loadout', () => {
    const plan = planLoadout([], [piece('sword', 'weapon', 'hero')], HERO);
    expect(plan.equip).toHaveLength(0);
    expect(plan.remove).toHaveLength(0);
    expect(plan.vaultDelta).toBe(0);
  });
});

describe('slotsCovered', () => {
  it('lists the slots a loadout fills, in paperdoll order', () => {
    const owned = [piece('b', 'boots'), piece('w', 'weapon'), piece('r', 'ring')];
    expect(slotsCovered(['r', 'b', 'w'], owned)).toEqual(['weapon', 'boots', 'ring']);
  });

  it('ignores a relic that is no longer owned', () => {
    expect(slotsCovered(['gone'], [])).toEqual([]);
  });
});
