import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChampionCard } from '@/fui/components/ChampionCard.ts';
import { Fui } from '@/fui/react';
import { Button } from '../../ui/Button/Button';
import { CUE, playCue, summonCue } from '../../audio';
import { useLayer } from '../../ui/Modal/stack';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { championArt } from '../../ui/championArt';
import { rarityLabel } from '../../ui/labels';
import { sigilArt } from '../../ui/sigilArt';
import { tabScenery, wallpaperUrl } from '../../ui/tabScenery';
import { useSummonStore } from '../../state/summonStore';
import {
  BURST_MS,
  CHARGE_MS,
  DEAL_MS,
  HERALD_MS,
  beatFor,
  bestRarity,
  dealOffset,
  heraldIndex,
  revealOrder,
  teaseLadder,
} from './drama';
import styles from './SummonCinematic.module.scss';

/**
 * The pull, as a cinematic.
 *
 * Seven beats, and each of them exists because the one before it earned it:
 *
 * 1. **Charge.** The room is the Mistgate's own painting, and the camera starts moving
 *    into the portal the instant the button is pressed — which is also what the network
 *    round trip happens under, so the wait is the show rather than a disabled button. The
 *    pool's rune hangs in the gate, the rings accelerate, mist thickens, motes fall inward.
 * 2. **The climb.** The mist takes a colour, then a better one, then a better one, and the
 *    whole scene answers each rung — the vignette, the rune's glow, a ring of light thrown
 *    outward. It always climbs to *rare* however bad the pull (`drama.ts`, tested), so the
 *    wind-up never leaks the answer early; above rare the climb is the news.
 * 3. **The break.** A flash in the colour it reached, three shockwaves, the rune shatters
 *    into shards, and the frame shakes.
 * 4. **The deal.** The cards are thrown out of the gate face-down to the places they will
 *    turn in — ten of them in a third of a second, with one whoosh for the whole hand.
 * 5. **The turn.** One at a time, each with a burst of its own colour behind it, the best
 *    held to last — because a reveal that opens on the legendary has nothing left to give.
 * 6. **The herald**, for an epic or better: the champion's card at the size the moment
 *    deserves, standing in a pillar of light with a wheel of rays behind it and the name
 *    under it. A legendary gets gold rain across the whole screen as well.
 * 7. **Again.** The one press a player wants at the end of a pull is the same press, and it
 *    is right here rather than three clicks away.
 *
 * Everything shown was decided by the server before the first frame. This is choreography,
 * not a lottery running in the browser (CLAUDE.md — the client renders server numbers);
 * the only thing the client chooses is the *order* the cards are turned in, which changes
 * nothing about what was received.
 *
 * **Not the library's `SummonResult`.** That component runs its own reveal on a fixed
 * stagger, where this one has a per-rarity beat, a wind-up and a herald. So the
 * choreography is ours and the *cards* are the library's, which is what makes a Legendary
 * here look like a Legendary in the roster: the same `ChampionCard`, the same gold.
 *
 * **Geometry, not art.** Every burst, ring, shard and mote here is a gradient or a border on
 * an element. `assets/` has no effect art and inventing icons is against the brief (C9), so
 * the drama comes from motion and colour rather than from a texture nobody drew.
 */

type Phase = 'charge' | 'climb' | 'break' | 'cards' | 'herald' | 'done';

/** Card width in the hand, and for the one card of a ×1. The stylesheet agrees. */
const CARD_PX = 220;
const SINGLE_PX = 320;
/** The herald's card. */
const HERALD_PX = 360;

/**
 * What the pull is worth, as the sentence it deserves.
 *
 * An Epic or a Legendary is the thing that happened and it should be the largest words on
 * the screen; below that the honest headline is how many came out, because a ×10 of
 * commons is a ×10 of commons and dressing it up is the one thing a gacha screen must not
 * do.
 */
function headline(best: string, count: number): string {
  if (best === 'legendary') return 'A Legendary answered';
  if (best === 'epic') return 'An Epic answered';
  if (count === 1) return 'One out of the mist';
  return `${count} out of the mist`;
}

export function SummonCinematic({
  poolKey,
  onAgain,
}: {
  /** Which gate is being pulled — its rune is what stands in the portal. */
  poolKey: string;
  /** Runs the same pull again. The screen owns it, because it also owns the refresh after. */
  onAgain: () => void;
}): JSX.Element {
  const results = useSummonStore((state) => state.revealing);
  const revealed = useSummonStore((state) => state.revealed);
  const advance = useSummonStore((state) => state.advanceReveal);
  const revealAll = useSummonStore((state) => state.revealAll);
  const dismiss = useSummonStore((state) => state.dismissReveal);
  const pulling = useSummonStore((state) => state.pulling);
  const lastPull = useSummonStore((state) => state.lastPull);
  const banners = useSummonStore((state) => state.banners);
  const bundle = useContentStore((state) => state.bundle);

  /**
   * Whether to play the show at all.
   *
   * The stylesheet already flattens every animation for a player who asked for less motion
   * — but the *timers* are in JavaScript, and a flattened animation still held the screen
   * for four seconds of nothing. Asked here so the whole wind-up is skipped rather than
   * played invisibly. The game's own setting and the operating system's are the same
   * request, exactly as `usePreferences` treats them.
   */
  const calmSetting = usePlayerStore((state) => state.settings.reducedMotion);
  const calm = useMemo(
    () =>
      calmSetting ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true),
    [calmSetting],
  );

  // Only mounted while a pull is in flight or on screen, so being mounted *is* being open.
  const { depth } = useLayer(useId(), true);

  const [phase, setPhase] = useState<Phase>(calm ? 'cards' : 'charge');
  const [rung, setRung] = useState(0);

  const ready = results.length > 0;
  const best = useMemo(() => bestRarity(results), [results]);
  const order = useMemo(() => revealOrder(results), [results]);
  const ladder = useMemo(() => teaseLadder(best), [best]);
  const heraldAt = useMemo(() => heraldIndex(results, order), [results, order]);

  /**
   * Every card turned, however it got that way.
   *
   * Derived rather than a seventh phase reached by an effect: "the cards are all face up"
   * is a fact about two numbers we already have. Skip sets the phase directly, so a player
   * who pressed it and a player who waited land in the same place.
   */
  const finished = phase === 'done' || (phase === 'cards' && ready && revealed >= results.length);
  const stage: Phase = finished ? 'done' : phase;

  /** The colour the whole scene is tinted with right now. */
  const tint =
    phase === 'charge' ? 'none' : phase === 'climb' ? (ladder[rung]?.rarity ?? 'common') : best;

  // ── The wind-up ────────────────────────────────────────────────────────────
  // A fixed clock that also waits for the answer, so the charge lasts as long as it lasts
  // *or* as long as the server takes, whichever is longer. The pull's latency is spent
  // inside the animation instead of in front of it.
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    if (phase !== 'charge') return;
    playCue(CUE.summonCharge);
    let handle = 0;
    const open = (): void => {
      if (readyRef.current) setPhase('climb');
      // Still in flight. The gate keeps turning and asks again in a moment — a charge that
      // gave up would be a wind-up with nothing on the end of it.
      else handle = window.setTimeout(open, 80);
    };
    handle = window.setTimeout(open, CHARGE_MS);
    return () => window.clearTimeout(handle);
  }, [phase]);

  // One rung at a time, the last one holding longest.
  useEffect(() => {
    if (phase !== 'climb') return;
    playCue(CUE.summonTease);
    const hold = ladder[rung]?.holdMs ?? 260;
    const handle = window.setTimeout(() => {
      if (rung + 1 < ladder.length) setRung(rung + 1);
      else setPhase('break');
    }, hold);
    return () => window.clearTimeout(handle);
  }, [phase, rung, ladder]);

  useEffect(() => {
    if (phase !== 'break') return;
    playCue(CUE.summonBurst);
    const handle = window.setTimeout(() => setPhase('cards'), BURST_MS);
    return () => window.clearTimeout(handle);
  }, [phase]);

  // ── The deal and the cards ─────────────────────────────────────────────────
  // The hand is thrown out of the gate the moment the phase turns to cards, and the first
  // turn waits for it to land. One whoosh for the whole hand rather than ten.
  const dealt = useRef(false);
  useEffect(() => {
    if (phase !== 'cards' || dealt.current) return;
    dealt.current = true;
    if (!calm) playCue(CUE.summonDeal);
  }, [phase, calm]);

  useEffect(() => {
    if (phase !== 'cards' || !ready || finished) return;
    const next = results[order[revealed] as number];
    // The card about to turn, not the one that just did: the pause belongs *before* the
    // good news. An epic or better takes the herald instead of a pause.
    const herald = revealed === heraldAt && !calm;
    const settle = revealed === 0 && !calm ? DEAL_MS : 0;
    const handle = window.setTimeout(
      () => (herald ? setPhase('herald') : advance()),
      settle + (calm ? 90 : herald ? 260 : beatFor(next?.rarity ?? 'rare')),
    );
    return () => window.clearTimeout(handle);
  }, [phase, ready, finished, revealed, results, order, heraldAt, advance, calm]);

  useEffect(() => {
    if (phase !== 'herald') return;
    const handle = window.setTimeout(() => {
      advance();
      setPhase('cards');
    }, HERALD_MS);
    return () => window.clearTimeout(handle);
  }, [phase, advance]);

  // Each card that turns says what it is worth. Keyed on the count rather than on the
  // card, because ten commons in a row are ten separate moments and each one should be
  // heard — the gap between the four chimes is what the pull's drama is made of.
  const turned = revealed > 0 ? results[order[revealed - 1] as number]?.rarity : undefined;
  useEffect(() => {
    if (turned) playCue(summonCue(turned));
  }, [turned, revealed]);

  const defOf = (key: string) => bundle?.champions.find((champion) => champion.key === key);
  const nameOf = (key: string): string => defOf(key)?.name ?? key;
  const artFor = (key: string) => championArt(defOf(key), bundle?.assets);

  /** The library card for one result, at a size. */
  const cardOptions = (result: (typeof results)[number], size: number) => ({
    name: nameOf(result.championKey),
    ...artFor(result.championKey),
    rarity: result.rarity,
    size,
    // A pull arrives at its base rank; what it becomes is the roster's business, and a
    // level here would be a number nobody asked about at the moment they are looking at
    // a face.
    ...(result.champion ? { stars: result.champion.rank, maxStars: 6 } : {}),
    ...(defOf(result.championKey)?.element ? { affinity: defOf(result.championKey)!.element } : {}),
    // The ribbon the library already draws for a freshly pulled unit.
    ...(result.isNew ? { isNew: true } : {}),
  });

  const heraldCard = phase === 'herald' ? results[order[revealed] as number] : undefined;

  const skip = (): void => {
    revealAll();
    setPhase('done');
  };

  const newCount = results.filter((result) => result.isNew).length;
  const again = lastPull;
  const againBanner = again ? banners.find((banner) => banner.key === again.poolKey) : undefined;
  const canAgain = Boolean(again && againBanner && againBanner.sigilsHeld >= again.count);

  const room = tabScenery('mistgate').wallpaper;
  const single = results.length === 1;
  // Read once: the library sizes a card from a number, so a short window gets a smaller
  // hand rather than a hand the foot has to be drawn over.
  const short = useMemo(() => typeof window !== 'undefined' && window.innerHeight < 940, []);
  const cardPx = single ? (short ? 280 : SINGLE_PX) : short ? 190 : CARD_PX;

  return (
    <div
      className={styles.overlay}
      style={{ '--mv-layer-depth': depth, '--mv-card-w': `${cardPx}px` } as CSSProperties}
      data-phase={stage}
      data-tint={tint}
      role="dialog"
      aria-modal="true"
      aria-label="Summon results"
    >
      {/* The room: the gate's own painting, and the camera moving into it for the whole of
          the wind-up. The wash over it lifts as the mist takes a colour. */}
      <div
        className={styles.room}
        style={room ? { backgroundImage: `url(${wallpaperUrl(room)})` } : undefined}
        aria-hidden="true"
      />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.mist} data-layer="a" aria-hidden="true" />
      <div className={styles.mist} data-layer="b" aria-hidden="true" />

      {/* The gate. Present for the whole wind-up and gone the moment it breaks — it is the
          thing the cards come out of, so leaving it behind them would say they had not. */}
      {(phase === 'charge' || phase === 'climb' || phase === 'break') && (
        <div className={styles.gate} aria-hidden="true">
          <span className={styles.halo} />
          <span className={styles.ring} data-ring="outer" />
          <span className={styles.ring} data-ring="mid" />
          <span className={styles.ring} data-ring="inner" />
          <span className={styles.core} />
          {phase !== 'break' && (
            <span
              className={styles.rune}
              style={{ backgroundImage: `var(--fui-img-${sigilArt(poolKey)})` }}
            />
          )}
          {/* Twenty-four motes falling in, two rings of twelve. Their angle is an inline
              custom property because twenty-four near-identical keyframe blocks is what a
              stylesheet should never be. */}
          {Array.from({ length: 24 }, (_, index) => (
            <span
              key={index}
              className={styles.mote}
              data-ring={index < 12 ? 'near' : 'far'}
              style={
                {
                  '--mv-mote': `${(index % 12) * 30 + (index < 12 ? 0 : 15)}deg`,
                  '--mv-mote-delay': `${(index * 70) % 1600}ms`,
                } as CSSProperties
              }
            />
          ))}
          {/* One ring of light thrown outward per rung of the climb. Keyed on the rung so
              each step starts its own. */}
          {phase === 'climb' && <span key={rung} className={styles.pulse} />}
          {phase === 'break' && (
            <>
              <span className={styles.shock} data-wave="1" />
              <span className={styles.shock} data-wave="2" />
              <span className={styles.shock} data-wave="3" />
              {Array.from({ length: 10 }, (_, index) => (
                <span
                  key={index}
                  className={styles.shard}
                  style={
                    {
                      '--mv-shard': `${index * 36 + 8}deg`,
                      '--mv-shard-far': `${18 + ((index * 7) % 12)}rem`,
                    } as CSSProperties
                  }
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* One line under the gate, so the wind-up says what it is rather than looking like a
          screen that has stopped responding. */}
      {(phase === 'charge' || phase === 'climb') && (
        <p className={styles.whisper}>
          {phase === 'charge' ? 'Calling into the mist…' : 'Something is answering.'}
        </p>
      )}

      {phase === 'break' && <div className={styles.flash} aria-hidden="true" />}

      {/* The herald: the champion's card at the size the moment deserves. */}
      {heraldCard && (
        <div className={styles.herald} data-rarity={heraldCard.rarity}>
          <div className={styles.pillar} aria-hidden="true" />
          <div className={styles.rays} aria-hidden="true" />
          {heraldCard.rarity === 'legendary' && (
            <div className={styles.rain} aria-hidden="true">
              {Array.from({ length: 36 }, (_, index) => (
                <span
                  key={index}
                  style={
                    {
                      '--mv-drop-x': `${(index * 29) % 100}%`,
                      '--mv-drop-delay': `${(index * 113) % 1400}ms`,
                      '--mv-drop-time': `${1600 + ((index * 211) % 900)}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          <div className={styles.heraldCard}>
            <Fui
              of={ChampionCard}
              options={cardOptions(heraldCard, HERALD_PX)}
              attrs={{ tabindex: -1 }}
            />
          </div>
          <p className={styles.heraldRarity}>{rarityLabel(heraldCard.rarity)}</p>
          <p className={styles.heraldName}>{nameOf(heraldCard.championKey)}</p>
          {heraldCard.isNew && <p className={styles.heraldNew}>New to the Chronicle</p>}
        </div>
      )}

      {(phase === 'cards' || phase === 'done') && (
        <div className={styles.cards} data-count={results.length}>
          {/* Laid out in the order they turn, so the grid fills left to right and the last
              card of the pull is the one in the corner a player is already watching. Each
              one is dealt from the centre: its offset from there comes from `dealOffset`,
              and the stylesheet multiplies it by a card's width. */}
          {order.map((source, position) => {
            const result = results[source] as (typeof results)[number];
            const shown = position < revealed;
            const offset = dealOffset(position, results.length);
            return (
              <article
                key={`${result.championKey}-${source}`}
                className={styles.card}
                data-rarity={shown ? result.rarity : undefined}
                data-shown={shown}
                aria-hidden={!shown}
                style={
                  {
                    '--mv-col': offset.col,
                    '--mv-row': offset.row,
                    '--mv-deal-delay': `${position * 55}ms`,
                  } as CSSProperties
                }
              >
                {shown ? (
                  <>
                    <span className={styles.burst} aria-hidden="true" />
                    <Fui
                      of={ChampionCard}
                      className={styles.pull}
                      options={cardOptions(result, cardPx)}
                      // The card is a `<button>`, because in a roster it opens a champion.
                      // Here it opens nothing, and ten tab stops that do nothing in front
                      // of the one button that does is worse than not being able to reach
                      // them. Out of the tab order, still readable — the card names itself.
                      attrs={{ tabindex: -1 }}
                    />
                    {result.fromMercy && <span className={styles.mercy}>mercy</span>}
                    {result.champion === null && (
                      <span className={styles.full} title="Your roster is full">
                        roster full
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className={styles.back}
                    style={{ backgroundImage: `var(--fui-img-${sigilArt(poolKey)})` }}
                    aria-hidden="true"
                  />
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className={styles.controls}>
        {finished ? (
          <>
            <div className={styles.summary}>
              <p className={styles.headline} data-rarity={best}>
                {headline(best, results.length)}
              </p>
              <p className={styles.tally}>
                {newCount > 0
                  ? `${newCount} new to the Chronicle · ${results.length} summoned`
                  : `${results.length} summoned · all duplicates`}
              </p>
            </div>
            <div className={styles.buttons}>
              {/* Still a real pull through the same endpoint, spending the same sigils —
                  what it saves is closing a cinematic to press the button behind it.
                  Drawn only when it can be pressed: a permanently disabled button reads
                  as something broken, where the sentence that replaces it says which of
                  the two reasons it is. */}
              {again &&
                (canAgain ? (
                  <Button variant="secondary" disabled={pulling} onClick={onAgain}>
                    {pulling ? 'Calling…' : `Summon ×${again.count} again`}
                  </Button>
                ) : (
                  <span className={styles.spent}>Not enough sigils for another ×{again.count}</span>
                ))}
              <Button onClick={dismiss}>Take them in</Button>
            </div>
          </>
        ) : ready ? (
          <Button variant="ghost" onClick={skip}>
            Skip
          </Button>
        ) : null}
      </div>
    </div>
  );
}
