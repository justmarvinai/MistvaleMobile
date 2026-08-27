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
import { clockRarities, poolRange, poolTier, sigilArt } from '../../ui/sigilArt';
import { rarityLabel } from '../../ui/labels';

/**
 * The Mistgate.
 *
 * Four sigils, ×1 and ×10, and an odds panel one worded button away. Showing the real rates
 * and the live mercy counters within reach of the button is a deliberate choice:
 * the numbers are honest, so there is nothing to gain by hiding them, and a player who
 * can see the pity clock ticking trusts the one they cannot see.
 *
 * The gate is a **place** rather than a tab strip over a panel. Four pools is a choice a
 * player makes every time they arrive — which one is worth a sigil today — and the screen
 * had answered it with four text tabs carrying a name and a number. A sigil is a board now:
 * its own painted rune, the count it holds, and the line that actually decides the choice,
 * which is **how good the pool gets**. That last one is derived from the published rates
 * rather than authored (`poolTier`), so it cannot disagree with the odds panel behind it.
 *
 * The gate beside them is the sigil's own art, lit, with the rings turning around it — the
 * ring pair used to turn around a radial gradient, which at any size reads as a spinner
 * that has stopped rather than as a portal.
 *
 * And the mercy clocks are the pool's own best two (`clockRarities`) rather than a fixed
 * epic-and-legendary pair. That filter was right for the Radiant sigil and left the other
 * three gates with no clock at all: the Faded pool tops out at Rare, and rare mercy is
 * exactly what somebody pulling on it is counting.
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

  /** What one of this pool's sigils is called, singular and plural. */
  const sigilName = (count: number): string => {
    const name = bundle?.items.find((item) => item.key === banner.sigilKey)?.name ?? 'Sigil';
    return count === 1 ? name : `${name}s`;
  };

  const featured = banner.featured
    .map((key) => bundle?.champions.find((champion) => champion.key === key))
    .filter((champion): champion is NonNullable<typeof champion> => Boolean(champion));
  const clocks = clockRarities(banner.rates)
    .map((rarity) => banner.pity.find((state) => state.rarity === rarity))
    .filter((state): state is NonNullable<typeof state> => Boolean(state));
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
        {/* A rail rather than a tab strip. The four pools are the screen's one real choice,
            and a row of four 40px tabs is the shape a settings page uses for panes nobody
            is choosing between. Still a tablist: one of them is showing, the others are
            not, and that is exactly what the role means. */}
        <div className={styles.sigils} role="tablist" aria-label="Sigils">
          {banners.map((entry) => {
            const [floor, tier] = poolRange(entry.rates);
            const chosen = entry.key === banner.key;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={chosen}
                className={styles.sigil}
                data-tier={tier}
                onClick={() => setSelected(entry.key)}
              >
                <span
                  className={styles.sigilArt}
                  style={{ backgroundImage: `var(--fui-img-${sigilArt(entry.key)})` }}
                  aria-hidden="true"
                />
                <span className={styles.sigilText}>
                  <span className={styles.sigilName}>{entry.name}</span>
                  {/* The line that decides which gate is worth a sigil, and the screen has
                      never said it. A *range* rather than a ceiling: three of the four
                      pools can produce a Legendary, so "up to Legendary" is true on three
                      boards and tells a player nothing. The floor is the half that
                      separates them. Read off the pool's own published rates. */}
                  <span className={styles.sigilTier}>
                    {floor === tier
                      ? rarityLabel(tier)
                      : `${rarityLabel(floor)} – ${rarityLabel(tier)}`}
                  </span>
                </span>
                <span className={styles.sigilCount} data-empty={entry.sigilsHeld === 0}>
                  {entry.sigilsHeld}
                </span>
              </button>
            );
          })}
        </div>

        <section className={styles.gate} data-tier={poolTier(banner.rates)}>
          <div className={styles.portal} aria-hidden="true">
            <span className={styles.portalRing} />
            <span className={styles.portalRingInner} />
            <span className={styles.portalGlow} />
            <span
              className={styles.portalSigil}
              style={{ backgroundImage: `var(--fui-img-${sigilArt(banner.key)})` }}
            />
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

          {/* A button in a gacha screen should say what it costs before it is pressed.
              These said "Summon ×1" and put the price in a sentence underneath — the wrong
              way round, since the count is the obvious half and the price is the decision.
              Still the painted button: the chrome is the library's and the two lines
              inside it are ours. */}
          <div className={styles.actions}>
            <Button
              {...highlightable(`button:summon-${banner.key}`)}
              size="lg"
              disabled={!canPullOne || pulling}
              onClick={() => void summon(1)}
            >
              <span className={styles.summonLabel}>
                <span className={styles.summonCount}>Summon ×1</span>
                <span className={styles.summonCost}>1 {sigilName(1)}</span>
              </span>
            </Button>
            <Button size="lg" disabled={!canPullTen || pulling} onClick={() => void summon(10)}>
              <span className={styles.summonLabel}>
                <span className={styles.summonCount}>Summon ×10</span>
                <span className={styles.summonCost}>
                  10 {sigilName(10)}
                  {banner.tenPullFloor && ` · 1 ${rarityLabel(banner.tenPullFloor)} guaranteed`}
                </span>
              </span>
            </Button>
          </div>

          {/* What is in the purse, and nothing about where more comes from: the four
              sigils have four different sources — the Faded one falls off 36 campaign
              stages, the Radiant one falls nowhere and is paid only by missions and
              quests — and none of that is on the wire. A sentence the client cannot
              derive is a sentence that goes stale the first time an operator retunes a
              drop table. */}
          <p className={styles.held} data-empty={banner.sigilsHeld === 0}>
            {banner.sigilsHeld} {sigilName(banner.sigilsHeld)} held
          </p>

          {/* The clocks worth watching, on the gate rather than only in the dialog.
              `since` past `after` is mercy already paying — the bar fills and stays full,
              because the bonus keeps growing after the threshold rather than resetting. */}
          {clocks.length > 0 && (
            <ul className={styles.clocks}>
              {clocks.map((clock) => (
                <li key={clock.rarity} className={styles.clock} data-rarity={clock.rarity}>
                  <span className={styles.clockLabel}>{rarityLabel(clock.rarity)} mercy</span>
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
                      ? `rising — ${(clock.effectiveChance * 100).toFixed(2)}%`
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
          store the screen does, so an open dialog tracks a mercy counter as it moves.

          The dialog is titled with the pool, and the panel inside it no longer repeats
          "Odds & Mercy" underneath — C12c's rule, and this screen was still breaking it. */}
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
