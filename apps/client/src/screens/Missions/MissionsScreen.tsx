import { useEffect, useMemo, useState } from 'react';
import type { MissionArc } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useMissionStore } from '../../state/missionStore';
import { useContentStore } from '../../state/contentStore';
import { toast } from '../../state/uiStore';
import { MissionRow } from './MissionRow';
import styles from './MissionsScreen.module.scss';

/**
 * The Valewarden's Path.
 *
 * Eighty steps is too many to read, so the screen shows one arc: the eight in front of
 * you, with the road behind collapsed to a line of ticks and the road ahead named but
 * shut. Naming the arcs ahead is deliberate — "Court of the Coilmother" is a promise, and
 * a player who can see where the chain ends walks further along it (UI_UX §3, screen 20).
 */
export function MissionsScreen(): JSX.Element {
  const missions = useMissionStore((state) => state.missions);
  const loading = useMissionStore((state) => state.loading);
  const busy = useMissionStore((state) => state.busy);
  const error = useMissionStore((state) => state.error);
  const load = useMissionStore((state) => state.load);
  const claim = useMissionStore((state) => state.claim);
  const lastClaim = useMissionStore((state) => state.lastClaim);
  const clearClaim = useMissionStore((state) => state.clearClaim);

  const bundle = useContentStore((state) => state.bundle);
  const rewardName = useRewardName();
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastClaim) return;
    const championNames = lastClaim.champions
      .map((key) => bundle?.champions.find((entry) => entry.key === key)?.name ?? key)
      .join(', ');
    // The champion first: on the last step of the chain it is the whole point, and the
    // crystals beside it are a footnote.
    if (championNames) toast.success(`${championNames} joins you.`);
    else if (lastClaim.title) toast.success(`You are now ${lastClaim.title}.`);
    else {
      const line = describeRewards(lastClaim.paid, rewardName);
      if (line) toast.success(`Claimed — ${line}.`);
    }
    if (lastClaim.arcCompleted) toast.info('An arc is finished. The next opens.');
    clearClaim();
  }, [lastClaim, clearClaim, rewardName, bundle]);

  const defOf = useMemo(() => {
    const defs = new Map((bundle?.missions ?? []).map((def) => [def.key, def]));
    return (key: string) => defs.get(key);
  }, [bundle]);

  const shown: MissionArc | undefined = missions
    ? (missions.arcs.find((arc) => arc.arc === (viewing ?? missions.currentArc)) ??
      missions.arcs[0])
    : undefined;

  return (
    <div className={styles.screen}>
      <aside className={styles.rail}>
        <Panel title="The Path">
          {missions && (
            <p className={styles.total}>
              {missions.claimedTotal} of {missions.total} steps walked
            </p>
          )}
          <ol className={styles.arcs}>
            {(missions?.arcs ?? []).map((arc) => (
              <li key={arc.arc}>
                <button
                  type="button"
                  className={[
                    styles.arcButton,
                    arc.arc === shown?.arc ? styles.arcCurrent : '',
                    arc.finished ? styles.arcDone : '',
                    arc.open ? '' : styles.arcShut,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setViewing(arc.arc)}
                  aria-current={arc.arc === shown?.arc}
                >
                  <span className={styles.arcMark} aria-hidden>
                    {arc.finished ? '✔' : arc.open ? '▸' : '🔒'}
                  </span>
                  <span className={styles.arcName}>{arc.name}</span>
                  <span className={styles.arcCount}>
                    {arc.claimedSteps}/{arc.totalSteps}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {missions?.title && (
            <p className={styles.title}>
              <span className={styles.titleLabel}>Title earned</span>
              {missions.title}
            </p>
          )}
        </Panel>
      </aside>

      <div className={styles.main}>
        {error && <p className={styles.error}>{error}</p>}

        {loading && !missions ? (
          <p className={styles.empty}>Reading the Path…</p>
        ) : !shown ? (
          <p className={styles.empty}>The Path has not been laid yet.</p>
        ) : (
          <>
            <header className={styles.head}>
              <h2 className={styles.headName}>{shown.name}</h2>
              <p className={styles.headNote}>
                {shown.finished
                  ? 'Walked.'
                  : shown.open
                    ? `${shown.claimedSteps} of ${shown.totalSteps} claimed`
                    : 'Finish the arc before this one to open it.'}
              </p>
            </header>

            <ul className={styles.list}>
              {shown.missions.map((standing) => (
                <MissionRow
                  key={standing.missionKey}
                  standing={standing}
                  def={defOf(standing.missionKey)}
                  championName={(key) =>
                    bundle?.champions.find((entry) => entry.key === key)?.name ?? key
                  }
                  busy={busy === standing.missionKey}
                  disabled={busy !== null}
                  onClaim={() => void claim(standing.missionKey)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
