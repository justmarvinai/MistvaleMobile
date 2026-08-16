import { useEffect, useState } from 'react';
import type { SummonBanner } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import { useRosterStore } from '../../state/rosterStore';
import { useSummonStore } from '../../state/summonStore';
import { OddsPanel } from './OddsPanel';
import { RevealOverlay } from './RevealOverlay';
import styles from './MistgateScreen.module.scss';

/**
 * The Mistgate.
 *
 * Four sigils, ×1 and ×10, and an odds panel that is not buried. Showing the real rates
 * and the live mercy counters on the same screen as the button is a deliberate choice:
 * the numbers are honest, so there is nothing to gain by hiding them, and a player who
 * can see the pity clock ticking trusts the one they cannot see.
 */

export function MistgateScreen(): JSX.Element {
  const banners = useSummonStore((state) => state.banners);
  const loading = useSummonStore((state) => state.loading);
  const pulling = useSummonStore((state) => state.pulling);
  const error = useSummonStore((state) => state.error);
  const load = useSummonStore((state) => state.load);
  const pull = useSummonStore((state) => state.pull);
  const revealing = useSummonStore((state) => state.revealing);

  const refreshInventory = useInventoryStore((state) => state.refresh);
  const refreshRoster = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);

  const [selected, setSelected] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const banner: SummonBanner | undefined =
    banners.find((entry) => entry.key === selected) ?? banners[0];

  const summon = async (count: 1 | 10): Promise<void> => {
    if (!banner) return;
    try {
      await pull(banner.key, count);
      // The roster and the sigil stack both moved; other screens read them.
      await Promise.all([refreshRoster(), refreshInventory()]);
    } catch {
      // The store already holds the message; the panel below renders it.
    }
  };

  if (loading && banners.length === 0) {
    return (
      <Panel>
        <p className={styles.empty}>Finding the gate…</p>
      </Panel>
    );
  }

  if (!banner) {
    return (
      <Panel>
        <p className={styles.empty}>{error ?? 'No sigils are attuned to this gate yet.'}</p>
      </Panel>
    );
  }

  const sigilName =
    bundle?.items.find((item) => item.key === banner.sigilKey)?.name ?? banner.sigilKey;
  const canPullOne = banner.sigilsHeld >= 1;
  const canPullTen = banner.sigilsHeld >= 10;

  return (
    <div className={styles.screen}>
      <div className={styles.main}>
        <div className={styles.sigils} role="tablist" aria-label="Sigils">
          {banners.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={entry.key === banner.key}
              className={styles.sigil}
              data-pool={entry.key}
              onClick={() => setSelected(entry.key)}
            >
              <span className={styles.sigilName}>{entry.name}</span>
              <span className={styles.sigilCount}>{entry.sigilsHeld}</span>
            </button>
          ))}
        </div>

        <section className={styles.gate}>
          <div className={styles.portal} aria-hidden="true" data-pool={banner.key}>
            <span className={styles.portalRing} />
            <span className={styles.portalCore} />
          </div>

          <h2 className={styles.title}>{banner.name}</h2>
          <p className={styles.blurb}>{banner.description}</p>

          {banner.featured.length > 0 && (
            <p className={styles.featured}>
              Rate up:{' '}
              {banner.featured
                .map(
                  (key) => bundle?.champions.find((champion) => champion.key === key)?.name ?? key,
                )
                .join(' · ')}
            </p>
          )}

          <div className={styles.actions}>
            <Button disabled={!canPullOne || pulling} onClick={() => void summon(1)}>
              Summon ×1
            </Button>
            <Button disabled={!canPullTen || pulling} onClick={() => void summon(10)}>
              Summon ×10
            </Button>
          </div>

          <p className={styles.held}>
            {banner.sigilsHeld} {sigilName}
            {banner.sigilsHeld === 1 ? '' : 's'} held
            {banner.tenPullFloor && (
              <span className={styles.floor}>
                {' '}
                · a ×10 guarantees at least one {banner.tenPullFloor}
              </span>
            )}
          </p>

          {error && <p className={styles.error}>{error}</p>}
        </section>
      </div>

      <aside className={styles.sidebar}>
        <OddsPanel banner={banner} expanded={oddsOpen} onToggle={() => setOddsOpen(!oddsOpen)} />
      </aside>

      {revealing.length > 0 && <RevealOverlay />}
    </div>
  );
}
