import { useEffect, useState } from 'react';
import { AffinityBadge } from '@/fui/components/AffinityBadge.ts';
import { Fui } from '@/fui/react';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { CHAMPION_PLACEHOLDER, championArt } from '../../ui/championArt';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { currentStep, useTutorialStore } from '../../state/tutorialStore';
import { highlightable } from '../../app/highlight';
import styles from './StarterChoice.module.scss';

/**
 * The first real decision a player makes.
 *
 * Offered whenever the roster is empty, so an account that somehow reaches the Haven
 * without champions is never stuck. The choices come from content — a champion becomes a
 * starter by being flagged in Admin (docs/UI_UX_DESIGN.md §3, screen 4).
 *
 * **Three hero panels rather than three boxes** (C42). The first decision in the game was
 * three sixty-pixel sprites in plain dark rectangles with two lines of small text under
 * each — a form, on the one screen where the game has to make somebody want a champion.
 * Each choice is a tall panel now with the champion's painted face filling it, the element
 * as the library's own badge and the role beside it, the name at a size worth reading and
 * the title under it, and the chosen one lit. The face is `championArt`'s answer, so a
 * starter without an avatar gets the same silhouette every other faceless champion does
 * rather than a torn page.
 */

export function StarterChoice(): JSX.Element | null {
  const champions = useRosterStore((state) => state.champions);
  const starters = useRosterStore((state) => state.starters);
  const loading = useRosterStore((state) => state.loading);
  const load = useRosterStore((state) => state.load);
  const loadStarters = useRosterStore((state) => state.loadStarters);
  const choose = useRosterStore((state) => state.chooseStarter);
  const bundle = useContentStore((state) => state.bundle);

  const step = useTutorialStore(currentStep);
  // Null until the first read comes back. Waiting for it avoids a flash of the modal on
  // boot, before the client knows whether the script is holding it back.
  const tutorialRead = useTutorialStore((state) => state.tutorial !== null);

  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  // A face that will not load falls back to the silhouette rather than the browser's torn
  // page. `championArt` only offers a portrait when the asset *declares* one, but a
  // declared file can still be missing from a release that skipped `pnpm assets` — the
  // same class of thing that left 34 champions faceless on the roster — and this is one of
  // the few images in the game that does not go through `Portrait`.
  const [brokenArt, setBrokenArt] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void load().then(() => setChecked(true));
  }, [load]);

  useEffect(() => {
    if (checked && champions.length === 0) void loadStarters();
  }, [checked, champions.length, loadStarters]);

  if (!checked || champions.length > 0 || starters.length === 0) return null;
  // Offered when the script says so, or — outside the script — whenever the roster is
  // empty. During the opening steps it is empty and the choice is still two beats away,
  // and a modal that opened then would sit on top of the Wardenmaster and block the very
  // button that moves the player towards it.
  if (!tutorialRead) return null;
  if (step && step.highlight !== 'modal:starter-choice') return null;

  const confirm = async (): Promise<void> => {
    if (!picked) return;
    setError(null);
    try {
      await choose(picked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not claim that champion.');
    }
  };

  return (
    <Modal open title="Choose your first champion" onClose={() => undefined} size="wide">
      <div className={styles.body} {...highlightable('modal:starter-choice')}>
        <p className={styles.intro}>
          One of them steps out of the mist to stand with you. This choice is permanent — the other
          two can still be found later, through the Mistgate.
        </p>

        <div className={styles.choices}>
          {starters.map((starter) => {
            const art = championArt({ assetKey: starter.assetKey }, bundle?.assets);
            const portrait = brokenArt.has(starter.assetKey) ? undefined : art.portrait;
            return (
              <button
                key={starter.key}
                type="button"
                className={styles.choice}
                data-rarity={starter.rarity}
                aria-pressed={picked === starter.key}
                aria-label={`Choose ${starter.name}`}
                onClick={() => setPicked(starter.key)}
              >
                {portrait ? (
                  <img
                    className={styles.portrait}
                    src={portrait}
                    alt=""
                    aria-hidden="true"
                    onError={() => setBrokenArt((known) => new Set(known).add(starter.assetKey))}
                  />
                ) : (
                  <span
                    className={styles.standIn}
                    style={
                      {
                        '--mv-stand-in': `var(--fui-img-${art.art ?? CHAMPION_PLACEHOLDER})`,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  />
                )}
                <span className={styles.gloom} aria-hidden="true" />

                <span className={styles.badges} aria-hidden="true">
                  <Fui
                    of={AffinityBadge}
                    options={{ affinity: starter.element, size: 34, variant: 'chip' }}
                  />
                  <span className={styles.role}>{starter.role}</span>
                </span>

                <span className={styles.plate}>
                  <span className={styles.name}>{starter.name}</span>
                  <span className={styles.title}>{starter.title}</span>
                  <span className={styles.rarity}>{starter.rarity}</span>
                </span>

                <span className={styles.chosen} aria-hidden="true">
                  Chosen
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button onClick={() => void confirm()} disabled={!picked || loading}>
            {loading ? 'Claiming…' : 'Stand together'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
