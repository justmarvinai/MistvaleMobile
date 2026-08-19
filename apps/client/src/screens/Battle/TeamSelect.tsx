import { useEffect, useMemo, useState } from 'react';
import type { MultiBattleResult, StageDef } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { useRosterStore } from '../../state/rosterStore';
import { useBattleStore } from '../../state/battleStore';
import { useNavStore } from '../../state/navStore';
import { MultiSummary } from './MultiSummary';
import styles from './TeamSelect.module.scss';
import { BossCard } from '../../ui/BossCard/BossCard';
import { stageBoss } from '../../ui/BossCard/bossRules';

/**
 * Picking a team before a fight.
 *
 * Four slots, filled by clicking a champion. Slot one is the leader, whose aura applies —
 * which is why the order is the player's to choose rather than something we sort for them
 * (docs/UI_UX_DESIGN.md §3, screen 7).
 *
 * Every map opens this: a campaign stage and a Depths floor are the same kind of thing, and
 * the mode the battle starts in is read off the stage rather than passed in, so a new mode
 * published in Admin needs no change here.
 *
 * It is also where the three *ways* to fight a stage live, because they share everything
 * except the button: fight it, farm it without watching, or practise it for free. Two of
 * those only appear once they apply — a stage nobody has cleared cannot be practised, and
 * farming is an account-level unlock — and both conditions are the server's answer, read
 * off progress and the player snapshot rather than re-derived here.
 */

const MAX_SLOTS = 4;

export function TeamSelect({
  stage,
  title,
  onClose,
}: {
  stage: StageDef;
  /** Heading for the modal; defaults to the stage's own number. */
  title?: string;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);
  const loadRoster = useRosterStore((state) => state.load);
  const rosterLoading = useRosterStore((state) => state.loading);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);
  const multi = usePlayerStore((state) => state.multiBattle);
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  const cleared = useProgressStore((state) => (state.stages.get(stage.key)?.clears ?? 0) > 0);
  const loadProgress = useProgressStore((state) => state.load);
  const startBattle = useBattleStore((state) => state.startBattle);
  const runMulti = useBattleStore((state) => state.runMulti);
  const busy = useBattleStore((state) => state.busy);
  const goTo = useNavStore((state) => state.setScreen);

  const [team, setTeam] = useState<string[]>([]);
  const [runs, setRuns] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MultiBattleResult | null>(null);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const championsByKey = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const affordable = energy >= stage.energyCost;
  /** Whoever stands in the last wave, if it is somebody worth warning about. */
  const boss = stageBoss(stage, bundle?.enemies);
  const picked = team.length > 0;
  const canStart = picked && affordable && !busy;

  // What a batch could actually manage right now: energy, today's allowance and the
  // per-press cap, whichever runs out first. The server checks all three again — this
  // only stops the stepper from offering a number it would refuse.
  const maxRuns = Math.max(
    1,
    Math.min(
      multi.maxPerCall,
      multi.runsLeftToday,
      stage.energyCost > 0 ? Math.floor(energy / stage.energyCost) : multi.maxPerCall,
    ),
  );
  const canFarm = multi.unlocked && multi.runsLeftToday > 0 && picked && affordable && !busy;

  const toggle = (id: string): void => {
    setTeam((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX_SLOTS
          ? current
          : [...current, id],
    );
  };

  const start = async (mode: string): Promise<void> => {
    setError(null);
    try {
      await startBattle({ mode, stageKey: stage.key, team });
      goTo('battle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that battle.');
    }
  };

  const farm = async (): Promise<void> => {
    setError(null);
    try {
      const result = await runMulti({
        mode: stage.mode,
        stageKey: stage.key,
        team,
        runs: Math.min(runs, maxRuns),
      });
      setSummary(result);
      // A batch moves silver, experience, energy and the allowance at once, so the shell
      // and the map are both stale the moment it returns.
      await Promise.all([refreshPlayer(), loadProgress()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run that batch.');
    }
  };

  if (summary) {
    return (
      <MultiSummary
        result={summary}
        onClose={() => {
          setSummary(null);
          onClose();
        }}
      />
    );
  }

  return (
    <Modal open title={title ?? `Stage ${stage.number}`} onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.summary}>
          {stage.waves.length} waves · {stage.energyCost} energy · {stage.rewards.silverMin}–
          {stage.rewards.silverMax} silver
        </p>

        {/* What is waiting, and what it does about being fought. Content has carried a
            boss's mechanics since P6 and no screen had ever said what was in them — so a
            keep that is meant to be a puzzle was a wall you lost to before guessing. It is
            here rather than in the fight because this is where the team is chosen. */}
        {boss && (
          <BossCard
            name={boss.name}
            where={boss.archetype === 'warlord' ? 'Warlord' : 'Keeper of the deep'}
            mechanics={boss.bossMechanics}
          />
        )}

        <div className={styles.slots}>
          {Array.from({ length: MAX_SLOTS }, (_, index) => {
            const id = team[index];
            const owned = roster.find((entry) => entry.id === id);
            const def = owned ? championsByKey.get(owned.championKey) : undefined;
            return (
              <button
                key={index}
                type="button"
                className={styles.slot}
                data-filled={Boolean(id)}
                onClick={() => id && toggle(id)}
                title={id ? 'Remove from the team' : 'Empty slot'}
              >
                <span>{index === 0 ? 'Leader' : `Slot ${index + 1}`}</span>
                <span>{def?.name ?? '—'}</span>
              </button>
            );
          })}
        </div>

        {rosterLoading && roster.length === 0 ? (
          <p className={styles.empty}>Reading the roster…</p>
        ) : roster.length === 0 ? (
          <p className={styles.empty}>
            You have no champions yet. Choose a starter from the Haven first.
          </p>
        ) : (
          <div className={styles.roster}>
            {roster.map((owned) => {
              const def = championsByKey.get(owned.championKey);
              const chosen = team.includes(owned.id);
              return (
                <button
                  key={owned.id}
                  type="button"
                  className={styles.card}
                  aria-pressed={chosen}
                  disabled={!chosen && team.length >= MAX_SLOTS}
                  onClick={() => toggle(owned.id)}
                >
                  <span>
                    {chosen ? '▣ ' : ''}
                    {def?.name ?? owned.championKey}
                  </span>
                  <span className={styles.cardMeta}>
                    Lv {owned.level} · ★{owned.rank} · {def?.element ?? '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <span className={styles.cost}>
            {affordable
              ? `Costs ${stage.energyCost} energy — you have ${energy}`
              : `Needs ${stage.energyCost} energy — you have ${energy}`}
          </span>
          <Button onClick={() => void start(stage.mode)} disabled={!canStart}>
            {busy ? 'Starting…' : 'Into the mist'}
          </Button>
        </div>

        {multi.unlocked && (
          <div className={styles.farm}>
            <span className={styles.farmLabel}>
              Farm without watching — {multi.runsLeftToday} of {multi.dailyCap} runs left today
            </span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.step}
                onClick={() => setRuns((value) => Math.max(1, value - 1))}
                disabled={runs <= 1}
                aria-label="One fewer run"
              >
                −
              </button>
              <span className={styles.stepValue} aria-live="polite">
                ×{Math.min(runs, maxRuns)}
              </span>
              <button
                type="button"
                className={styles.step}
                onClick={() => setRuns((value) => Math.min(maxRuns, value + 1))}
                disabled={runs >= maxRuns}
                aria-label="One more run"
              >
                +
              </button>
            </div>
            <Button variant="ghost" onClick={() => void farm()} disabled={!canFarm}>
              {busy ? 'Fighting…' : 'Send them in'}
            </Button>
          </div>
        )}

        {cleared && (
          <div className={styles.practice}>
            <span className={styles.practiceLabel}>
              Practise it instead — no energy, no rewards, no risk.
            </span>
            <Button
              variant="ghost"
              onClick={() => void start('practice')}
              disabled={!picked || busy}
            >
              Practise
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
