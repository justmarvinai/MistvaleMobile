import type { ShopDefInput } from '@mistvale/shared';

/**
 * Food offers, one per element so a rank-up never has to wait on a specific breath.
 *
 * Broodlings are the ★1 fodder a fresh account ranks up on; Broodguards are the ★3 tier
 * that saves a mid-game player an evening of farming (docs/ECONOMY_BALANCE.md §3).
 */
const FOOD_OFFERS: ShopDefInput['offers'] = (['ember', 'tide', 'verdant'] as const).flatMap(
  (element) => [
    {
      key: `broodling_${element}`,
      kind: 'champion' as const,
      name: `${element[0]!.toUpperCase()}${element.slice(1)} Broodling`,
      weight: 28,
      currency: 'silver' as const,
      price: 6_000,
      refKey: `sskarn_broodling_${element}`,
      quantity: 1,
      minAccountLevel: 1,
      dailyLimit: 0,
      pricePerRank: 0,
    },
    {
      key: `broodguard_${element}`,
      kind: 'champion' as const,
      name: `${element[0]!.toUpperCase()}${element.slice(1)} Broodguard`,
      weight: 9,
      currency: 'silver' as const,
      price: 39_000,
      refKey: `sskarn_broodguard_${element}`,
      quantity: 1,
      minAccountLevel: 6,
      dailyLimit: 0,
      pricePerRank: 0,
    },
  ],
);

/**
 * The Bazaar.
 *
 * Rotating stock on an hour's timer, four free slots and four a player can open with
 * crystals (docs/ECONOMY_BALANCE.md §10). Every price, weight and band is here rather
 * than in the service, so re-pricing the shop is an Admin edit — including adding an
 * offer that did not exist when the code was written.
 *
 * Weights are relative within the shop. Relic offers describe a *band*: the actual piece
 * is rolled when the slot is stocked, exactly as a drop is, so what appears is as
 * unguessable as a summon and as auditable afterwards.
 */

export const SHOPS: ShopDefInput[] = [
  {
    key: 'bazaar',
    name: 'The Bazaar',
    description:
      'Traders who follow the mist line. What they have depends entirely on where they have been.',
    restockMinutes: 60,
    baseSlots: 4,
    crystalSlots: 4,
    crystalSlotCost: 150,
    refreshCost: 50,
    sortOrder: 10,
    offers: [
      // ── Always-there staples ───────────────────────────────────────────
      {
        key: 'faded_sigil',
        kind: 'item',
        name: 'Faded Sigil',
        weight: 120,
        currency: 'silver',
        price: 5_000,
        refKey: 'sigil_faded',
        quantity: 1,
        minAccountLevel: 1,
        dailyLimit: 0,
        pricePerRank: 0,
      },
      {
        key: 'gleaming_sigil',
        kind: 'item',
        name: 'Gleaming Sigil',
        weight: 12,
        currency: 'silver',
        price: 200_000,
        refKey: 'sigil_gleaming',
        quantity: 1,
        // The one genuinely aspirational silver purchase; one a day keeps it that way.
        dailyLimit: 1,
        minAccountLevel: 5,
        pricePerRank: 0,
      },

      // ── Essences, the ascension faucet outside the Springs ─────────────
      {
        key: 'lesser_essence_bundle',
        kind: 'item',
        name: 'Lesser Essence Cache',
        weight: 70,
        currency: 'silver',
        price: 12_000,
        refKey: 'essence_pure',
        quantity: 5,
        minAccountLevel: 1,
        dailyLimit: 0,
        pricePerRank: 0,
      },
      {
        key: 'greater_essence_bundle',
        kind: 'item',
        name: 'Greater Essence Cache',
        weight: 35,
        currency: 'silver',
        price: 45_000,
        refKey: 'essence_pure',
        quantity: 22,
        minAccountLevel: 8,
        dailyLimit: 0,
        pricePerRank: 0,
      },

      // ── Food, so rank-up has a silver route as well as a farming one ───
      ...FOOD_OFFERS,

      // ── Relics: the bulk of the stock, and the bulk of the silver sink ─
      {
        key: 'relic_common',
        kind: 'gear',
        name: 'Relic',
        weight: 140,
        currency: 'silver',
        price: 8_000,
        pricePerRank: 6_000,
        refKey: '',
        quantity: 1,
        minAccountLevel: 1,
        dailyLimit: 0,
        gear: {
          rankMin: 1,
          rankMax: 3,
          rarityWeights: { common: 50, uncommon: 32, rare: 15, epic: 3 },
          setKeys: [],
        },
      },
      {
        key: 'relic_fine',
        kind: 'gear',
        name: 'Fine Relic',
        weight: 60,
        currency: 'silver',
        price: 30_000,
        pricePerRank: 14_000,
        refKey: '',
        quantity: 1,
        minAccountLevel: 6,
        dailyLimit: 0,
        gear: {
          rankMin: 3,
          rankMax: 5,
          rarityWeights: { uncommon: 30, rare: 42, epic: 24, legendary: 4 },
          setKeys: [],
        },
      },
      {
        key: 'relic_master',
        kind: 'gear',
        name: "Master's Relic",
        weight: 14,
        currency: 'crystals',
        price: 220,
        pricePerRank: 40,
        refKey: '',
        quantity: 1,
        minAccountLevel: 12,
        dailyLimit: 0,
        gear: {
          rankMin: 5,
          rankMax: 6,
          rarityWeights: { rare: 25, epic: 55, legendary: 20 },
          setKeys: [],
        },
      },

      // ── Convenience ────────────────────────────────────────────────────
      {
        key: 'rations',
        kind: 'item',
        name: 'Warden’s Ration',
        weight: 45,
        currency: 'crystals',
        price: 60,
        refKey: 'energy_pack_large',
        quantity: 1,
        dailyLimit: 2,
        minAccountLevel: 3,
        pricePerRank: 0,
      },
      {
        key: 'epic_tome',
        kind: 'item',
        name: 'Epic Tome',
        weight: 8,
        currency: 'crystals',
        price: 900,
        refKey: 'tome_epic',
        quantity: 1,
        dailyLimit: 1,
        minAccountLevel: 10,
        pricePerRank: 0,
      },
    ],
  },
];
