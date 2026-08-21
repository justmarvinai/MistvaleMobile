import { useMemo, useState } from 'react';
import {
  MASTERY_MAX_TREES,
  MASTERY_TREES,
  MASTERY_TOTAL_PICKS,
  availableMasteries,
  type ChampionDetail,
  type MasteryDef,
  type MasteryTree,
} from '@mistvale/shared';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { Fui } from '@/fui/react';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import { useTip } from '../../ui/Tooltip/useTooltip';
import styles from './MasteryTrees.module.scss';

/**
 * The three trees.
 *
 * Drawn as a ladder per tree rather than a graph, because that is what the rules actually
 * are: a tier opens when enough has been spent below it in the *same* tree, and a champion
 * may only ever open two of the three. Both rules are evaluated with the shared helper the
 * server enforces with, so a node this screen shows as takeable is one the server takes.
 *
 * **Not the library's `MasteryGrid`, and deliberately.** That component gates a node on one
 * rule — every id in `requires` has a rank — where Mistvale has three, and it takes its
 * nodes once at construction with no setter to change them afterwards. Bending it would
 * mean either re-deriving the rules in its vocabulary or rebuilding the board on every
 * learn. So the board keeps its own structure, which is the part that encodes the rules,
 * and takes the *paint*: each node is a socket from the library's kit and the tree strip
 * is its segmented control. The rule for the whole rework holds — the library owns chrome,
 * React owns behaviour — it just falls the other way here.
 */

const TREE_LABEL: Record<MasteryTree, string> = {
  onslaught: 'Onslaught',
  bulwark: 'Bulwark',
  insight: 'Insight',
};

const TREE_BLURB: Record<MasteryTree, string> = {
  onslaught: 'What it does to the enemy.',
  bulwark: 'What it survives.',
  insight: 'What it knows.',
};

export function MasteryTrees({
  detail,
  busy,
  onLearn,
  onReset,
}: {
  detail: ChampionDetail;
  busy: boolean;
  onLearn: (nodeKey: string) => void;
  onReset: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const items = useInventoryStore((state) => state.items);
  const [tree, setTree] = useState<MasteryTree>('onslaught');

  const state = detail.masteries;

  const nodes = useMemo(
    () => new Map((bundle?.masteries ?? []).map((entry) => [entry.key, entry])),
    [bundle],
  );

  const checks = useMemo(() => availableMasteries(state.chosen, nodes), [state.chosen, nodes]);

  const byTier = useMemo(() => {
    const map = new Map<number, MasteryDef[]>();
    for (const entry of nodes.values()) {
      if (entry.tree !== tree) continue;
      const list = map.get(entry.tier) ?? [];
      list.push(entry);
      map.set(entry.tier, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [nodes, tree]);

  const held = (itemKey: string): number =>
    items.find((entry) => entry.itemKey === itemKey)?.quantity ?? 0;

  // Straight off the published config the server charges from, so a price halved in Admin
  // reads correctly here the moment it is published rather than at the next deploy.
  const tierCosts = useMemo(() => readTierCosts(bundle?.config), [bundle]);
  const itemName = (itemKey: string): string =>
    bundle?.items.find((entry) => entry.key === itemKey)?.name ?? itemKey;

  if (!state.unlocked) {
    return <p className={styles.locked}>{state.lockedReason}</p>;
  }

  if (nodes.size === 0) {
    return <p className={styles.locked}>No masteries are published yet.</p>;
  }

  const spent = state.chosen.length;
  const treeClosed = state.openTrees.length >= MASTERY_MAX_TREES && !state.openTrees.includes(tree);

  return (
    <div className={styles.body}>
      <header className={styles.head}>
        <Fui
          of={SegmentedControl}
          className={styles.trees}
          attrs={{ 'aria-label': 'Mastery trees' }}
          options={{
            value: tree,
            segments: MASTERY_TREES.map((entry) => ({
              value: entry,
              label: TREE_LABEL[entry],
              // A tree already open is where this champion's points live; the badge saves
              // the player switching tabs to find out.
              ...(state.openTrees.includes(entry) ? { badge: '◈' } : {}),
            })),
          }}
          on={{ 'segment:change': (value) => setTree(value as MasteryTree) }}
        />

        <div className={styles.summary}>
          <span className={styles.spent}>
            {spent} / {MASTERY_TOTAL_PICKS} learned
          </span>
          {spent > 0 && (
            <Button variant="ghost" disabled={busy} onClick={onReset}>
              {state.resetCost === 0 ? 'Forget all (free)' : `Forget all · ${state.resetCost} ◈`}
            </Button>
          )}
        </div>
      </header>

      <p className={styles.blurb}>
        {TREE_BLURB[tree]}
        {treeClosed && ' This tree is closed — a champion may only train two.'}
      </p>

      <div className={styles.ladder}>
        {[1, 2, 3, 4, 5, 6].map((tier) => {
          const tierNodes = byTier.get(tier) ?? [];
          const remaining = state.remainingByTier[String(tier)] ?? 0;

          return (
            <section key={tier} className={styles.tier}>
              <header className={styles.tierHead}>
                <span className={styles.tierName}>{tier === 6 ? 'Capstone' : `Tier ${tier}`}</span>
                <span className={styles.tierPicks}>
                  {remaining > 0 ? `${remaining} left` : 'full'}
                </span>
              </header>

              <div className={styles.nodes}>
                {tierNodes.map((entry) => {
                  const learned = state.chosen.includes(entry.key);
                  const check = checks.get(entry.key);
                  const takeable = check?.ok === true;

                  return (
                    <MasteryNode
                      key={entry.key}
                      node={entry}
                      tier={tier}
                      learned={learned}
                      reason={check?.reason ?? undefined}
                      disabled={learned || !takeable || busy}
                      cost={costLine(tierCosts[tier], held, itemName)}
                      onLearn={() => onLearn(entry.key)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface TierCost {
  itemKey: string;
  amount: number;
}

/**
 * The published cost per tier, read out of the content bundle.
 *
 * The server charges from the same `economy.masteryCosts` row, so this is a *display* of
 * the price rather than a second copy of it — halve the gold cost in Admin and both change
 * on the next publish. A malformed row simply shows no price; the server still refuses the
 * spend, which is the safe way round.
 */
function readTierCosts(
  config: Readonly<Record<string, unknown>> | undefined,
): Record<number, TierCost | undefined> {
  const costs: Record<number, TierCost | undefined> = {};
  const table = config?.['economy.masteryCosts'];
  if (!table || typeof table !== 'object' || Array.isArray(table)) return costs;

  for (const [tier, value] of Object.entries(table as Record<string, unknown>)) {
    const parsed = Number.parseInt(tier, 10);
    if (!Number.isInteger(parsed) || !value || typeof value !== 'object') continue;
    const entry = value as { itemKey?: unknown; amount?: unknown };
    if (typeof entry.itemKey !== 'string' || typeof entry.amount !== 'number') continue;
    costs[parsed] = { itemKey: entry.itemKey, amount: entry.amount };
  }
  return costs;
}

/** What a tier costs, and whether the emblems are in hand. */
function costLine(
  cost: TierCost | undefined,
  held: (itemKey: string) => number,
  itemName: (itemKey: string) => string,
): string {
  if (!cost) return '';
  const have = held(cost.itemKey);
  const name = itemName(cost.itemKey);
  return `${cost.amount} ${name}${have < cost.amount ? ` · you have ${have}` : ''}`;
}

/**
 * One node of a tree.
 *
 * Its own component so it can carry a painted tooltip — a hook, and forty-eight of them
 * cannot be called from inside two nested maps.
 *
 * The tooltip is where the *refusal* goes. A node the champion cannot take yet was a
 * greyed button whose reason lived in a native `title`: the browser's grey box, three
 * seconds late, saying "Spend 2 more points in this tier first" in the operating system's
 * font. That sentence is the whole of what a player needs and it was the least visible
 * text on the screen.
 */
function MasteryNode({
  node,
  tier,
  learned,
  reason,
  disabled,
  cost,
  onLearn,
}: {
  node: MasteryDef;
  tier: number;
  learned: boolean;
  reason: string | undefined;
  disabled: boolean;
  cost: string;
  onLearn: () => void;
}): JSX.Element {
  const ref = useTip({
    title: node.name,
    subtitle: `Tier ${tier}`,
    ...(learned ? { slotLabel: 'Learned' } : {}),
    stats: [{ label: 'Cost', value: cost, tone: learned ? 'good' : 'plain' }],
    flavor: node.description,
    ...(!learned && reason ? { requires: [reason] } : {}),
    ...(learned ? {} : { hint: disabled ? undefined : 'Click to learn it' }),
  });

  return (
    <button
      ref={ref}
      type="button"
      className={styles.node}
      data-learned={learned ? 'true' : undefined}
      disabled={disabled}
      onClick={onLearn}
    >
      <span className={styles.nodeName}>{node.name}</span>
      <span className={styles.nodeText}>{node.description}</span>
      {!learned && <span className={styles.nodeCost}>{cost}</span>}
    </button>
  );
}
