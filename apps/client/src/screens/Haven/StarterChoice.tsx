import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { currentStep, useTutorialStore } from '../../state/tutorialStore';
import { stillPath } from '../../game/sprites';
import { highlightable } from '../../app/highlight';
import styles from './StarterChoice.module.scss';

/**
 * The first real decision a player makes.
 *
 * Offered whenever the roster is empty, so an account that somehow reaches the Haven
 * without champions is never stuck. The choices come from content — a champion becomes a
 * starter by being flagged in Admin (docs/UI_UX_DESIGN.md §3, screen 4).
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
  // Art that will not load is hidden rather than left as the browser's torn page. The
  // three starters all have a still today and the fallback is the lizard, which has one
  // too — but an asset entry an operator points at a folder with no `still.png` is the
  // same class of thing that left 34 champions faceless on the roster, and this is the
  // one image in the game that does not go through `Portrait`. The button reads fine
  // without it: name, element, role and title are all text.
  const [brokenArt, setBrokenArt] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void load().then(() => setChecked(true));
  }, [load]);

  useEffect(() => {
    if (checked && champions.length === 0) void loadStarters();
  }, [checked, champions.length, loadStarters]);

  const artFor = useMemo(() => {
    const assets = new Map((bundle?.assets ?? []).map((asset) => [asset.key, asset.basePath]));
    return (assetKey: string): string => assets.get(assetKey) ?? 'enemies/teritorial_lizard';
  }, [bundle]);

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
          {starters.map((starter) => (
            <button
              key={starter.key}
              type="button"
              className={styles.choice}
              aria-pressed={picked === starter.key}
              aria-label={`Choose ${starter.name}`}
              onClick={() => setPicked(starter.key)}
            >
              {!brokenArt.has(starter.assetKey) && (
                <img
                  className={styles.portrait}
                  src={stillPath(artFor(starter.assetKey))}
                  alt=""
                  aria-hidden="true"
                  onError={() => setBrokenArt((known) => new Set(known).add(starter.assetKey))}
                />
              )}
              <span className={styles.name}>{starter.name}</span>
              <span className={styles.meta}>
                {starter.element} · {starter.role}
                <br />
                {starter.title}
              </span>
            </button>
          ))}
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
