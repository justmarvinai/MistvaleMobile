import { useEffect, useState } from 'react';
import { REFORGE_DUST_ITEM, type GearInstance, type ReforgeQuote } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { gameApi, newActionId } from '../../api/game';
import { usePlayerStore } from '../../state/playerStore';
import { itemCount, useInventoryStore } from '../../state/inventoryStore';
import { statLabel } from '../../ui/statLabels';
import { RelicCard } from './RelicCard';
import styles from './Reforge.module.scss';

/**
 * Rerolling one line on a relic.
 *
 * The screen's whole job is to make a gamble into a decision. **The server publishes what
 * each line could turn into before anything is spent** — the Mistgate's odds rule applied
 * to relics — so this lists the pool under the line a player is pointing at rather than
 * asking them to press and find out.
 *
 * Nothing here computes anything. The price, the pool and the reason a line cannot be
 * rerolled are all the quote's, re-read after every reforge because the price climbs.
 */

export function Reforge({
  relic,
  onClose,
  onChanged,
}: {
  relic: GearInstance;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}): JSX.Element {
  const silver = usePlayerStore((state) => state.player?.silver ?? 0);
  const items = useInventoryStore((state) => state.items);
  const dust = itemCount(items, REFORGE_DUST_ITEM);

  const [current, setCurrent] = useState(relic);
  const [loaded, setLoaded] = useState<ReforgeQuote | null>(null);
  const [chosen, setChosen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ from: string; to: string } | null>(null);

  /**
   * Whether the quote in hand still describes the relic on screen.
   *
   * Derived rather than cleared, because clearing it would be a `setState` in the body of
   * the effect below — and the derivation is the better answer anyway: the price is *built
   * on* `reforges`, so a quote from before the last reroll understates the next one.
   * Matching on both fields makes a stale quote unusable rather than merely old.
   */
  const quote =
    loaded && loaded.gearId === current.id && loaded.reforges === current.reforges ? loaded : null;

  // Re-read after every reforge, since the price climbs with each one.
  useEffect(() => {
    let live = true;
    gameApi
      .reforgeQuote(current.id)
      .then((next) => {
        if (live) setLoaded(next);
      })
      .catch((cause: unknown) => {
        if (live)
          setError(cause instanceof Error ? cause.message : 'That relic could not be read.');
      });
    return () => {
      live = false;
    };
  }, [current]);

  const line = quote?.lines[chosen];
  const blocked = quote?.blockedReason ?? null;
  const affordable =
    quote !== null && dust >= quote.dust && silver >= quote.silver && blocked === null;

  const run = async (): Promise<void> => {
    if (!quote || !line) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await gameApi.reforgeGear(
        current.id,
        line.index,
        { stat: line.line.stat, percent: line.line.percent },
        newActionId(),
      );
      setOutcome({
        from: `${statLabel(result.before.stat)} +${result.before.value}${result.before.percent ? '%' : ''}`,
        to: `${statLabel(result.after.stat)} +${result.after.value}${result.after.percent ? '%' : ''}`,
      });
      // Setting the relic re-runs the quote, which is what re-prices the next reroll.
      setCurrent(result.gear);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reforge refused.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Reforge" onClose={busy ? () => undefined : onClose} size="work">
      <div className={styles.body}>
        <RelicCard relic={current} />

        {blocked ? (
          <p className={styles.blocked}>{blocked}</p>
        ) : (
          <>
            <p className={styles.lead}>
              Choose a line. It comes back as a different stat, keeping the rolls that went into it
              — which stat, and how well those rolls land, is the gamble.
            </p>

            <ul className={styles.lines}>
              {(quote?.lines ?? []).map((entry) => (
                <li key={entry.index}>
                  <button
                    type="button"
                    className={styles.line}
                    data-chosen={entry.index === chosen}
                    onClick={() => setChosen(entry.index)}
                  >
                    <span className={styles.lineStat}>
                      {statLabel(entry.line.stat)} +{entry.line.value}
                      {entry.line.percent ? '%' : ''}
                    </span>
                    <span className={styles.lineRolls}>
                      {entry.line.rolls ?? 1} roll{(entry.line.rolls ?? 1) === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* What it could become, published rather than discovered. */}
            {line && (
              <div className={styles.pool} aria-label="What it could become">
                <span className={styles.poolLabel}>Could become</span>
                <ul className={styles.poolList}>
                  {line.candidates.map((candidate) => (
                    <li key={`${candidate.stat}-${String(candidate.percent)}`}>
                      {/* The form belongs on the *name*: a relic can take flat DEF and
                          DEF% both, so two rows reading "DEF" with the only difference
                          buried in the range is a list a player has to decode. */}
                      <span className={styles.poolStat}>
                        {statLabel(candidate.stat)}
                        {candidate.percent ? ' %' : ''}
                      </span>
                      <span className={styles.poolRange}>
                        {candidate.min}–{candidate.max}
                        {candidate.percent ? '%' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {quote && (
              <div className={styles.price}>
                {/* The cost *and* the purse, because "1,000 dust" means nothing to somebody
                    who has never been told what dust they have. Red when short. */}
                <span className={dust >= quote.dust ? undefined : styles.short}>
                  <strong>{quote.dust.toLocaleString()}</strong> dust
                  <span className={styles.held}> of {dust.toLocaleString()}</span>
                </span>
                <span className={silver >= quote.silver ? undefined : styles.short}>
                  <strong>{quote.silver.toLocaleString()}</strong> silver
                  <span className={styles.held}> of {silver.toLocaleString()}</span>
                </span>
                {quote.reforges > 0 && (
                  <span className={styles.history}>
                    Reforged {quote.reforges} time{quote.reforges === 1 ? '' : 's'} — each one costs
                    more than the last.
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {outcome && (
          <p className={styles.outcome} role="status">
            <span className={styles.was}>{outcome.from}</span>
            <span className={styles.arrow}>→</span>
            <span className={styles.now}>{outcome.to}</span>
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Done
          </Button>
          <Button disabled={busy || !affordable || !line} onClick={() => void run()}>
            {busy ? 'Working…' : 'Reforge'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
