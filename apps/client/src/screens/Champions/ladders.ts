import {
  MAX_ASCENSION,
  MAX_AWAKENING,
  type ChampionDetail,
  type ItemDef,
} from '@mistvale/shared';

/**
 * The four ladders, as four rows a player can read.
 *
 * The screen used to be three buttons whose real content lived in a native `title` — so
 * "why can I not press this" was a hover away on a mouse and unreachable on a phone, and
 * the fourth ladder had nowhere to go at all. Every row now says the same four things: what
 * it is, where it stands, what the next rung costs, and — when it is shut — which gate is
 * shut and not merely that one is.
 *
 * Pure, because that last part is the whole difficulty. Awakening alone waits on three
 * separate gates, and "the last star first" versus "after ascension" versus "at the level
 * cap" are three different sentences a player needs to be told apart.
 */

export type LadderId = 'level' | 'rank' | 'ascension' | 'awakening';

export type LadderState =
  /** The next rung can be taken now. */
  | 'ready'
  /** There is a next rung, but something is in the way. */
  | 'blocked'
  /** Nothing left on this ladder. */
  | 'done'
  /** This rarity never had this ladder. */
  | 'absent';

export interface LadderRow {
  id: LadderId;
  label: string;
  /** Where it stands, as a fraction of its own track. */
  track: { filled: number; total: number };
  /** The reading beside the track — "24 / 40", "★4 of 6". */
  reading: string;
  /** What the next rung costs, already worded. Empty when there is nothing to buy. */
  cost: string[];
  state: LadderState;
  /** Why it cannot be taken, when it cannot. One reason: the first one in the way. */
  blockedBy?: string;
  /** The words on the button. */
  action: string;
}

export interface LadderContext {
  detail: ChampionDetail;
  /** Item quantities held, by key. */
  held: ReadonlyMap<string, number>;
  silver: number;
  /** Published item names, so a cost reads "4 Waking Shards" rather than "4 waking_shard". */
  items: readonly Pick<ItemDef, 'key' | 'name'>[];
}

export function ladderRows(context: LadderContext): LadderRow[] {
  return [
    levelRow(context),
    rankRow(context),
    ascensionRow(context),
    awakeningRow(context),
  ];
}

function levelRow({ detail }: LadderContext): LadderRow {
  const { level, levelCap } = detail.champion;
  const done = level >= levelCap;
  return {
    id: 'level',
    label: 'Level',
    track: { filled: level, total: levelCap },
    reading: `${level} / ${levelCap}`,
    cost: done ? [] : ['Brews, champions, or both'],
    state: done ? 'done' : 'ready',
    ...(done ? { blockedBy: 'Raise its star to raise the cap' } : {}),
    action: done ? 'At the cap' : 'Feed',
  };
}

function rankRow({ detail, silver }: LadderContext): LadderRow {
  const { rank } = detail.champion;
  const ceiling = detail.costs.maxRank;
  const cost = detail.costs.rankUp;
  const track = { filled: rank, total: ceiling };

  if (!cost) {
    // A track with no length at all is a different story from one that has been finished,
    // and the server says which rather than leaving it to be inferred from a null.
    const never = !detail.costs.starTrackMoves;
    return {
      id: 'rank',
      label: 'Stars',
      track,
      reading: never ? `★${rank}` : `★${rank} of ${ceiling}`,
      cost: [],
      state: never ? 'absent' : 'done',
      ...(never ? { blockedBy: 'Common champions keep the star they were called at' } : {}),
      action: never ? 'No star track' : 'Fully starred',
    };
  }

  const shortSilver = silver < cost.silver;
  const priced = [
    `${cost.foodCount} × ★${cost.foodRank} champions`,
    `${cost.silver.toLocaleString('en-US')} silver`,
  ];
  const blocked = !cost.atLevelCap
    ? 'Take it to its level cap first'
    : shortSilver
      ? `Short ${(cost.silver - silver).toLocaleString('en-US')} silver`
      : undefined;

  return {
    id: 'rank',
    label: 'Stars',
    track,
    reading: `★${rank} of ${ceiling}`,
    cost: priced,
    state: blocked ? 'blocked' : 'ready',
    ...(blocked ? { blockedBy: blocked } : {}),
    action: `Raise to ★${rank + 1}`,
  };
}

function ascensionRow({ detail, held, items }: LadderContext): LadderRow {
  const { ascension } = detail.champion;
  const cost = detail.costs.ascend;
  const track = { filled: ascension, total: MAX_ASCENSION };

  if (!cost) {
    const absent = !detail.costs.deepens;
    return {
      id: 'ascension',
      label: 'Ascension',
      track,
      reading: absent ? '—' : `${ascension} of ${MAX_ASCENSION}`,
      cost: [],
      state: absent ? 'absent' : 'done',
      ...(absent ? { blockedBy: 'Only Rare champions and above ascend' } : {}),
      action: absent ? 'Never ascends' : 'Fully ascended',
    };
  }

  const missing = Object.entries(cost.items).find(
    ([key, amount]) => (held.get(key) ?? 0) < amount,
  );
  const blocked = !cost.allowedByRank
    ? 'Raise its star first'
    : detail.champion.level < detail.champion.levelCap
      ? 'Take it to its level cap first'
      : missing
        ? `Short ${missing[1] - (held.get(missing[0]) ?? 0)} ${nameOf(missing[0], items)}`
        : undefined;

  return {
    id: 'ascension',
    label: 'Ascension',
    track,
    reading: `${ascension} of ${MAX_ASCENSION}`,
    cost: Object.entries(cost.items).map(([key, amount]) => `${amount} ${nameOf(key, items)}`),
    state: blocked ? 'blocked' : 'ready',
    ...(blocked ? { blockedBy: blocked } : {}),
    action: `Ascend to ${ascension + 1}`,
  };
}

function awakeningRow({ detail, held, silver, items }: LadderContext): LadderRow {
  const { awakening } = detail.champion;
  const cost = detail.costs.awaken;
  const track = { filled: awakening, total: MAX_AWAKENING };

  if (!cost) {
    const absent = !detail.costs.deepens;
    return {
      id: 'awakening',
      label: 'Awakening',
      track,
      reading: absent ? '—' : `${awakening} of ${MAX_AWAKENING}`,
      cost: [],
      state: absent ? 'absent' : 'done',
      ...(absent ? { blockedBy: 'Only Rare champions and above awaken' } : {}),
      action: absent ? 'Never awakens' : 'Fully awakened',
    };
  }

  // The order matters: it is the order a player would have to do them in, so the sentence
  // they are shown is the next thing they can actually go and do.
  const blocked = !cost.ready.atMaxRank
    ? `Take it to ★${detail.costs.maxRank} first`
    : !cost.ready.atLevelCap
      ? 'Take it to its level cap first'
      : !cost.ready.atMaxAscension
        ? 'Finish its ascension first'
        : silver < cost.silver
          ? `Short ${(cost.silver - silver).toLocaleString('en-US')} silver`
          : shortItem(cost.items, held, items);

  return {
    id: 'awakening',
    label: 'Awakening',
    track,
    reading: `${awakening} of ${MAX_AWAKENING}`,
    cost: [
      ...Object.entries(cost.items).map(([key, amount]) => `${amount} ${nameOf(key, items)}`),
      `${cost.silver.toLocaleString('en-US')} silver`,
    ],
    state: blocked ? 'blocked' : 'ready',
    ...(blocked ? { blockedBy: blocked } : {}),
    action: `Awaken to ${awakening + 1}`,
  };
}

function shortItem(
  cost: Record<string, number>,
  held: ReadonlyMap<string, number>,
  items: readonly Pick<ItemDef, 'key' | 'name'>[],
): string | undefined {
  const missing = Object.entries(cost).find(([key, amount]) => (held.get(key) ?? 0) < amount);
  if (!missing) return undefined;
  return `Short ${missing[1] - (held.get(missing[0]) ?? 0)} ${nameOf(missing[0], items)}`;
}

/** An item's published name, or its key — which is at least something to search for. */
function nameOf(key: string, items: readonly Pick<ItemDef, 'key' | 'name'>[]): string {
  return items.find((item) => item.key === key)?.name ?? key;
}
