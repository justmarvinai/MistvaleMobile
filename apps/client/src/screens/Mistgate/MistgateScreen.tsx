import { useEffect, useState, type CSSProperties } from 'react';
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
 * **The painting is the gate.** The screen used to put an opaque panel over the owner's
 * portal painting and draw a 180px rune in the middle of it, with fourteen hundred pixels of
 * flat dark around the rune — a settings page with a logo on it, in front of the one
 * painting in the game that is literally a gate. There is no panel now. The rail of sigils
 * stands down the left, the pool's own rune hangs in the middle of the room with its rings
 * and its mist, and everything a player *does* — the two summon buttons, the count, the
 * mercy clocks — sits on a plinth across the foot of the scene where the stairs are. The
 * wash over the painting is lighter on this one tab (`tabScenery`) so the portal burns.
 *
 * A sigil is a board rather than a tab: its own painted rune, the count it holds, and the
 * line that actually decides the choice, which is **how good the pool gets**. That line is
 * derived from the published rates rather than authored (`poolTier`), so it cannot disagree
 * with the odds panel behind it — and it is a *range* rather than a ceiling, since three of
 * the four pools can produce a Legendary and "up to Legendary" would separate nothing.
 *
 * The mercy clocks are the pool's own best two (`clockRarities`) rather than a fixed
 * epic-and-legendary pair, because the Faded pool tops out at Rare and rare mercy is exactly
 * what somebody pulling on it is counting.
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
      // The store already holds the message; the plinth below renders it.
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
  const [floor, tier] = poolRange(banner.rates);
  const rangeLabel =
    floor === tier ? rarityLabel(tier) : `${rarityLabel(floor)} – ${rarityLabel(tier)}`;

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
            const [entryFloor, entryTier] = poolRange(entry.rates);
            const chosen = entry.key === banner.key;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={chosen}
                className={styles.sigil}
                data-tier={entryTier}
                onClick={() => setSelected(entry.key)}
              >
                <span
                  className={styles.sigilArt}
                  style={{ backgroundImage: `var(--fui-img-${sigilArt(entry.key)})` }}
                  aria-hidden="true"
                />
                <span className={styles.sigilText}>
                  <span className={styles.sigilName}>{entry.name}</span>
                  <span className={styles.sigilTier}>
                    {entryFloor === entryTier
                      ? rarityLabel(entryTier)
                      : `${rarityLabel(entryFloor)} – ${rarityLabel(entryTier)}`}
                  </span>
                </span>
                <span className={styles.sigilCount} data-empty={entry.sigilsHeld === 0}>
                  {entry.sigilsHeld}
                </span>
              </button>
            );
          })}
        </div>

        {/* The gate. No panel: the room behind it is the owner's portal painting, and this
            section only *arranges* things in it — the rune and its rings in the middle of
            the air, the controls on the plinth at the foot. */}
        <section
          className={styles.gate}
          data-tier={poolTier(banner.rates)}
          aria-label={`${banner.name} gate`}
        >
          <div className={styles.scene} aria-hidden="true">
            <span className={styles.nebula} />
            <span className={styles.mist} data-layer="a" />
            <span className={styles.mist} data-layer="b" />
            <span className={styles.ring} data-ring="outer" />
            <span className={styles.ring} data-ring="inner" />
            <span className={styles.glow} />
            <span
              className={styles.rune}
              style={{ backgroundImage: `var(--fui-img-${sigilArt(banner.key)})` }}
            />
            {/* Sparks rising off the gate. Their angle and timing are inline custom
                properties, because sixteen near-identical keyframe blocks is what a
                stylesheet should never be. */}
            {Array.from({ length: 16 }, (_, index) => (
              <span
                key={index}
                className={styles.spark}
                style={
                  {
                    '--mv-spark-x': `${((index * 61) % 100) - 50}%`,
                    '--mv-spark-delay': `${(index * 530) % 4200}ms`,
                    '--mv-spark-time': `${3600 + ((index * 337) % 1800)}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className={styles.plinth}>
            <div className={styles.name}>
              <h2 className={styles.title}>{banner.name}</h2>
              <span className={styles.range}>{rangeLabel}</span>
            </div>
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
                        size={64}
                      />
                      <span className={styles.featuredName}>{champion.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* A button in a gacha screen should say what it costs before it is pressed:
                the count is the obvious half and the price is the decision. Still the
                painted button — the chrome is the library's and the two lines inside it
                are ours. */}
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
                sigils have four different sources and none of that is on the wire, so a
                sentence the client cannot derive is one that goes stale the first time an
                operator retunes a drop table. */}
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
          </div>
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
        <SummonCinematic
          key={pullSeq}
          poolKey={banner.key}
          onAgain={() => void summon(lastPull?.count ?? 1)}
        />
      )}
    </div>
  );
}
