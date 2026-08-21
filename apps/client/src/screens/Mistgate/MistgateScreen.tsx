import { useEffect, useState } from 'react';
import type { SummonBanner } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import { useRosterStore } from '../../state/rosterStore';
import { useSummonStore } from '../../state/summonStore';
import { OddsPanel } from './OddsPanel';
import { SummonCinematic } from './SummonCinematic';
import styles from './MistgateScreen.module.scss';
import { highlightable } from '../../app/highlight';
import { Heading } from '@/ui/Heading/Heading';
import { Modal } from '@/ui/Modal/Modal';
import { Portrait } from '../../ui/Portrait/Portrait';
import { championArt } from '../../ui/championArt';

/**
 * The Mistgate.
 *
 * Four sigils, ×1 and ×10, and an odds panel one worded button away. Showing the real rates
 * and the live mercy counters within reach of the button is a deliberate choice:
 * the numbers are honest, so there is nothing to gain by hiding them, and a player who
 * can see the pity clock ticking trusts the one they cannot see.
 *
 * The gate is the best moment the game has, so the screen is built to make a player want
 * to press the button: the portal is the largest single thing in the client, the rate-up
 * champions are *faces* rather than a line of names, and the two mercy clocks that matter
 * — epic and legendary — run on the gate itself rather than only inside the odds dialog.
 * A pity counter is anticipation you can read, and hiding it behind a click was leaving
 * the best argument for one more pull in a drawer.
 */

export function MistgateScreen(): JSX.Element {
  const banners = useSummonStore((state) => state.banners);
  const loading = useSummonStore((state) => state.loading);
  const pulling = useSummonStore((state) => state.pulling);
  const error = useSummonStore((state) => state.error);
  const load = useSummonStore((state) => state.load);
  const pull = useSummonStore((state) => state.pull);
  const revealing = useSummonStore((state) => state.revealing);
  const pullSeq = useSummonStore((state) => state.pullSeq);
  const lastPull = useSummonStore((state) => state.lastPull);

  const refreshInventory = useInventoryStore((state) => state.refresh);
  const refreshRoster = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);

  const [selected, setSelected] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  /** Separate from `oddsOpen`: one is "is the dialog up", the other "is the full pool listed". */
  const [oddsExpanded, setOddsExpanded] = useState(false);

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
  const featured = banner.featured
    .map((key) => bundle?.champions.find((champion) => champion.key === key))
    .filter((champion): champion is NonNullable<typeof champion> => Boolean(champion));
  // Only the two a player is actually counting. Common and uncommon mercy is arithmetic
  // nobody waits on, and four bars would make the two that matter harder to find.
  const clocks = banner.pity.filter(
    (state) => state.rarity === 'epic' || state.rarity === 'legendary',
  );
  const canPullOne = banner.sigilsHeld >= 1;
  const canPullTen = banner.sigilsHeld >= 10;

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Call into the mist and see what answers."
        actions={
          <Button size="sm" variant="ghost" onClick={() => setOddsOpen(true)}>
            Odds &amp; mercy
          </Button>
        }
      >
        The Mistgate
      </Heading>

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
            <span className={styles.portalRingInner} />
            <span className={styles.portalCore} />
          </div>

          <h2 className={styles.title}>{banner.name}</h2>
          <p className={styles.blurb}>{banner.description}</p>

          {/* The rate-up champions, as faces. A line reading "Rate up: Aureleth · Vharn"
              asks a player to already know who those are; a portrait with a gold frame
              round it is the argument itself. */}
          {featured.length > 0 && (
            <div className={styles.featured}>
              <span className={styles.featuredLabel}>Rate up</span>
              <ul className={styles.featuredList}>
                {featured.map((champion) => (
                  <li
                    key={champion.key}
                    className={styles.featuredOne}
                    data-rarity={champion.rarity}
                  >
                    <Portrait
                      src={championArt(champion, bundle?.assets).portrait ?? null}
                      name={champion.name}
                      size={56}
                    />
                    <span className={styles.featuredName}>{champion.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              {...highlightable(`button:summon-${banner.key}`)}
              disabled={!canPullOne || pulling}
              onClick={() => void summon(1)}
            >
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

          {/* The two clocks worth watching, on the gate rather than only in the dialog.
              `since` past `after` is mercy already paying — the bar fills and stays full,
              because the bonus keeps growing after the threshold rather than resetting. */}
          {clocks.length > 0 && (
            <ul className={styles.clocks}>
              {clocks.map((clock) => (
                <li key={clock.rarity} className={styles.clock} data-rarity={clock.rarity}>
                  <span className={styles.clockLabel}>{clock.rarity}</span>
                  <span className={styles.clockTrack}>
                    <span
                      className={styles.clockFill}
                      style={{
                        width: `${Math.min(100, clock.after > 0 ? (clock.since / clock.after) * 100 : 100)}%`,
                      }}
                    />
                  </span>
                  <span className={styles.clockText}>
                    {clock.since >= clock.after
                      ? `mercy rising — ${(clock.effectiveChance * 100).toFixed(2)}%`
                      : `${clock.after - clock.since} more without one`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </section>
      </div>

      {/* The rates are a dialog rather than a column, but the way to them is a worded
          button and not a lowercase "i": these are published odds, and a player must be
          able to find them without guessing what an icon means. The panel reads the same
          store the screen does, so an open dialog tracks a mercy counter as it moves. */}
      <Modal
        open={oddsOpen}
        title={`${banner.name} — odds & mercy`}
        onClose={() => setOddsOpen(false)}
        size="info"
      >
        <OddsPanel
          banner={banner}
          expanded={oddsExpanded}
          onToggle={() => setOddsExpanded(!oddsExpanded)}
        />
      </Modal>

      {/* Mounted the moment the button is pressed rather than when the answer comes back,
          so the wind-up plays *over* the round trip instead of after a disabled button.
          Keyed on the pull count: the cinematic is a state machine with six timers in it,
          and starting one over is building a new one. */}
      {(pulling || revealing.length > 0) && (
        <SummonCinematic key={pullSeq} onAgain={() => void summon(lastPull?.count ?? 1)} />
      )}
    </div>
  );
}
