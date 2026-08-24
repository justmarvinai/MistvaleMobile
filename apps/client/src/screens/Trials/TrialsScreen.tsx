import { useEffect, useMemo, useState } from 'react';
import type { StageDef, TrialState } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { Portrait } from '@/ui/Portrait/Portrait';
import { Rewards } from '@/ui/Rewards/Rewards';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { championArt } from '@/ui/championArt';
import { useBattleStore } from '@/state/battleStore';
import { useContentStore } from '@/state/contentStore';
import { useNavStore } from '@/state/navStore';
import { useTrialStore } from '@/state/trialStore';
import styles from './TrialsScreen.module.scss';

/**
 * Trials — the one place in Mistvale where the account does not matter.
 *
 * There is no team chooser on this screen and there never will be: the stage carries the
 * four champions it is fought with, so pressing **Attempt** starts the fight. That absence
 * *is* the mode. Everything else here follows from it — the loaned team is shown because it
 * is the puzzle's other half, the hint is shown because a puzzle nobody can see the shape of
 * is a puzzle nobody attempts twice, and the number kept is turns rather than a clear,
 * because clearing is the easy half.
 *
 * The fight itself is an ordinary battle: `mode: 'trial'` through the same start call the
 * campaign uses, which is why playback, Auto, the speed ladder and a reload mid-fight all
 * work here without a second implementation of any of them.
 */
export function TrialsScreen(): JSX.Element {
  const overview = useTrialStore((store) => store.trials);
  const loading = useTrialStore((store) => store.loading);
  const loaded = useTrialStore((store) => store.loaded);
  const load = useTrialStore((store) => store.load);
  const startBattle = useBattleStore((store) => store.startBattle);
  const busy = useBattleStore((store) => store.busy);
  const enterFrom = useNavStore((store) => store.enterFrom);
  const bundle = useContentStore((store) => store.bundle);

  const [error, setError] = useState<string | null>(null);

  // Re-read on mount, because a fight unmounts this screen and the turn count the player
  // came back to look at is the one that fight just changed.
  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(
    () => new Map((bundle?.stages ?? []).map((stage) => [stage.key, stage])),
    [bundle],
  );

  const attempt = async (trial: TrialState): Promise<void> => {
    setError(null);
    try {
      // The team is the stage's, so an empty one is sent and the server ignores it. Sending
      // a roster here would be a lie the server would have to unpick.
      await startBattle({ mode: 'trial', stageKey: trial.key, team: [] });
      enterFrom('battle', 'trials');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That trial could not be opened.');
    }
  };

  if (loaded && overview.total === 0) {
    return (
      <div className={styles.screen}>
        <Heading tagline="Four champions, one enemy, and nothing of yours.">Trials</Heading>
        <Empty
          glyph="glyph-arcane-symbol"
          title="Nothing to solve yet"
          message={
            loading
              ? 'Reading the trials…'
              : 'No trial is open to you. They begin at account level 9, and an operator can add more at any time.'
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Four champions, one enemy, and nothing of yours."
        actions={
          <div className={styles.headActions}>
            <p className={styles.tally}>
              <strong>{overview.beaten}</strong> of <strong>{overview.total}</strong> beaten
            </p>
            <ScreenInfo title="Trials">
              <Panel title="Everybody gets the same fight">
                <p className={styles.note}>
                  A trial hands you four champions at a fixed level with fixed relics, against a
                  fixed enemy — and the same dice. Nothing you own changes any of it, so what
                  separates a good attempt from a bad one is the play: which skill, on which target,
                  on which turn.
                </p>
              </Panel>
              <Panel title="Par">
                <p className={styles.note}>
                  Clearing a trial is the easy half. <strong>Par</strong> is a turn count to beat,
                  and beating it pays once — the first attempt that comes in at or under it. After
                  that the trial is yours; attempt it again as often as you like, for nothing.
                </p>
                <p className={styles.note}>
                  There are no attempt limits and no energy. The only thing a trial costs is
                  thinking about it.
                </p>
              </Panel>
            </ScreenInfo>
          </div>
        }
      >
        Trials
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.trials} aria-label="Trials">
        {overview.trials.map((trial) => (
          <TrialCard
            key={trial.key}
            trial={trial}
            stage={stages.get(trial.key)}
            busy={busy}
            onAttempt={() => void attempt(trial)}
          />
        ))}
      </section>
    </div>
  );
}

/** One trial: what it is, who it lends you, and how you have done on it. */
function TrialCard({
  trial,
  stage,
  busy,
  onAttempt,
}: {
  trial: TrialState;
  stage: StageDef | undefined;
  busy: boolean;
  onAttempt: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const champions = bundle?.champions;

  return (
    <Panel title={trial.name} variant="hero" className={styles.card}>
      <p className={styles.hint}>{trial.hint}</p>

      <ul className={styles.team} aria-label="The team you are lent">
        {trial.team.map((key, index) => {
          const def = champions?.find((entry) => entry.key === key);
          const member = stage?.presetTeam[index];
          return (
            <li key={`${key}-${index}`} className={styles.member}>
              <Portrait
                src={def ? (championArt(def, bundle?.assets).portrait ?? null) : null}
                name={def?.name ?? key}
                size={44}
              />
              <span className={styles.memberName}>{def?.name ?? key}</span>
              {member && (
                <span className={styles.memberRank}>
                  {'★'.repeat(member.rank)} · {member.level}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <dl className={styles.score}>
        <div>
          <dt>Par</dt>
          <dd className={styles.par}>{trial.parTurns} turns</dd>
        </div>
        <div>
          <dt>Your best</dt>
          <dd className={trial.beaten ? styles.beat : styles.best}>
            {trial.bestTurns === null ? '—' : `${trial.bestTurns} turns`}
          </dd>
        </div>
      </dl>

      {Object.keys(trial.parRewards).length > 0 && (
        <div className={styles.pays}>
          <span className={styles.paysLabel}>
            {trial.beaten ? 'Beating par paid' : 'Beating par pays'}
          </span>
          <Rewards rewards={trial.parRewards} signed />
        </div>
      )}

      <p className={styles.status}>
        {trial.beaten
          ? 'Solved inside par. Nothing left to prove here — but it is always open.'
          : trial.cleared
            ? 'Cleared, but not inside par. The bonus is still waiting.'
            : 'Never cleared.'}
      </p>

      {trial.blockedReason ? (
        <p className={styles.blocked}>{trial.blockedReason}</p>
      ) : (
        <Button onClick={onAttempt} disabled={busy}>
          {trial.cleared ? 'Attempt again' : 'Attempt'}
        </Button>
      )}
    </Panel>
  );
}
