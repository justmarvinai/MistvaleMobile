import { useEffect, useState } from 'react';
import { ELEMENTS, HALL_STATS, type Element, type HallStat } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useArenaStore } from '../../state/arenaStore';
import styles from './HallOfValor.module.scss';

/**
 * The Hall of Valor.
 *
 * Twenty-four tracks — four elements by six stats — bought with the medals the Arena pays.
 * It is the ladder's only sink and deliberately a year-scale one: 2,500 medals finishes a
 * single track and 60,000 finishes the Hall (ECONOMY_BALANCE §8).
 *
 * Laid out as a grid of elements against stats because that is the shape of the decision:
 * a player picks the element their best champions share and pushes one column, and a list
 * of twenty-four rows would hide exactly that.
 */

const STAT_LABELS: Readonly<Record<HallStat, string>> = {
  hp: 'Health',
  atk: 'Attack',
  def: 'Defence',
  critDmg: 'Crit damage',
  acc: 'Accuracy',
  res: 'Resistance',
};

const ELEMENT_LABELS: Readonly<Record<Element, string>> = {
  ember: 'Ember',
  tide: 'Tide',
  verdant: 'Verdant',
  mist: 'Mist',
};

/** Flat points for accuracy and resistance; a percentage for everything else. */
const isFlat = (stat: HallStat): boolean => stat === 'acc' || stat === 'res';

export function HallOfValor({ onClose }: { onClose: () => void }): JSX.Element {
  const hall = useArenaStore((state) => state.hall);
  const load = useArenaStore((state) => state.loadHall);
  const upgrade = useArenaStore((state) => state.upgradeHall);
  const busy = useArenaStore((state) => state.busy);
  const error = useArenaStore((state) => state.error);

  const [element, setElement] = useState<Element>('ember');

  useEffect(() => {
    void load();
  }, [load]);

  const trackFor = (stat: HallStat) =>
    hall?.tracks.find((track) => track.element === element && track.stat === stat);

  return (
    <Modal open title="The Hall of Valor" onClose={onClose} width={640}>
      <div className={styles.body}>
        <p className={styles.blurb}>
          Valor Medals buy permanent bonuses for every champion of an element you own — now and for
          every one you ever summon. Nothing here is fast; a single track is a season&rsquo;s work.
        </p>

        <div className={styles.medals}>
          <span className={styles.medalsLabel}>Valor Medals</span>
          <span className={styles.medalsValue}>{hall?.medals ?? 0}</span>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Element">
          {ELEMENTS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === element}
              className={styles.tab}
              data-element={entry}
              onClick={() => setElement(entry)}
            >
              {ELEMENT_LABELS[entry]}
            </button>
          ))}
        </div>

        {!hall ? (
          <p className={styles.empty}>Opening the Hall…</p>
        ) : (
          <div className={styles.tracks}>
            {HALL_STATS.map((stat) => {
              const track = trackFor(stat);
              if (!track) return null;
              const capped = track.nextCost === null;
              const affordable = !capped && hall.medals >= (track.nextCost ?? 0);
              const suffix = isFlat(stat) ? '' : '%';

              return (
                <div key={stat} className={styles.track}>
                  <div className={styles.trackHead}>
                    <span className={styles.trackName}>{STAT_LABELS[stat]}</span>
                    <span className={styles.trackLevel}>
                      {track.level} / {hall.maxLevel}
                    </span>
                  </div>

                  <div
                    className={styles.pips}
                    aria-label={`${track.level} of ${hall.maxLevel} levels trained`}
                  >
                    {Array.from({ length: hall.maxLevel }, (_, index) => (
                      <span key={index} className={styles.pip} data-on={index < track.level} />
                    ))}
                  </div>

                  <div className={styles.trackFoot}>
                    <span className={styles.trackValue}>
                      +{track.value}
                      {suffix}
                      {!capped && (
                        <span className={styles.trackNext}>
                          {' → '}+{track.nextValue}
                          {suffix}
                        </span>
                      )}
                    </span>

                    <Button
                      size="sm"
                      variant={affordable ? 'primary' : 'ghost'}
                      disabled={capped || !affordable || busy !== null}
                      onClick={() => void upgrade(element, stat)}
                    >
                      {capped ? 'Mastered' : `${track.nextCost} medals`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
