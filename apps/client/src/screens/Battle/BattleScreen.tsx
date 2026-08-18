import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillDef } from '@mistvale/shared';
import type { UnitRef } from '@mistvale/engine';
import { Button } from '../../ui/Button/Button';
import { BattleScene } from '../../game/battleScene';
import { PixiStage } from '../../game/PixiStage';
import { setScene } from '../../game/stage';
import { settledOnServer, watchedToTheEnd } from '../../state/battleClocks';
import { useBattleStore } from '../../state/battleStore';
import { useContentStore } from '../../state/contentStore';
import { useNavStore } from '../../state/navStore';
import { usePlayerStore } from '../../state/playerStore';
import { currentStep, useTutorialStore } from '../../state/tutorialStore';
import { Results } from './Results';
import styles from './BattleScreen.module.scss';

/**
 * The battle screen.
 *
 * A Pixi stage rendering the playback view, with the HUD and skill bar as DOM on top —
 * the split the architecture calls for: pixels in Pixi, text and hit targets in the DOM
 * where they stay crisp and accessible (docs/ARCHITECTURE.md §4.1).
 *
 * It decides nothing about the fight. It shows what has been played back, and sends the
 * player's choices to the server.
 */

export function BattleScreen(): JSX.Element {
  const battle = useBattleStore((state) => state.battle);
  const view = useBattleStore((state) => state.view);
  const playing = useBattleStore((state) => state.playing);
  const awaitingInput = useBattleStore((state) => state.awaitingInput);
  const speed = useBattleStore((state) => state.speed);
  const auto = useBattleStore((state) => state.auto);
  const busy = useBattleStore((state) => state.busy);
  const error = useBattleStore((state) => state.error);
  const act = useBattleStore((state) => state.act);
  const runAuto = useBattleStore((state) => state.runAuto);
  const retreat = useBattleStore((state) => state.retreat);
  const setSpeed = useBattleStore((state) => state.setSpeed);
  const skipToLatest = useBattleStore((state) => state.skipToLatest);
  const resume = useBattleStore((state) => state.resume);
  const resetBattle = useBattleStore((state) => state.reset);

  // Two clocks, two questions — see state/battleClocks.ts. `settled` is the server's
  // answer and gates the buttons that talk to it; `watched` is the playback's and gates
  // everything that gives the outcome away.
  const settled = useBattleStore(settledOnServer);
  const watched = useBattleStore(watchedToTheEnd);

  const bundle = useContentStore((state) => state.bundle);
  const back = useNavStore((state) => state.back);
  const refreshPlayer = usePlayerStore((state) => state.refresh);

  const sceneRef = useRef<BattleScene | null>(null);
  const [target, setTarget] = useState<UnitRef | null>(null);

  /** Which sprite folder a unit's definition points at. */
  const artFor = useMemo(() => {
    const assets = new Map((bundle?.assets ?? []).map((asset) => [asset.key, asset.basePath]));
    const byKey = new Map<string, string>();
    for (const champion of bundle?.champions ?? []) {
      byKey.set(champion.key, assets.get(champion.assetKey) ?? 'enemies/teritorial_lizard');
    }
    for (const enemy of bundle?.enemies ?? []) {
      byKey.set(enemy.key, assets.get(enemy.assetKey) ?? 'enemies/teritorial_lizard');
    }
    return (defKey: string): string => byKey.get(defKey) ?? 'enemies/teritorial_lizard';
  }, [bundle]);

  // One scene for the life of the screen; the store drives what it shows.
  useEffect(() => {
    const scene = new BattleScene(artFor);
    sceneRef.current = scene;
    setScene(scene);
    return () => {
      sceneRef.current = null;
      setScene(null);
    };
  }, [artFor]);

  useEffect(() => {
    void sceneRef.current?.sync(view);
  }, [view]);

  // Recover a fight the player refreshed out of.
  useEffect(() => {
    if (!battle) void resume();
  }, [battle, resume]);

  // The wallet moved when the fight resolved — but the top bar is on screen throughout a
  // battle, and silver climbing at turn three announces the win as plainly as the modal
  // would. So it re-syncs when the player has watched the end, not when the server got
  // there.
  useEffect(() => {
    if (watched) void refreshPlayer();
  }, [watched, refreshPlayer]);

  const skillsByKey = useMemo(
    () => new Map((bundle?.skills ?? []).map((skill) => [skill.key, skill])),
    [bundle],
  );

  const actingUnit = useMemo(() => {
    const ref = battle?.state.awaiting;
    if (!ref) return null;
    return battle?.state.allies.find((unit) => unit.ref.slot === ref.slot) ?? null;
  }, [battle]);

  const skills: SkillDef[] = useMemo(() => {
    if (!actingUnit) return [];
    return actingUnit.skills
      .map((key) => skillsByKey.get(key))
      .filter((skill): skill is SkillDef => skill !== undefined && skill.slot !== 'passive');
  }, [actingUnit, skillsByKey]);

  /** Upcoming turn order, straight off the state the server sent. */
  const turnOrder = useMemo(() => {
    if (!battle) return [];
    return [...battle.state.allies, ...battle.state.enemies]
      .filter((unit) => unit.alive)
      .sort((a, b) => b.tm - a.tm || a.ref.slot - b.ref.slot)
      .slice(0, 6);
  }, [battle]);

  const leave = (): void => {
    resetBattle();
    back();
  };

  if (!battle) {
    return (
      <div className={styles.screen}>
        <ColdOpen />
        <p className={styles.hint}>No battle in progress.</p>
        <Button onClick={leave}>Back</Button>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.hud}>
        <span className={styles.wave}>
          Wave {view.wave + 1} · Turn {view.turn}
        </span>

        <div className={styles.order} aria-label="Turn order">
          {turnOrder.map((unit) => (
            <span
              key={`${unit.ref.side}-${unit.ref.slot}`}
              className={styles.orderPip}
              data-side={unit.ref.side}
              title={`${unit.name} — turn meter ${Math.round(unit.tm)}`}
            >
              {unit.name.split(' ')[0]}
            </span>
          ))}
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={speed === 2}
            onClick={() => setSpeed(speed === 2 ? 1 : 2)}
            title="Playback speed"
          >
            ×{speed}
          </button>
          {playing && (
            <button type="button" className={styles.toggle} onClick={skipToLatest}>
              Skip
            </button>
          )}
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={auto}
            disabled={busy || settled}
            onClick={() => void runAuto()}
          >
            Auto
          </button>
          <button
            type="button"
            className={styles.toggle}
            disabled={settled}
            onClick={() => void retreat()}
          >
            Retreat
          </button>
        </div>
      </div>

      <div className={styles.stage}>
        <PixiStage />
      </div>

      <div className={styles.bar}>
        {watched ? (
          <span className={styles.hint}>The fight is over.</span>
        ) : playing ? (
          // Two different waits wear the same spinner otherwise. Before the server
          // answers there is genuinely nothing to see; after it has, the fight on screen
          // is a recording, and the player who would rather not sit through it deserves
          // to be told where the button is.
          <span className={styles.hint}>
            {settled ? 'Playing out — Skip to jump to the end.' : 'Resolving…'}
          </span>
        ) : awaitingInput && actingUnit ? (
          <>
            <div className={styles.actor}>
              <div>{actingUnit.name}</div>
              <div className={styles.actorMeta}>
                {actingUnit.hp} / {actingUnit.maxHp} HP
              </div>
            </div>

            <div className={styles.skills}>
              {skills.map((skill) => {
                const cooldown = actingUnit.cooldowns[skill.key] ?? 0;
                return (
                  <button
                    key={skill.key}
                    type="button"
                    className={styles.skill}
                    disabled={cooldown > 0 || busy}
                    title={skill.description}
                    onClick={() =>
                      void act({ skill: skill.key, ...(target ? { target } : {}) }).then(() =>
                        setTarget(null),
                      )
                    }
                  >
                    <span>{skill.name}</span>
                    <span className={styles.skillMeta}>
                      {cooldown > 0 ? `Cooldown ${cooldown}` : skill.slot.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <span className={styles.hint}>Waiting for the server…</span>
        )}

        {error && <span className={styles.error}>{error}</span>}
      </div>

      {watched && <Results onLeave={leave} />}
    </div>
  );
}

/**
 * The way into the cold open.
 *
 * The opening fight is the only battle in the game that is not started from a map — there
 * is no map yet, and no team to bring. So the empty battle screen offers it, but *only*
 * while the tutorial is actually waiting on it: the check is the step's own goal naming a
 * `tutorial` stage, which means an operator who re-cuts the script moves this button with
 * it, and a player past that step never sees it again.
 */
function ColdOpen(): JSX.Element | null {
  const step = useTutorialStore(currentStep);
  const startBattle = useBattleStore((state) => state.startBattle);
  const busy = useBattleStore((state) => state.busy);
  const bundle = useContentStore((state) => state.bundle);

  const goal = step?.goal;
  const stageKey = goal?.type === 'stageClear' ? String(goal.filters.stageKey ?? '') : '';
  const stage = bundle?.stages.find((entry) => entry.key === stageKey);
  if (!stage || stage.mode !== 'tutorial') return null;

  return (
    <div className={styles.coldOpen}>
      <h2 className={styles.coldOpenTitle}>{step?.title}</h2>
      <p className={styles.coldOpenNote}>
        Three of them, lent to you for as long as this takes. They are not yours yet.
      </p>
      <Button
        variant="primary"
        disabled={busy}
        onClick={() => void startBattle({ mode: 'tutorial', stageKey: stage.key, team: [] })}
      >
        Meet them on the road
      </Button>
    </div>
  );
}
