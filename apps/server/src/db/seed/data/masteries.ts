import type { MasteryDefInput, MasteryEffect, MasteryTree } from '@mistvale/shared';

/**
 * The forty-eight masteries.
 *
 * Sixteen per tree over six tiers — three each at T1–T4, two at T5, two capstones at T6 —
 * exactly as CONTENT_PLAN_EA01 §6 authors them. Every node composes out of the effect
 * vocabulary the engine implements, so publish validation would refuse one that promised a
 * behaviour nothing runs.
 *
 * The shape of a tier is the design: T1 is flat stats a fresh champion feels immediately,
 * the middle tiers are conditions that reward building *around* something, and a capstone
 * changes what a champion is for.
 */

let order = 0;

const node = (
  key: string,
  tree: MasteryTree,
  tier: number,
  name: string,
  description: string,
  effects: MasteryEffect[],
): MasteryDefInput => ({
  key,
  tree,
  tier,
  name,
  description,
  icon: '',
  effects,
  sortOrder: (order += 10),
});

export const MASTERIES: MasteryDefInput[] = [
  // ── Onslaught — what a champion does to the enemy ─────────────────────────
  node('onslaught_blade_oath', 'onslaught', 1, 'Blade Oath', 'Attack +75.', [
    { type: 'stat', stat: 'atk', flat: 75, pct: 0 },
  ]),
  node('onslaught_keen_eye', 'onslaught', 1, 'Keen Eye', 'Critical Rate +5%.', [
    { type: 'stat', stat: 'critRate', flat: 5, pct: 0 },
  ]),
  node('onslaught_heavy_hand', 'onslaught', 1, 'Heavy Hand', 'Critical Damage +10%.', [
    { type: 'stat', stat: 'critDmg', flat: 10, pct: 0 },
  ]),

  node(
    'onslaught_shieldcracker',
    'onslaught',
    2,
    'Shieldcracker',
    'Deals 25% more damage to a target holding a Shield.',
    [{ type: 'damageDealt', pct: 25, condition: { type: 'targetShielded' } }],
  ),
  node(
    'onslaught_bloodrush',
    'onslaught',
    2,
    'Bloodrush',
    'Heals for 5% of the damage dealt while below half health.',
    [{ type: 'lifesteal', pct: 5, condition: { type: 'selfHpBelow', pct: 50 } }],
  ),
  node(
    'onslaught_momentum',
    'onslaught',
    2,
    'Momentum',
    'Speed +6 for each enemy felled, up to three times.',
    [{ type: 'onKill', stat: 'spd', flat: 6, maxStacks: 3, shieldPctMaxHp: 0 }],
  ),

  node(
    'onslaught_fell_the_great',
    'onslaught',
    3,
    'Fell the Great',
    'Deals 6% more damage to anything with a larger health pool than its own.',
    [{ type: 'damageDealt', pct: 6, condition: { type: 'targetMaxHpAbove' } }],
  ),
  node(
    'onslaught_opportunist',
    'onslaught',
    3,
    'Opportunist',
    'Deals 12% more damage to a target that cannot act.',
    [{ type: 'damageDealt', pct: 12, condition: { type: 'targetCrowdControlled' } }],
  ),
  node(
    'onslaught_grim_cycle',
    'onslaught',
    3,
    'Grim Cycle',
    'A blow costing a target at least 30% of its health has a 30% chance to shorten a cooldown by a turn.',
    [{ type: 'cooldownProc', chance: 0.3, minDamagePctMaxHp: 30 }],
  ),

  node(
    'onslaught_methodical',
    'onslaught',
    4,
    'Methodical',
    'Each consecutive basic attack hits 2% harder, to a maximum of 10%. Any other skill resets it.',
    [{ type: 'a1Ramp', pctPerUse: 2, maxPct: 10 }],
  ),
  node(
    'onslaught_bounty_shield',
    'onslaught',
    4,
    'Bounty Shield',
    'Felling an enemy grants a Shield worth 15% of maximum health.',
    [{ type: 'onKill', flat: 0, maxStacks: 1, shieldPctMaxHp: 15 }],
  ),
  node(
    'onslaught_duelists_focus',
    'onslaught',
    4,
    'Duellist’s Focus',
    'Deals 6% more damage in the Arena.',
    [{ type: 'damageDealt', pct: 6, condition: { type: 'mode', mode: 'arena' } }],
  ),

  node(
    'onslaught_executioner',
    'onslaught',
    5,
    'Executioner',
    'Deals 8% more damage to a target below 40% health.',
    [{ type: 'damageDealt', pct: 8, condition: { type: 'targetHpBelow', pct: 40 } }],
  ),
  node(
    'onslaught_fury_brand',
    'onslaught',
    5,
    'Fury Brand',
    'Deals 4% more damage for each debuff it is carrying, up to five.',
    [{ type: 'damageDealt', pct: 4, condition: { type: 'perOwnDebuff', maxStacks: 5 } }],
  ),

  node(
    'onslaught_deathmark',
    'onslaught',
    6,
    'Deathmark',
    'A landed skill has a 60% chance to deal a further 10% of the target’s maximum health — 4% against a boss.',
    [{ type: 'bonusDamageMaxHp', chance: 0.6, pct: 10, bossPct: 4 }],
  ),
  node('onslaught_flawless_edge', 'onslaught', 6, 'Flawless Edge', 'Critical Damage +20%.', [
    { type: 'stat', stat: 'critDmg', flat: 20, pct: 0 },
  ]),

  // ── Bulwark — what a champion survives ────────────────────────────────────
  node('bulwark_ironhide', 'bulwark', 1, 'Ironhide', 'Defence +75.', [
    { type: 'stat', stat: 'def', flat: 75, pct: 0 },
  ]),
  node('bulwark_thickblood', 'bulwark', 1, 'Thickblood', 'Health +810.', [
    { type: 'stat', stat: 'hp', flat: 810, pct: 0 },
  ]),
  node(
    'bulwark_braced',
    'bulwark',
    1,
    'Braced',
    'Takes 5% less damage from skills that strike more than one target.',
    [{ type: 'damageTaken', pct: -5, condition: { type: 'aoeSkill' } }],
  ),

  node(
    'bulwark_menders_gift',
    'bulwark',
    2,
    'Mender’s Gift',
    'Healing and Shields received are 5% stronger.',
    [
      { type: 'healing', mode: 'received', pct: 5 },
      { type: 'healing', mode: 'shieldReceived', pct: 5 },
    ],
  ),
  node(
    'bulwark_shieldwall',
    'bulwark',
    2,
    'Shieldwall',
    'Takes 5% of every blow aimed at an ally.',
    [{ type: 'redirect', pct: 5 }],
  ),
  node(
    'bulwark_first_stand',
    'bulwark',
    2,
    'First Stand',
    'Begins each battle behind a Shield worth 10% of maximum health.',
    [{ type: 'battleStartShield', pctMaxHp: 10, turns: 2 }],
  ),

  node(
    'bulwark_grit',
    'bulwark',
    3,
    'Grit',
    'A single blow costing a quarter of its health has a 50% chance to be answered.',
    [{ type: 'counterProc', trigger: 'heavyHit', chance: 0.5, hpLostPct: 25 }],
  ),
  node(
    'bulwark_wardens_eye',
    'bulwark',
    3,
    'Warden’s Eye',
    'A 20% chance to counterattack whoever silences an ally.',
    [{ type: 'counterProc', trigger: 'allyCrowdControlled', chance: 0.2, hpLostPct: 25 }],
  ),
  node('bulwark_stonefoot', 'bulwark', 3, 'Stonefoot', 'Health +10%.', [
    { type: 'stat', stat: 'hp', flat: 0, pct: 10 },
  ]),

  node(
    'bulwark_bloodguard',
    'bulwark',
    4,
    'Bloodguard',
    'Ally Protection redirects 10% more onto this champion.',
    [{ type: 'protectionBonus', pct: 10 }],
  ),
  node('bulwark_rooted', 'bulwark', 4, 'Rooted', 'Defence +15% while carrying no buffs at all.', [
    { type: 'stat', stat: 'def', flat: 0, pct: 15, condition: { type: 'selfHasNoBuffs' } },
  ]),
  node(
    'bulwark_cleansing_surge',
    'bulwark',
    4,
    'Cleansing Surge',
    'A 25% chance to shrug off one debuff at the start of its turn.',
    [{ type: 'cleanseProc', chance: 0.25, count: 1 }],
  ),

  node('bulwark_unbroken', 'bulwark', 5, 'Unbroken', 'Resistance +50.', [
    { type: 'stat', stat: 'res', flat: 50, pct: 0 },
  ]),
  node('bulwark_vengeful', 'bulwark', 5, 'Vengeful', 'Counterattacks deal 25% more damage.', [
    { type: 'counterDamage', pct: 25 },
  ]),

  node(
    'bulwark_last_bastion',
    'bulwark',
    6,
    'Last Bastion',
    'Survives one lethal blow per battle at a single point of health.',
    [{ type: 'lastStand' }],
  ),
  node(
    'bulwark_immovable',
    'bulwark',
    6,
    'Immovable',
    'Stun, Freeze and Provoke land 5% more often, and maximum health rises 10%.',
    [
      { type: 'debuffChance', pct: 5, hardCcOnly: true },
      { type: 'stat', stat: 'hp', flat: 0, pct: 10 },
    ],
  ),

  // ── Insight — what a champion knows ───────────────────────────────────────
  node('insight_sharpened_senses', 'insight', 1, 'Sharpened Senses', 'Accuracy +40.', [
    { type: 'stat', stat: 'acc', flat: 40, pct: 0 },
  ]),
  node('insight_quickstudy', 'insight', 1, 'Quickstudy', 'Accuracy +25 and Resistance +10.', [
    { type: 'stat', stat: 'acc', flat: 25, pct: 0 },
    { type: 'stat', stat: 'res', flat: 10, pct: 0 },
  ]),
  node('insight_lorekeeper', 'insight', 1, 'Lorekeeper', 'Healing given is 5% stronger.', [
    { type: 'healing', mode: 'dealt', pct: 5 },
  ]),

  node(
    'insight_swarmreader',
    'insight',
    2,
    'Swarmreader',
    'Accuracy +4 for each living enemy, up to four of them.',
    [
      {
        type: 'stat',
        stat: 'acc',
        flat: 4,
        pct: 0,
        condition: { type: 'perLivingEnemy', maxStacks: 4 },
      },
    ],
  ),
  node(
    'insight_bated_breath',
    'insight',
    2,
    'Bated Breath',
    'A 30% chance of 10% turn meter whenever one of its own buffs runs out.',
    [
      {
        type: 'turnMeterProc',
        trigger: 'ownBuffExpired',
        chance: 0.3,
        pct: 10,
        target: 'self',
        threshold: 1,
      },
    ],
  ),
  node(
    'insight_cold_read',
    'insight',
    2,
    'Cold Read',
    'A 30% chance of 10% turn meter whenever one of its own debuffs runs out.',
    [
      {
        type: 'turnMeterProc',
        trigger: 'ownDebuffExpired',
        chance: 0.3,
        pct: 10,
        target: 'self',
        threshold: 1,
      },
    ],
  ),

  node('insight_hexweaver', 'insight', 3, 'Hexweaver', 'Debuffs land 5% more often.', [
    { type: 'debuffChance', pct: 5, hardCcOnly: false },
  ]),
  node(
    'insight_springstep',
    'insight',
    3,
    'Springstep',
    'Gains 5% turn meter when an ally falls.',
    [
      {
        type: 'turnMeterProc',
        trigger: 'allyDied',
        chance: 1,
        pct: 5,
        target: 'self',
        threshold: 1,
      },
    ],
  ),
  node(
    'insight_sustained_ward',
    'insight',
    3,
    'Sustained Ward',
    'Two-piece relic set bonuses are 15% stronger.',
    [{ type: 'setBonusAmplify', pct: 15 }],
  ),

  node(
    'insight_first_strike',
    'insight',
    4,
    'First Strike',
    'The first basic attack against each enemy takes 20% of its turn meter.',
    [{ type: 'firstStrike', pct: 20 }],
  ),
  node(
    'insight_longbrew',
    'insight',
    4,
    'Longbrew',
    'Buffs it places on allies have a 25% chance to last a turn longer.',
    [{ type: 'statusDuration', mode: 'allyBuffs', chance: 0.25, turns: 1, excludeHardCc: false }],
  ),
  node('insight_attuned', 'insight', 4, 'Attuned', 'Healing received is 10% stronger.', [
    { type: 'healing', mode: 'received', pct: 10 },
  ]),

  node('insight_eagle_sight', 'insight', 5, 'Eagle Sight', 'Accuracy +50.', [
    { type: 'stat', stat: 'acc', flat: 50, pct: 0 },
  ]),
  node('insight_nullfield', 'insight', 5, 'Nullfield', 'Resistance +30.', [
    { type: 'stat', stat: 'res', flat: 30, pct: 0 },
  ]),

  node(
    'insight_veilbinder',
    'insight',
    6,
    'Veilbinder',
    'Its own debuffs have a 30% chance to last a turn longer. Stun, Freeze, Sleep and Provoke are excluded.',
    [{ type: 'statusDuration', mode: 'ownDebuffs', chance: 0.3, turns: 1, excludeHardCc: true }],
  ),
  node(
    'insight_wellspring',
    'insight',
    6,
    'Wellspring',
    'Landing two debuffs in a single turn hands the whole team 5% turn meter.',
    [
      {
        type: 'turnMeterProc',
        trigger: 'debuffsLandedInTurn',
        chance: 1,
        pct: 5,
        target: 'team',
        threshold: 2,
      },
    ],
  ),
];
