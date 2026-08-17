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
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import styles from './MasteryTrees.module.scss';

/**
 * The three trees.
 *
 * Drawn as a ladder per tree rather than a graph, because that is what the rules actually
 * are: a tier opens when enough has been spent below it in the *same* tree, and a champion
 * may only ever open two of the three. Both rules are evaluated with the shared helper the
 * server enforces with, so a node this screen shows as takeable is one the server takes.
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
        <div className={styles.trees} role="tablist" aria-label="Mastery trees">
          {MASTERY_TREES.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tree === entry}
              className={styles.tree}
              data-open={state.openTrees.includes(entry) ? 'true' : undefined}
              onClick={() => setTree(entry)}
            >
              {TREE_LABEL[entry]}
            </button>
          ))}
        </div>

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
                    <button
                      key={entry.key}
                      type="button"
                      className={styles.node}
                      data-learned={learned ? 'true' : undefined}
                      disabled={learned || !takeable || busy}
                      title={learned ? 'Already learned.' : (check?.reason ?? entry.description)}
                      onClick={() => onLearn(entry.key)}
                    >
                      <span className={styles.nodeName}>{entry.name}</span>
                      <span className={styles.nodeText}>{entry.description}</span>
                      {!learned && (
                        <span className={styles.nodeCost}>
                          {costLine(tierCosts[tier], held, itemName)}
                        </span>
                      )}
                    </button>
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
