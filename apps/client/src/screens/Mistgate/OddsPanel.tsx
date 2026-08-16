import type { SummonBanner } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import styles from './OddsPanel.module.scss';

/**
 * Odds & Mercy.
 *
 * The published rates, the live mercy counters, and — expanded — every champion the pool
 * can produce. All of it comes from the server with the banner, so what is written here
 * is the table the next pull will roll against rather than a copy of it that could drift.
 *
 * `effectiveChance` is the number that matters and the one shown largest: a player owed
 * an Epic should be able to watch the odds climb.
 */

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

export function OddsPanel({
  banner,
  expanded,
  onToggle,
}: {
  banner: SummonBanner;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const nameOf = (key: string): string =>
    bundle?.champions.find((champion) => champion.key === key)?.name ?? key;

  const rarities = ORDER.filter((rarity) => (banner.rates[rarity] ?? 0) > 0);

  return (
    <Panel title="Odds & Mercy">
      <table className={styles.rates}>
        <thead>
          <tr>
            <th scope="col">Rarity</th>
            <th scope="col">Base</th>
            <th scope="col">Now</th>
          </tr>
        </thead>
        <tbody>
          {rarities.map((rarity) => {
            const base = banner.rates[rarity] ?? 0;
            const state = banner.pity.find((entry) => entry.rarity === rarity);
            const now = state?.effectiveChance ?? base;
            const boosted = now > base + 1e-9;
            return (
              <tr key={rarity} data-rarity={rarity}>
                <th scope="row">{RARITY_LABEL[rarity] ?? rarity}</th>
                <td>{percent(base)}</td>
                <td className={boosted ? styles.boosted : undefined}>{percent(now)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {banner.pity.length > 0 && (
        <div className={styles.pity}>
          {banner.pity.map((state) => {
            const toGo = Math.max(0, state.after - state.since);
            return (
              <div key={state.rarity} className={styles.pityRow}>
                <div className={styles.pityHead}>
                  <span>{RARITY_LABEL[state.rarity] ?? state.rarity} mercy</span>
                  <span className={styles.pitySince}>{state.since} since</span>
                </div>
                <div
                  className={styles.pityBar}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={state.after}
                  aria-valuenow={Math.min(state.since, state.after)}
                  aria-label={`${RARITY_LABEL[state.rarity]} mercy progress`}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (state.since / Math.max(1, state.after)) * 100)}%`,
                    }}
                  />
                </div>
                <p className={styles.pityNote}>
                  {toGo > 0
                    ? `${toGo} more without one, then +${percent(state.step)} per summon.`
                    : `+${percent(state.currentBonus)} and climbing until it lands.`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className={styles.toggle} aria-expanded={expanded} onClick={onToggle}>
        {expanded ? 'Hide the full list' : 'Show every champion in this pool'}
      </button>

      {expanded && (
        <div className={styles.contents}>
          {ORDER.filter((rarity) => (banner.contents[rarity]?.length ?? 0) > 0).map((rarity) => (
            <section key={rarity}>
              <h4 className={styles.contentsHead} data-rarity={rarity}>
                {RARITY_LABEL[rarity] ?? rarity}
                <span className={styles.contentsCount}>
                  {banner.contents[rarity]?.length} · {percent(banner.rates[rarity] ?? 0)} split
                  evenly
                </span>
              </h4>
              <p className={styles.contentsList}>
                {(banner.contents[rarity] ?? []).map(nameOf).sort().join(' · ')}
              </p>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
