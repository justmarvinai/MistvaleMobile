import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { SpireFloor } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Icon } from '@/ui/Icon/Icon';
import { Modal } from '@/ui/Modal/Modal';
import { Panel } from '@/ui/Panel/Panel';
import { Rewards } from '@/ui/Rewards/Rewards';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { Portrait } from '@/ui/Portrait/Portrait';
import { championArt } from '@/ui/championArt';
import { useContentStore } from '@/state/contentStore';
import { firstSpire, useSpireStore } from '@/state/spireStore';
import { TeamSelect } from '../Battle/TeamSelect';
import styles from './SpireScreen.module.scss';

/**
 * The Mistspire.
 *
 * A tower drawn as a column, bottom-anchored, so climbing reads as going *up* — which is
 * the one thing the screen has to say without words. Everything else on it exists to answer
 * a single question a player asks at the door of every warded floor: **who am I allowed to
 * bring?**
 *
 * So the ward is on the floor itself rather than behind a tooltip or on the team chooser
 * alone. A ward discovered only after the chooser is open is a ward that wasted a click,
 * and one discovered only after the fight started would be a refusal rather than a puzzle.
 */
export function SpireScreen(): JSX.Element {
  const overview = useSpireStore((store) => store.overview);
  const loading = useSpireStore((store) => store.loading);
  const loaded = useSpireStore((store) => store.loaded);
  const load = useSpireStore((store) => store.load);
  const claim = useSpireStore((store) => store.claim);
  const collected = useSpireStore((store) => store.collected);
  const dismiss = useSpireStore((store) => store.dismiss);
  const bundle = useContentStore((store) => store.bundle);

  const loadError = useSpireStore((store) => store.error);

  const tower = firstSpire(overview);

  const [chosen, setChosen] = useState<SpireFloor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-read on mount: a fight unmounts this screen, and the floor the player came back to
  // look at is the one that fight just changed.
  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Puts the floor a key can be spent on in front of the player.
   *
   * The tower is drawn top floor first so that climbing reads as going *up*, which is right
   * — and it means a fresh climb opens on floors 30 down to 23, with the one row carrying a
   * button thirty rows below the fold. A browser found it: the screen looked finished and
   * had nothing on it to press.
   *
   * `scrollTop` on the tower's own container rather than `scrollIntoView`, which bubbles to
   * every scrollable ancestor — the first cut used it and took the *page* with it, so the
   * title bar and the standing strip scrolled off and the landings ran under the dock. The
   * tower has its own scroller; only it should move.
   *
   * Keyed on the floor so it re-centres after a climb rather than on every render.
   */
  const currentFloor = tower?.highestFloor ?? 0;
  const towerRef = useRef<HTMLElement | null>(null);
  const currentRow = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const column = towerRef.current;
    const row = currentRow.current;
    if (!column || !row) return;
    column.scrollTop = row.offsetTop - column.clientHeight / 2 + row.clientHeight / 2;
  }, [currentFloor, loaded]);

  const stages = useMemo(
    () => new Map((bundle?.stages ?? []).map((stage) => [stage.key, stage])),
    [bundle],
  );

  // Resolved before the picker is drawn: a floor whose stage has been un-published mid-climb
  // must close the dialog rather than open one over nothing.
  const chosenStage = chosen ? stages.get(chosen.stageKey) : undefined;

  const collect = async (landingKey: string, name: string): Promise<void> => {
    if (!tower) return;
    setBusy(true);
    setError(null);
    try {
      await claim(tower.dungeonKey, landingKey, name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That landing could not be collected.');
    } finally {
      setBusy(false);
    }
  };

  // Three states with no tower, and they are *not* the same thing — which is the lesson the
  // QA pass wrote down about the blank battlefield: an empty screen has to say which of its
  // causes it is, or a screenshot of it is not a diagnosis. A failed read said "no tower is
  // published" here until a browser found it, which is a wrong answer rather than a vague one.
  if (!tower) {
    const [title, message] = loadError
      ? ['The tower could not be read', loadError]
      : !loaded || loading
        ? ['Reading the tower…', 'One moment.']
        : ['The stair is dark', 'No tower is published. An operator adds one.'];
    return (
      <div className={styles.screen}>
        <Heading tagline="Thirty floors, and no two of them want the same team.">
          The Mistspire
        </Heading>
        <Empty glyph="glyph-rockets" title={title} message={message} />
      </div>
    );
  }

  if (!tower.open) {
    return (
      <div className={styles.screen}>
        <Heading tagline={tower.tagline}>{tower.name}</Heading>
        <Empty
          glyph="nav-locked"
          title="Not yet"
          message={tower.lockedReason ?? 'The Mistspire is not open to you yet.'}
        />
      </div>
    );
  }

  const unclaimed = tower.landings.filter((landing) => landing.reached && !landing.claimed);
  // Bottom-anchored: the tower is drawn from the top floor down, so floor one sits at the
  // foot of the column and the climb reads upward the way the fiction does.
  const descending = [...tower.floors].reverse();

  return (
    <div className={styles.screen}>
      <Heading
        tagline={tower.tagline}
        actions={
          <div className={styles.headActions}>
            <p className={styles.keys} aria-label="Keys left today">
              <Icon name="nav-spire" size={20} />
              <strong>{tower.keysLeft}</strong>
              <span className={styles.dim}>/ {tower.keysPerDay} keys</span>
            </p>
            <ScreenInfo title={tower.name}>
              <Panel title="Why the tower exists">
                <p className={styles.note}>
                  Everything else in Mistvale is won by one good team. The Mistspire is the one
                  place that asks for a <strong>broad</strong> roster instead of a deep one — some
                  floors are <strong>warded</strong>, and only four champions who meet the ward may
                  climb.
                </p>
                <p className={styles.note}>
                  A ward names an element, a faction, a role, or a rarity floor. The champion you
                  nearly fed away last week is usually the way past one.
                </p>
              </Panel>
              <Panel title="Keys, and what a failed floor costs">
                <p className={styles.note}>
                  A key is spent when a floor is <strong>beaten</strong>, never when it is
                  attempted. A warded floor can be attacked all evening with a different four each
                  time and cost nothing until it falls — because a floor that has to be solved
                  should be free to fail at.
                </p>
                <p className={styles.note}>
                  Floors are climbed in order, one at a time, and none can be re-fought this climb.
                </p>
              </Panel>
              <Panel title="The climb resets with the month">
                <p className={styles.note}>
                  This climb is <strong>{tower.anchor}</strong> and it closes on{' '}
                  <strong>{tower.closesOn}</strong>. On the first of next month the tower starts
                  again from floor one, and its landings can be collected again.
                </p>
              </Panel>
            </ScreenInfo>
          </div>
        }
      >
        {tower.name}
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.standing}>
        <div className={styles.standingCell}>
          <span className={styles.dim}>This climb</span>
          <strong className={styles.big}>Floor {tower.highestFloor}</strong>
          <span className={styles.dim}>of {tower.floors.length}</span>
        </div>
        <div className={styles.standingCell}>
          <span className={styles.dim}>Best ever</span>
          <strong className={styles.big}>Floor {tower.bestEverFloor}</strong>
        </div>
        <div className={styles.standingCell}>
          <span className={styles.dim}>Closes</span>
          <strong>{tower.closesOn}</strong>
          <span className={styles.dim}>then back to floor one</span>
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.tower} aria-label="Floors" ref={towerRef}>
          {descending.map((floor) => (
            <FloorRow
              key={floor.stageKey}
              floor={floor}
              rowRef={floor.current ? currentRow : undefined}
              onClimb={() => setChosen(floor)}
              disabled={busy}
            />
          ))}
        </section>

        <aside className={styles.landings} aria-label="Landings">
          <h2 className={styles.asideTitle}>Landings</h2>
          <p className={styles.note}>
            Paid once per climb, for having got that high. The floors themselves pay about what a
            campaign stage does — the landings are the reason to climb.
          </p>
          {tower.landings.map((landing) => (
            <article
              key={landing.key}
              className={[
                styles.landing,
                landing.claimed ? styles.landingDone : '',
                landing.reached && !landing.claimed ? styles.landingReady : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <header className={styles.landingHead}>
                <span className={styles.landingFloor}>{landing.floor}</span>
                <h3 className={styles.landingName}>{landing.name}</h3>
              </header>
              <Rewards rewards={landing.rewards} />
              {landing.claimed ? (
                <p className={styles.claimed}>Collected</p>
              ) : landing.reached ? (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void collect(landing.key, landing.name)}
                >
                  Collect
                </Button>
              ) : (
                <p className={styles.dim}>Reach floor {landing.floor}</p>
              )}
            </article>
          ))}
          {unclaimed.length > 0 && (
            <p className={styles.ready}>
              {unclaimed.length} landing{unclaimed.length === 1 ? '' : 's'} waiting.
            </p>
          )}
        </aside>
      </div>

      {/* The picker reads the ward off the stage itself and refuses an illegal team there,
          so nothing about it needs passing down. It navigates to the fight on its own with
          `setScreen`, which records the screen it left — so "Back to the Mistspire" works
          with nothing here to arrange it. The first cut called `enterFrom` on the Climb
          press to arrange it anyway, and `enterFrom` *navigates*: pressing Climb jumped
          straight to an empty battle screen reading "No battle in progress." */}
      {chosenStage && (
        <TeamSelect
          stage={chosenStage}
          title={`Floor ${chosen?.floor}`}
          attempts={{
            left: tower.keysLeft,
            perDay: tower.keysPerDay,
            turnCap: chosenStage.starRules.maxTurns,
            noun: 'key',
            // Its own sentence, because a floor is attempts-limited *and* scored on the
            // clear — the two facts the Titan happens to combine. Says plainly that a
            // failed attempt is free, which is the mode's whole bargain.
            summary: `${chosenStage.waves.length} wave${chosenStage.waves.length === 1 ? '' : 's'} · the key is spent only if you win`,
          }}
          onClose={() => setChosen(null)}
        />
      )}

      {collected && (
        <Modal open title={collected.name} onClose={dismiss}>
          <p className={styles.note}>Collected from the Mistspire.</p>
          <Rewards rewards={collected.rewards} />
          <Button variant="primary" onClick={dismiss}>
            Good
          </Button>
        </Modal>
      )}
    </div>
  );
}

/**
 * One floor of the tower.
 *
 * Three states and only one of them has a button: cleared floors are behind you and cannot
 * be re-fought this climb, floors above the next one are not reachable yet, and exactly one
 * floor — the next — is the one a key can be spent on. Drawing a Climb button on any other
 * row would be offering a door the server will shut.
 */
function FloorRow({
  floor,
  onClimb,
  disabled,
  rowRef,
}: {
  floor: SpireFloor;
  onClimb: () => void;
  disabled: boolean;
  /** Set on the one floor a key can be spent on, so the screen can open there. */
  rowRef?: MutableRefObject<HTMLElement | null>;
}): JSX.Element {
  const bundle = useContentStore((store) => store.bundle);
  // Who holds the floor (C47): the last wave's faces, the keeper ringed. The row had said
  // "Keeper" as a word and nothing else about what was up there, which on a tower whose
  // whole point is that no two floors want the same team is the one fact a row owes.
  const stage = bundle?.stages.find((entry) => entry.key === floor.stageKey);
  const holders = (stage?.waves.at(-1) ?? []).slice(0, 4);

  const classes = [
    styles.floor,
    floor.cleared ? styles.floorDone : '',
    floor.current ? styles.floorNow : '',
    floor.boss ? styles.floorBoss : '',
    floor.ward ? styles.floorWarded : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      ref={rowRef}
      className={classes}
      data-mv-highlight={floor.current ? 'spire-current' : undefined}
    >
      <span className={styles.number} aria-hidden="true">
        {floor.floor}
      </span>
      <span className={styles.holders} aria-hidden="true">
        {holders.map((unit, index) => {
          const foe = bundle?.enemies.find((entry) => entry.key === unit.enemyKey);
          const keeper = foe?.isBoss === true;
          return (
            <span key={`${unit.enemyKey}:${index}`} className={styles.holder} data-keeper={keeper}>
              <Portrait
                src={championArt(foe, bundle?.assets).portrait ?? null}
                name={foe?.name}
                size={keeper ? 64 : 48}
              />
            </span>
          );
        })}
      </span>
      <div className={styles.floorBody}>
        <h3 className={styles.floorTitle}>
          Floor {floor.floor}
          {floor.boss && <span className={styles.keeper}>Keeper</span>}
        </h3>
        {floor.ward ? (
          <p className={styles.ward}>
            <Icon name="nav-locked" size={16} />
            Warded — only <strong>{floor.ward.label}</strong> may climb
          </p>
        ) : (
          <p className={styles.dim}>Open to any four champions</p>
        )}
      </div>
      <div className={styles.floorAction}>
        {floor.cleared ? (
          <span className={styles.done} aria-label="Cleared">
            Climbed
          </span>
        ) : floor.current ? (
          <Button variant="primary" disabled={disabled} onClick={onClimb}>
            Climb
          </Button>
        ) : (
          <span className={styles.dim}>—</span>
        )}
      </div>
    </article>
  );
}
