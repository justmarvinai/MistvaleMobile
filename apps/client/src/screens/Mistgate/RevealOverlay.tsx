import { useEffect, useId, type CSSProperties } from 'react';
import { Button } from '../../ui/Button/Button';
import { playCue, summonCue } from '../../audio';
import { useLayer } from '../../ui/Modal/stack';
import { avatarPath } from '../../game/sprites';
import { useContentStore } from '../../state/contentStore';
import { useSummonStore } from '../../state/summonStore';
import styles from './RevealOverlay.module.scss';
import { Portrait } from '../../ui/Portrait/Portrait';

/**
 * The reveal.
 *
 * Cards turn over one at a time, rarest lingering longest, and the whole thing is
 * skippable — a player on their ninth ×10 of the evening should not have to sit through
 * it, and one on their first should not be rushed. Everything shown was decided by the
 * server before the first frame; this is choreography, not a lottery running in the
 * browser (CLAUDE.md — the client renders server numbers).
 */

/** How long each rarity holds the screen before the next card turns. */
const BEAT_MS: Record<string, number> = {
  common: 420,
  uncommon: 480,
  rare: 620,
  epic: 1_100,
  legendary: 1_700,
};

export function RevealOverlay(): JSX.Element {
  const results = useSummonStore((state) => state.revealing);
  const revealed = useSummonStore((state) => state.revealed);
  const advance = useSummonStore((state) => state.advanceReveal);
  const revealAll = useSummonStore((state) => state.revealAll);
  const dismiss = useSummonStore((state) => state.dismissReveal);
  const bundle = useContentStore((state) => state.bundle);

  // Only mounted while there is something to reveal, so being mounted *is* being open.
  const { depth } = useLayer(useId(), true);

  const done = revealed >= results.length;

  // Turn the next card after its predecessor has had its moment.
  useEffect(() => {
    if (done) return;
    const next = results[revealed];
    const delay = BEAT_MS[next?.rarity ?? 'rare'] ?? 500;
    const handle = window.setTimeout(advance, delay);
    return () => window.clearTimeout(handle);
  }, [done, results, revealed, advance]);

  // Each card that turns says what it is worth. Keyed on the count rather than on the
  // card, because ten commons in a row are ten separate moments and each one should be
  // heard — the gap between the three chimes is what the pull's drama is made of.
  const turned = results[revealed - 1]?.rarity ?? null;
  useEffect(() => {
    if (turned) playCue(summonCue(turned));
  }, [turned, revealed]);

  // A Legendary earns a full-screen flash; anything less would undersell it. Rendered
  // rather than stored: keying the element by the card that caused it remounts it, which
  // restarts the CSS animation — no timer, no state, and nothing to clean up.
  const flashKey = results[revealed - 1]?.rarity === 'legendary' ? `flash-${revealed}` : null;

  const nameOf = (key: string): string =>
    bundle?.champions.find((champion) => champion.key === key)?.name ?? key;

  const artFor = (key: string): string | null => {
    const champion = bundle?.champions.find((entry) => entry.key === key);
    const asset = bundle?.assets.find((entry) => entry.key === champion?.assetKey);
    return asset ? avatarPath(asset.basePath) : null;
  };

  const best = results.reduce<string>((carry, result) => {
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    return order.indexOf(result.rarity) > order.indexOf(carry) ? result.rarity : carry;
  }, 'common');

  return (
    <div
      className={styles.overlay}
      style={{ '--mv-layer-depth': depth } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label="Summon results"
    >
      {flashKey && <div key={flashKey} className={styles.flash} aria-hidden="true" />}

      <div className={styles.cards} data-count={results.length}>
        {results.map((result, index) => {
          const shown = index < revealed;
          return (
            <article
              key={`${result.championKey}-${index}`}
              className={styles.card}
              data-rarity={shown ? result.rarity : undefined}
              data-shown={shown}
              aria-hidden={!shown}
            >
              {shown ? (
                <>
                  {result.isNew && <span className={styles.new}>NEW</span>}
                  <span className={styles.portrait}>
                    <Portrait
                      src={artFor(result.championKey)}
                      name={nameOf(result.championKey)}
                      size={96}
                    />
                  </span>
                  <span className={styles.name}>{nameOf(result.championKey)}</span>
                  <span className={styles.rarity}>{result.rarity}</span>
                  {result.fromMercy && <span className={styles.mercy}>mercy</span>}
                  {result.champion === null && (
                    <span className={styles.full} title="Your roster is full">
                      roster full
                    </span>
                  )}
                </>
              ) : (
                <span className={styles.back} aria-hidden="true" />
              )}
            </article>
          );
        })}
      </div>

      <div className={styles.controls}>
        {done ? (
          <>
            <span className={styles.summary} data-rarity={best}>
              {results.filter((result) => result.isNew).length} new · {results.length} summoned
            </span>
            <Button onClick={dismiss}>Take them in</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={revealAll}>
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
