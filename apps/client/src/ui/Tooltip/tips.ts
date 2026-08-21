import type {
  ChampionDef,
  GearInstance,
  GearSetDef,
  ItemDef,
  RosterChampion,
} from '@mistvale/shared';
import type { TooltipOptions } from '@/fui/components/Tooltip.ts';
import { statLabel } from '../statLabels';
import { RELIC_SLOT_LABEL } from '../relicArt';

/**
 * What the things in this game are, as tooltip content.
 *
 * The combat tips (`screens/Battle/combatTips.ts`) were the first of these and proved the
 * shape: keep the *wording* out of React so it can be tested on its own, because these
 * sentences are the game explaining its own rules and a sentence in a component is a
 * sentence nobody checks.
 *
 * This is the same idea for everything outside a fight — a relic, a reward, a champion, a
 * stat. One builder per kind of thing, so the relic you hover in the vault says exactly
 * what the relic you hover on a champion says. Two copies of that answer would have
 * disagreed by the second time either was edited.
 *
 * Every builder takes plain data and returns plain options. Nothing here reads a store.
 */

// ── Relics ──────────────────────────────────────────────────────────────────

const amount = (line: { value: number; percent: boolean }): string =>
  `+${line.value}${line.percent ? '%' : ''}`;

/** What a rank of stars is worth saying: relics come at ★1–★6 and it caps their growth. */
const stars = (rank: number): string => '★'.repeat(rank) + '☆'.repeat(Math.max(0, 6 - rank));

export interface RelicTipContext {
  /** The set's published definition, for its name and what wearing several does. */
  set?: GearSetDef | undefined;
  /** How many pieces of this set the champion is already wearing, where a champion is known. */
  wearing?: number | undefined;
  /** The champion wearing it, when the caller knows and it is not the obvious one. */
  wornBy?: string | undefined;
  /** A line pinned to the bottom — what pressing it would do. */
  hint?: string | undefined;
}

/**
 * A relic, as a tooltip.
 *
 * The card already draws the numbers; what a tooltip adds is the *sentence* — which set
 * this is, what the set does when it is complete, and how far off complete it is. That
 * last one is the question a player actually has while looking at a socket, and the only
 * place it was answered was a panel two tabs away.
 */
export function relicTip(relic: GearInstance, context: RelicTipContext = {}): TooltipOptions {
  const setName = context.set?.name ?? relic.setKey;
  const stats: NonNullable<TooltipOptions['stats']> = [
    {
      label: statLabel(relic.main.stat),
      value: amount(relic.main),
      tone: 'magic',
    },
  ];

  for (const sub of relic.substats) {
    stats.push({
      label: statLabel(sub.stat),
      value: `${amount(sub)}${(sub.rolls ?? 1) > 1 ? ` (${sub.rolls})` : ''}`,
      tone: 'plain',
    });
  }

  stats.push({ label: 'Rank', value: stars(relic.rank), tone: 'plain' });
  stats.push({
    label: 'Upgrade',
    value: relic.level >= 16 ? 'Fully forged' : `+${relic.level} of +16`,
    tone: relic.level >= 16 ? 'good' : 'plain',
  });

  // What the set is worth, and how close the champion is to it. `wearing` is only known
  // when the caller is looking at a champion; in the vault the piece belongs to nobody
  // and the honest line is what the set does, without a count.
  const pieces = context.set?.pieces ?? 0;
  if (context.set && pieces > 0) {
    const have = context.wearing;
    stats.push({
      label: `${setName} set`,
      value:
        have === undefined
          ? `${pieces} pieces`
          : have >= pieces
            ? 'Complete'
            : `${have} of ${pieces}`,
      tone: have !== undefined && have >= pieces ? 'good' : 'plain',
    });
  }

  const requires: string[] = [];
  if (context.wornBy) requires.push(`Worn by ${context.wornBy}`);
  if (relic.locked) requires.push('Locked — it cannot be sold');

  return {
    title: setName,
    rarity: relic.rarity,
    subtitle: RELIC_SLOT_LABEL[relic.slot],
    slotLabel: `+${relic.level}`,
    stats,
    ...(context.set?.lore ? { flavor: context.set.lore } : {}),
    ...(requires.length > 0 ? { requires } : {}),
    ...(context.hint ? { hint: context.hint } : {}),
    width: 300,
  };
}

/** An empty socket, which still has something worth saying: what goes there, and whether it can. */
export function emptySocketTip(slot: GearInstance['slot'], lockedAt?: number): TooltipOptions {
  return {
    title: `${RELIC_SLOT_LABEL[slot]} — empty`,
    subtitle: 'Relic slot',
    ...(lockedAt
      ? {
          requires: [`Opens at ascension ${lockedAt}`],
          flavor: 'Ascending a champion opens the slots the later relics go in.',
        }
      : {
          flavor: 'Relics drop from campaign stages and the Depths, and turn up in the Bazaar.',
          hint: 'Click to fit one',
        }),
  };
}

// ── Rewards ─────────────────────────────────────────────────────────────────

/** What each wallet key is and what it is spent on — the part a number cannot say. */
const SCALAR_TIP: Readonly<Record<string, { subtitle: string; flavor: string }>> = Object.freeze({
  silver: {
    subtitle: 'The working currency',
    flavor: 'Levels champions, forges relics and buys room in the vault.',
  },
  crystals: {
    subtitle: 'The rare currency',
    flavor: 'Sigils at the Mistgate, and a fresh row of stalls at the Bazaar.',
  },
  valorMedals: {
    subtitle: 'Won in the Arena',
    flavor: 'Spent in the Hall of Valor, where the bonuses apply to every champion you own.',
  },
  playerXp: {
    subtitle: 'Account experience',
    flavor: 'Account levels raise the energy cap, refill it, and open new parts of the game.',
  },
  championXp: {
    subtitle: 'Champion experience',
    flavor: 'Split across the champions that fought.',
  },
});

/**
 * A reward, as a tooltip.
 *
 * The reward chips are the single most-repeated element in the game — quests, missions,
 * events, the calendar, mail, the results screen — and every one of them was a word and a
 * number. "1 Gleaming Sigil" tells a player who already knows the game exactly what they
 * won and tells a new one nothing at all.
 */
export function rewardTip(
  key: string,
  amountOf: number,
  context: { name: string; item?: ItemDef | undefined; signed?: boolean } = { name: key },
): TooltipOptions {
  const scalar = SCALAR_TIP[key];
  const item = context.item;

  return {
    title: context.name,
    ...(item?.rarity ? { rarity: item.rarity } : {}),
    subtitle: scalar?.subtitle ?? item?.category ?? 'Reward',
    stats: [
      {
        label: context.signed ? 'Gained' : 'Amount',
        value: `${context.signed ? '+' : ''}${amountOf.toLocaleString('en-US')}`,
        tone: 'good',
      },
    ],
    ...(item?.description || scalar?.flavor ? { flavor: item?.description || scalar!.flavor } : {}),
  };
}

// ── Champions ───────────────────────────────────────────────────────────────

/**
 * A champion you own, as a tooltip.
 *
 * For the pickers. The card says rarity, level and power at a glance; what it cannot fit
 * is the pair of facts that decide a team — which affinity it brings against what you are
 * about to fight, and how much of its kit is actually equipped.
 */
export function championTip(
  champion: RosterChampion,
  def: ChampionDef | undefined,
  context: { faction?: string | undefined; hint?: string | undefined } = {},
): TooltipOptions {
  const stats: NonNullable<TooltipOptions['stats']> = [
    { label: 'Level', value: `${champion.level} / ${champion.levelCap}`, tone: 'plain' },
    { label: 'Rank', value: stars(champion.rank), tone: 'plain' },
  ];
  if (champion.ascension > 0) {
    stats.push({ label: 'Ascension', value: champion.ascension, tone: 'magic' });
  }
  if (def?.element) stats.push({ label: 'Affinity', value: titleCase(def.element), tone: 'magic' });
  if (def?.role) stats.push({ label: 'Role', value: titleCase(def.role), tone: 'plain' });
  stats.push({
    label: 'Relics',
    value: `${champion.equippedGearIds.length} of 6`,
    tone: champion.equippedGearIds.length >= 6 ? 'good' : 'plain',
  });
  stats.push({ label: 'Power', value: champion.power.toLocaleString('en-US'), tone: 'good' });

  const requires: string[] = [];
  if (champion.locked) requires.push('Locked — it cannot be fed away');

  return {
    title: def?.name ?? champion.championKey,
    ...(def?.rarity ? { rarity: def.rarity } : {}),
    subtitle: context.faction ?? def?.title ?? 'Champion',
    ...(def?.title && context.faction ? { slotLabel: def.title } : {}),
    stats,
    ...(requires.length > 0 ? { requires } : {}),
    ...(context.hint ? { hint: context.hint } : {}),
    width: 300,
  };
}

// ── Stats ───────────────────────────────────────────────────────────────────

/**
 * What a stat actually does.
 *
 * Four of the eight are self-evident and four are not: speed decides how often a champion
 * acts, accuracy and resistance are the pair that decides whether a debuff lands, and
 * critical damage is a multiplier rather than an addition. A player who does not know that
 * cannot read their own stat table, and the table never said.
 */
const STAT_TIP: Readonly<Record<string, { title: string; flavor: string }>> = Object.freeze({
  hp: { title: 'Health', flavor: 'How much damage this champion can take before it falls.' },
  atk: { title: 'Attack', flavor: 'What most damage is scaled from.' },
  def: {
    title: 'Defence',
    flavor: 'Reduces incoming damage. Some skills scale their own damage from it instead.',
  },
  spd: {
    title: 'Speed',
    flavor:
      'How often this champion acts. The whole turn order is built from it, which is why it is the stat most fights are actually decided by.',
  },
  critRate: { title: 'Critical rate', flavor: 'The chance a hit lands as a critical.' },
  critDmg: {
    title: 'Critical damage',
    flavor: 'How much harder a critical hits. It does nothing without a rate to trigger it.',
  },
  res: {
    title: 'Resistance',
    flavor: 'Weighed against the attacker’s accuracy to decide whether a debuff lands on you.',
  },
  acc: {
    title: 'Accuracy',
    flavor: 'Weighed against the target’s resistance to decide whether your debuffs land.',
  },
});

/** A row of the stat table, as a tooltip. */
export function statTip(
  stat: string,
  values: { base: number; gear: number; masteries: number; total: number },
): TooltipOptions {
  const known = STAT_TIP[stat];
  const round = (value: number): string => Math.round(value).toLocaleString('en-US');

  return {
    title: known?.title ?? statLabel(stat),
    subtitle: 'Stat',
    stats: [
      { label: 'Base', value: round(values.base), tone: 'plain' },
      {
        label: 'From relics',
        value: values.gear > 0 ? `+${round(values.gear)}` : '—',
        tone: values.gear > 0 ? 'good' : 'plain',
      },
      {
        label: 'From masteries',
        value: values.masteries > 0 ? `+${round(values.masteries)}` : '—',
        tone: values.masteries > 0 ? 'good' : 'plain',
      },
      { label: 'Total', value: round(values.total), tone: 'magic' },
    ],
    ...(known ? { flavor: known.flavor } : {}),
  };
}

/** `void` → `Void`. Affinities and roles are lower-case keys and title case in a sentence. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
