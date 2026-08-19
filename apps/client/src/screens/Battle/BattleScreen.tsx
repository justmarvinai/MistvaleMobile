import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillDef } from '@mistvale/shared';
import type { UnitRef } from '@mistvale/engine';
import { ActionBar } from '@/fui/components/ActionBar.ts';
import { BattleControls } from '@/fui/components/BattleControls.ts';
import { PartyFrame } from '@/fui/components/PartyFrame.ts';
import { TurnMeter } from '@/fui/components/TurnMeter.ts';
import { UnitFrame } from '@/fui/components/UnitFrame.ts';
import { WaveTracker } from '@/fui/components/WaveTracker.ts';
import { Fui } from '@/fui/react';
import { Button } from '../../ui/Button/Button';
import { BattleScene } from '../../game/battleScene';
import { stillPath } from '../../game/sprites';
import { skillArt } from '../../ui/skillArt';
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
 * A Pixi stage rendering the playback view, with the HUD as DOM on top — the split the
 * architecture calls for: pixels in Pixi, text and hit targets in the DOM where they stay
 * crisp and accessible (docs/ARCHITECTURE.md §4.1).
 *
 * Since the design rework the HUD is the library's own battle widgets, arranged the way
 * this genre arranges them: the wave pips top-left, the turn queue across the top, the
 * controls at the right, the party down the left, whoever is under consideration in the
 * middle, and the acting champion with their skills along the bottom. The frame itself
 * never takes a click — only the widgets do — so the stage underneath stays reachable.
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
  const pausePlayback = useBattleStore((state) => state.pausePlayback);
  const resumePlayback = useBattleStore((state) => state.resumePlayback);

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

  // The playback clock lives in the store and outlived this screen: nothing stopped it
  // when the screen went away, so a sign-out mid-fight left it ticking — health bars
  // moving and hit cues playing over the sign-in form. Paused on the way out, picked back
  // up on the way in, and the fight itself is untouched either way.
  useEffect(() => {
    resumePlayback();
    return pausePlayback;
  }, [resumePlayback, pausePlayback]);

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

  /**
   * Upcoming turn order, straight off the state the server sent.
   *
   * The meter is shown as-is rather than animated: the server moves turn meters, and a
   * queue filling on its own would be the client guessing at the fight.
   */
  const queue = useMemo(() => {
    if (!battle) return [];
    return [...battle.state.allies, ...battle.state.enemies]
      .filter((unit) => unit.alive)
      .sort((a, b) => b.tm - a.tm || a.ref.slot - b.ref.slot)
      .slice(0, 6)
      .map((unit) => ({
        id: unitId(unit.ref),
        name: unit.name,
        portrait: stillPath(artFor(unit.defKey)),
        meter: Math.min(1, unit.tm / 100),
        enemy: unit.ref.side === 'enemy',
      }));
  }, [battle, artFor]);

  /** The four who came, with what is left of them. */
  const party = useMemo(() => {
    if (!battle) return [];
    return battle.state.allies.map((unit) => ({
      id: unitId(unit.ref),
      name: unit.name,
      portrait: stillPath(artFor(unit.defKey)),
      level: unit.level,
      health: unit.hp,
      healthMax: unit.maxHp,
      inactive: !unit.alive,
    }));
  }, [battle, artFor]);

  /**
   * How many waves this stage has.
   *
   * Read off the stage rather than off the fight: a wave the player has not reached yet
   * is exactly what the tracker is for, and the battle state only ever holds the current
   * one. Falls back to the wave in progress so a stage the bundle has not got answers
   * for still shows an honest pip.
   */
  const waveCount = useMemo(() => {
    const stage = bundle?.stages.find((entry) => entry.key === battle?.stageKey);
    return Math.max(stage?.waves?.length ?? 0, view.wave + 1);
  }, [bundle, battle?.stageKey, view.wave]);

  /**
   * Whoever is under consideration: the ally the player picked as a target, or else the
   * first enemy still standing. A fight with nobody in the middle of the screen reads as
   * a fight against nothing.
   */
  const focus = useMemo(() => {
    if (!battle) return null;
    const units = [...battle.state.allies, ...battle.state.enemies];
    const picked = target ? units.find((unit) => sameRef(unit.ref, target)) : undefined;
    return picked ?? battle.state.enemies.find((unit) => unit.alive) ?? null;
  }, [battle, target]);

  /** The acting champion's skills as action slots, with their cooldowns. */
  const slots = useMemo(
    () =>
      skills.map((skill) => ({
        icon: skillArt(skill.key),
        name: skill.name,
        ...(actingUnit && (actingUnit.cooldowns[skill.key] ?? 0) > 0
          ? { cooldown: actingUnit.cooldowns[skill.key] ?? 0, disabled: true }
          : {}),
        ...(busy ? { disabled: true } : {}),
      })),
    [skills, actingUnit, busy],
  );

  const actingId = actingUnit ? unitId(actingUnit.ref) : null;

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
      {/* A window onto the shared Pixi canvas, which is behind the whole shell — not a
          stage of its own. Mounting a second <PixiStage> here is what made this screen
          render nothing at all: its wrapper is a fixed, opaque, full-viewport layer, and
          being later in the DOM than the HUD it painted straight over it. */}
      <div className={styles.stage} />

      <div className={styles.hud}>
        <div className={styles.topLeft}>
          <Fui
            of={WaveTracker}
            options={{ waves: waveCount, current: view.wave + 1, label: 'Wave', size: 'sm' }}
          />
          <span className={styles.turnCount}>Turn {view.turn}</span>
        </div>

        <Fui
          of={TurnMeter}
          className={styles.order}
          options={{ units: queue, running: false, showBars: true, size: 44 }}
        />

        <div className={styles.controls}>
          <Fui
            of={BattleControls}
            options={{
              auto,
              speed,
              speeds: [1, 2],
              pausable: false,
              retreatable: true,
            }}
            on={{
              'battle:auto': () => void runAuto(),
              // The store's speed is a two-value union; the library's is any number in
              // `speeds`, so the narrowing happens here rather than being asserted.
              'battle:speed': ({ speed: next }: { speed: number }) => setSpeed(next === 2 ? 2 : 1),
              'battle:retreat': () => void retreat(),
            }}
          />
          {/* Skip is Mistvale's, not the library's: it belongs to the *playback* clock
              rather than to the fight, and it only exists while there is a recording left
              to jump over (P10a). */}
          {playing && settled && (
            <Button size="sm" variant="ghost" onClick={skipToLatest}>
              Skip
            </Button>
          )}
        </div>

        {/* Clicking a party member is how a targeted skill picks its ally — the same
            gesture as clicking an enemy on the stage. */}
        <Fui
          of={PartyFrame}
          className={styles.party}
          options={{ members: party, ...(actingId ? { selected: actingId } : {}) }}
          on={{ 'party:select': ({ id }: { id: string }) => setTarget(refFrom(id)) }}
        />

        {focus && (
          <Fui
            of={UnitFrame}
            className={styles.focus}
            options={{
              kind: focus.ref.side === 'enemy' ? ('target' as const) : ('player' as const),
              name: focus.name,
              portrait: stillPath(artFor(focus.defKey)),
              level: focus.level,
              health: focus.hp,
              healthMax: focus.maxHp,
              ...(focus.isBoss ? { elite: 'Boss' } : {}),
            }}
          />
        )}

        <div className={styles.bottom}>
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
              <Fui
                of={UnitFrame}
                className={styles.actor}
                options={{
                  kind: 'player' as const,
                  name: actingUnit.name,
                  portrait: stillPath(artFor(actingUnit.defKey)),
                  level: actingUnit.level,
                  health: actingUnit.hp,
                  healthMax: actingUnit.maxHp,
                }}
              />
              {/* `bindKeys` is off: the dock already owns 1-9 for navigation, and a number
                  key that fires a skill on one screen and moves you off it on another is
                  worse than no shortcut at all. */}
              <Fui
                of={ActionBar}
                className={styles.skills}
                options={{ actions: slots, bindKeys: false, slotSize: 'lg' }}
                on={{
                  'action:trigger': ({ index }: { index: number }) => {
                    const skill = skills[index];
                    if (!skill || busy) return;
                    void act({ skill: skill.key, ...(target ? { target } : {}) }).then(() =>
                      setTarget(null),
                    );
                  },
                }}
              />
            </>
          ) : (
            <span className={styles.hint}>Waiting for the server…</span>
          )}

          {error && <span className={styles.error}>{error}</span>}
        </div>
      </div>

      {watched && <Results onLeave={leave} />}
    </div>
  );
}

/**
 * A stable string id for a unit, and the way back.
 *
 * The library's list widgets key their rows by string id and hand that id back on a click;
 * the engine identifies a unit by `{side, slot}`. Side and slot are the whole of a
 * `UnitRef`, so the pair round-trips exactly — which matters because the id that comes
 * back from a party click becomes the *target* of the next skill, and a target the client
 * guessed wrong at is an action the server would refuse.
 */
function unitId(ref: UnitRef): string {
  return `${ref.side}:${ref.slot}`;
}

function refFrom(id: string): UnitRef | null {
  const [side, slot] = id.split(':');
  if ((side !== 'ally' && side !== 'enemy') || slot === undefined) return null;
  const index = Number(slot);
  return Number.isInteger(index) ? { side, slot: index } : null;
}

function sameRef(a: UnitRef, b: UnitRef): boolean {
  return a.side === b.side && a.slot === b.slot;
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
