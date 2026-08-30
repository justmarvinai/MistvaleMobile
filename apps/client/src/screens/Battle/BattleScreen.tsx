import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SPEED_UNLOCKS, clampSpeed, type SkillDef, type StageDef } from '@mistvale/shared';
import type { UnitRef } from '@mistvale/engine';
import { ActionBar } from '@/fui/components/ActionBar.ts';
import { BattleControls } from '@/fui/components/BattleControls.ts';
import { PartyFrame } from '@/fui/components/PartyFrame.ts';
import { UnitFrame } from '@/fui/components/UnitFrame.ts';
import { WaveTracker } from '@/fui/components/WaveTracker.ts';
import { Fui } from '@/fui/react';
import { Button } from '../../ui/Button/Button';
import { BattleScene } from '../../game/battleScene';
import { stillPath } from '../../game/sprites';
import { skillArt } from '../../ui/skillArt';
import { getStage, isSceneAttached, setScene, stageFailure } from '../../game/stage';
import { blindMessage, blindReason, type BlindReason } from './blindStage';
import { BossBar, BossSkills, bossOnField } from './BossFrame';
import { focusUnit, sameRef } from './focus';
import { DomBattlefield } from './DomBattlefield';
import { UnitOverlay } from './UnitOverlay';
import { SkillTips } from './SkillTips';
import { autoShouldAsk, settledOnServer, watchedToTheEnd } from '../../state/battleClocks';
import { useBattleStore } from '../../state/battleStore';
import { useLoadoutStore } from '../../state/loadoutStore';
import { useContentStore } from '../../state/contentStore';
import { SpeedLadder } from '../../ui/SpeedLadder/SpeedLadder';
import { useNavStore } from '../../state/navStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { useRosterStore } from '../../state/rosterStore';
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
 * this genre arranges them: the wave pips top-left, the
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
  const busy = useBattleStore((state) => state.busy);
  const error = useBattleStore((state) => state.error);
  const act = useBattleStore((state) => state.act);
  const runAuto = useBattleStore((state) => state.runAuto);
  const retreat = useBattleStore((state) => state.retreat);
  const setSpeed = useBattleStore((state) => state.setSpeed);
  const autoFocus = useBattleStore((state) => state.focus);
  const setAutoFocus = useBattleStore((state) => state.setFocus);
  const setAuto = useBattleStore((state) => state.setAuto);
  const skipToLatest = useBattleStore((state) => state.skipToLatest);
  const resume = useBattleStore((state) => state.resume);
  const resetBattle = useBattleStore((state) => state.reset);
  const pausePlayback = useBattleStore((state) => state.pausePlayback);
  const resumePlayback = useBattleStore((state) => state.resumePlayback);

  // Two clocks, two questions — see state/battleClocks.ts. `settled` is the server's
  // answer and gates the buttons that talk to it; `watched` is the playback's and gates
  // everything that gives the outcome away.
  const settled = useBattleStore(settledOnServer);
  // The server's answer, not a guess: a fight is skippable only on a stage already beaten.
  // Absent on nothing — every view carries it — but defaulted so a battle read from an
  // older response cannot make the button appear.
  const canSkip = useBattleStore((state) => state.battle?.canSkip === true);
  // Auto's own clock: the server's, bounded by how far ahead it already is — see
  // `autoShouldAsk`.
  const autoWants = useBattleStore(autoShouldAsk);
  const watched = useBattleStore(watchedToTheEnd);

  const bundle = useContentStore((state) => state.bundle);
  const back = useNavStore((state) => state.back);
  const coldOpenStage = useColdOpenStage();
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  // The party cards on the result screen carry the level and star rank each champion
  // *finished* on, and "Next" is only offered on a stage the server has said is open — so
  // both stores are stale by exactly one fight without this.
  const refreshRoster = useRosterStore((state) => state.load);
  const refreshProgress = useProgressStore((state) => state.load);

  /**
   * Whether to draw the fight with the browser rather than with the graphics card.
   *
   * Two ways in. The player's own switch, for the machines where a graphics context exists
   * and does not work — a blocklisted driver, a software renderer that draws the allies and
   * not the enemies, acceleration turned off somewhere upstream. None of those can be told
   * apart from inside the page, which is why it is a switch and not a detection.
   *
   * And automatically when there is provably no context at all, because a player who cannot
   * see the fight cannot find the setting that would let them.
   */
  const simpleBattlefield = usePlayerStore((state) => state.settings.simpleBattlefield);

  // How this player likes to watch a fight, remembered across fights and sign-ins.
  const preferredSpeed = useLoadoutStore((state) => state.speed);
  // Which rungs this account has earned — the server's answer, since the gate is campaign
  // progress. Clamped so a speed remembered before a retune (or hand-edited into local
  // storage) lands on the fastest one actually open rather than off the end of the control.
  const openSpeeds = usePlayerStore((state) => state.battleSpeeds);
  // Which campaign earns each locked rung. Content, so the ladder can say the condition
  // rather than a sentence this screen made up.
  const speedUnlocks = useContentStore((state) =>
    state.bundle?.config['battle.speedUnlocks'] &&
    typeof state.bundle.config['battle.speedUnlocks'] === 'object'
      ? (state.bundle.config['battle.speedUnlocks'] as Record<string, string>)
      : DEFAULT_SPEED_UNLOCKS,
  );
  const speed = clampSpeed(preferredSpeed, openSpeeds);
  const preferredAuto = useLoadoutStore((state) => state.auto);
  const rememberSpeed = useLoadoutStore((state) => state.setSpeed);
  const rememberAuto = useLoadoutStore((state) => state.setAuto);

  const sceneRef = useRef<BattleScene | null>(null);
  const [target, setTarget] = useState<UnitRef | null>(null);
  const [barHost, setBarHost] = useState<HTMLDivElement | null>(null);

  /**
   * Picking somebody on the field.
   *
   * One gesture, two meanings, and which one it carries is whatever the player is doing at
   * the time: while a champion is waiting for a command it is *this turn's target*, and it
   * is also remembered as the enemy auto-battle should concentrate on. Picking the same
   * unit again clears both, which is how a player says "no, choose for me".
   */
  const pick = useCallback(
    (ref: UnitRef) => {
      setTarget((current) => (current && sameRef(current, ref) ? null : ref));
      if (ref.side === 'enemy') {
        setAutoFocus(autoFocus && sameRef(autoFocus, ref) ? null : ref);
      }
    },
    [autoFocus, setAutoFocus],
  );
  const controlsRef = useRef<HTMLDivElement>(null);

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

  /**
   * The art lookup, read through a ref.
   *
   * The scene used to be rebuilt whenever this changed identity — which is whenever the
   * content bundle is replaced, for any reason, including a re-fetch that changed nothing.
   * A rebuilt scene starts empty, and the effect that fills it ran only on `view`; so a
   * bundle that arrived while the fight was waiting on the player left a correct battle
   * playing over a blank field until something moved. Behind a ref, new content is simply
   * picked up by the next lookup and the scene never has to be thrown away.
   */
  const artForRef = useRef(artFor);
  useEffect(() => {
    artForRef.current = artFor;
  }, [artFor]);

  // One scene for the life of the screen; the store drives what it shows. Not built at all
  // when the player has asked for the simple battlefield — there is no sense spending a
  // graphics context on a scene nobody is going to look at.
  useEffect(() => {
    if (simpleBattlefield) return;
    const scene = new BattleScene((defKey) => artForRef.current(defKey));
    sceneRef.current = scene;
    setScene(scene);
    return () => {
      sceneRef.current = null;
      setScene(null);
    };
  }, [simpleBattlefield]);

  /**
   * Draws the current view — and makes sure it is still ours to draw on.
   *
   * No dependency array, deliberately. Two things have to be true after *every* commit,
   * and neither is a function of `view` alone: the scene has to hold the latest view, and
   * it has to still be the scene the stage is showing. `PixiStage` re-initialising will
   * quietly replace it with the ambient mist (see `isSceneAttached`), and the result is
   * the worst failure this screen has: a fight that plays perfectly over an empty field,
   * with nothing on screen or in the console to say what happened. Re-attaching is an
   * identity comparison, so paying it per commit costs nothing and closes the whole class.
   */
  /** Set when drawing the view threw — see `drawFailed` below. */
  const drawError = useRef<string | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!isSceneAttached(scene)) setScene(scene);
    // `sync` is async, and this used to be a bare `void`: anything it threw became an
    // unhandled rejection, so a battlefield that failed to draw failed in complete silence.
    void scene.sync(view).catch((cause: unknown) => {
      drawError.current = cause instanceof Error ? cause.message : String(cause);
      console.error('Mistvale: the battlefield could not be drawn —', cause);
    });
  });

  /**
   * Paints the Auto button as engaged.
   *
   * `BattleControls` sets `aria-pressed` from its `auto` option at construction but adds
   * the `is-on` class only in its own `setAuto` — so a control *built* engaged is correct
   * to a screen reader and looks exactly like a control that is off. That never showed up
   * before, because Auto could only ever be turned on by clicking it; it does now, because
   * a remembered Auto builds the control already on.
   *
   * Fixed here rather than in the component: `src/fui` is vendored and the next sync would
   * overwrite it. No dependency array, so it survives the remount that changing either
   * standing choice causes.
   */
  /**
   * Whether the battlefield is actually being drawn.
   *
   * The worst thing this screen can do is show a correct fight over an empty rectangle: the
   * HUD is right, the turn order moves, the health bars move, and there is nothing there.
   * It happened, twice, for two unrelated reasons — and both times the only signal was a
   * screenshot from the owner. So the screen checks its own work: if the fight has units in
   * it and the scene has drawn none of them a moment later, it says so, in a line under the
   * hotbar, instead of leaving somebody to guess.
   *
   * A beat of delay, because a scene is legitimately empty for the frame between the board
   * arriving and the first sync.
   */
  const [blind, setBlind] = useState<{ reason: BlindReason; message: string } | null>(null);
  const unitCount = view.allies.length + view.enemies.length;
  useEffect(() => {
    // Nothing to warn about when the browser is drawing the fight on purpose.
    if (unitCount === 0 || simpleBattlefield) return;
    const timer = window.setTimeout(() => {
      const scene = sceneRef.current;
      const reason = blindReason({
        units: unitCount,
        hasStage: getStage() !== null,
        attached: scene !== null && isSceneAttached(scene),
        drawn: scene?.drawn ?? 0,
        drawError: drawError.current,
      });
      setBlind(
        reason === null
          ? null
          : {
              reason,
              message: blindMessage(
                reason,
                reason === 'no-context' ? stageFailure() : drawError.current,
              ),
            },
      );
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [unitCount, view.wave, simpleBattlefield]);

  useLayoutEffect(() => {
    controlsRef.current
      ?.querySelector('.fui-battlectl__auto')
      ?.classList.toggle('is-on', preferredAuto);
  });

  /**
   * Speed is a standing choice, not a per-fight one.
   *
   * The store starts every session at ×1, so a player who set ×2 last night set it again
   * this morning, and again after the next reload. The remembered value is pushed into the
   * battle store rather than read from it, because the playback clock is the thing that
   * has to know.
   */
  useEffect(() => {
    setSpeed(speed);
  }, [speed, setSpeed]);

  /**
   * And so is Auto — as a loop rather than a single shot.
   *
   * A player who turned it on meant "fight these for me", not "fight this one for me", so
   * it engages itself on the next fight too. But it asks for a handful of turns at a time
   * (`runAuto`) and this effect re-asks for as long as it is still engaged, which is what
   * makes the button a real toggle: switch it off and the asking stops, and control comes
   * back at the very next decision.
   *
   * It used to fire once per battle and ask the server to resolve the *whole* fight, which
   * is why it could be turned on and never off — pressing it again had nothing left to
   * cancel. Multi-battle and the Arena still resolve in one call; they are not this button.
   *
   * Gated on `autoShouldAsk` — the server's clock, bounded by how far ahead of the
   * animation it already is. Pacing to the playback made Auto as slow as watching; letting
   * it run unbounded resolved the fight before the button could be pressed again, which is
   * the original bug wearing a different hat. The engine advances at least one turn per
   * call, so this cannot spin.
   */
  useEffect(() => {
    if (!preferredAuto || !battle || !autoWants || busy) return;
    setAuto(true);
    void runAuto();
  }, [preferredAuto, battle, autoWants, busy, runAuto, setAuto]);

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

  // Three things moved when the fight resolved, and the result screen reads all of them:
  // the wallet, the champions who fought (a level, a rank, the experience left to run) and
  // what the clear opened. All three re-sync when the player has **watched** the end rather
  // than when the server got there — the top bar is on screen throughout a battle, and
  // silver climbing at turn three announces the win as plainly as the modal would.
  useEffect(() => {
    if (!watched) return;
    void refreshPlayer();
    void refreshRoster();
    void refreshProgress();
  }, [watched, refreshPlayer, refreshRoster, refreshProgress]);

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
   * The boss the player can see, if this wave holds one.
   *
   * Read from the **playback** rather than from the server's board, which is the whole of
   * P10a's rule applied to a new thing: Auto resolves several turns per response, so the
   * server is routinely two waves ahead — the first cut of this read `isBoss` off
   * `battle.state` and put a full boss frame over wave one already showing `0 / 235`.
   */
  const boss = useMemo(() => bossOnField(view.enemies), [view.enemies]);

  /** What it can do: its own skills out of content, and the mechanics beside them. */
  const bossDef = useMemo(
    () => bundle?.enemies.find((entry) => entry.key === boss?.defKey),
    [bundle, boss],
  );
  const bossSkills: SkillDef[] = useMemo(() => {
    return (bossDef?.skills ?? [])
      .map((key) => skillsByKey.get(key))
      .filter((skill): skill is SkillDef => skill !== undefined && skill.slot !== 'passive');
  }, [bossDef, skillsByKey]);

  /** Whoever is under consideration — the rule, and why there is one, is in `./focus`. */
  const focus = useMemo(
    () =>
      battle
        ? focusUnit(battle.state.allies, battle.state.enemies, target, boss?.ref ?? null)
        : null,
    [battle, boss, target],
  );

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

  // The notice is stale the moment the browser takes over the drawing.
  const simpleField = simpleBattlefield || blind?.reason === 'no-context';
  const notice = simpleBattlefield ? null : blind;

  if (!battle) {
    return (
      <div className={styles.screen}>
        {coldOpenStage ? (
          <ColdOpen stage={coldOpenStage} />
        ) : (
          <>
            <p className={styles.hint}>No battle in progress.</p>
            <Button onClick={leave}>Back</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {/* A window onto the shared Pixi canvas, which is behind the whole shell — not a
          stage of its own. Mounting a second <PixiStage> here is what made this screen
          render nothing at all: its wrapper is a fixed, opaque, full-viewport layer, and
          being later in the DOM than the HUD it painted straight over it.

          When there is no graphics context to be had, the same space is filled by a
          battlefield the browser draws (`DomBattlefield`). Only for that one cause: a stage
          that exists but is empty is a bug to fix, not a machine to work around, and
          quietly papering over it is how the last one survived four rounds. */}
      <div className={styles.stage}>
        {simpleField && <DomBattlefield view={view} artFor={artFor} />}
        {/* Over whichever renderer is running: the part of the field a pointer can reach. */}
        <UnitOverlay
          view={view}
          target={target}
          focus={autoFocus}
          pickable={awaitingInput && !busy}
          onPick={pick}
        />
      </div>

      <div className={styles.hud}>
        <div className={styles.where}>
          <Fui
            of={WaveTracker}
            options={{ waves: waveCount, current: view.wave + 1, label: 'Wave', size: 'sm' }}
            /* `WaveTracker` takes `current` at construction and paints from its own field
               thereafter — so without this it was built on wave one and stayed there for
               the whole fight, however many waves the stage had. Silent, because `set`
               emits `wave:change` and `wave:clear` otherwise, and this is the fight telling
               the pips where it got to rather than the pips announcing a decision. */
            apply={(tracker, next) => tracker.set(next.current ?? 1, { silent: true })}
          />
          <span className={styles.turnCount}>Turn {view.turn}</span>
        </div>

        {/* The creature the fight is about, across the top — the owner's reference. Drawn
            only when there is one, so an ordinary wave is the same screen without it. */}
        {boss && (
          <div className={styles.bossBar}>
            <BossBar boss={boss} subtitle={`Wave ${view.wave + 1} of ${waveCount}`} />
          </div>
        )}

        {/* And what it can do, down the side: the mechanics that decide which champions
            belong here, and its own skills, hoverable. All of it content the game has
            carried since P1 and P6 and stated only in the team chooser (D8). */}
        {boss && (
          <div className={styles.bossRail}>
            <BossSkills name={boss.name} def={bossDef} skills={bossSkills} />
          </div>
        )}

        <div className={styles.controls} ref={controlsRef}>
          <Fui
            /* Remounted when either standing choice changes. `BattleControls` takes both
               at construction and its own `setAuto` *emits* `battle:auto`, so pushing the
               new value in through the setter would echo straight back into the handler
               below. Four buttons with no animation state are cheap to rebuild. */
            key={`${preferredAuto}|${speed}|${openSpeeds.join('')}`}
            of={BattleControls}
            options={{
              // The remembered answer rather than the fight's, so a battle opened with Auto
              // already engaged shows the button pressed instead of contradicting itself.
              auto: preferredAuto,
              speed,
              // One rung, because its speed button is hidden: `SpeedLadder` draws the whole
              // ladder beside it. The library's control steps to the next *unlocked* rung,
              // which means a rung nobody has earned is invisible — and an unlock nobody
              // can see is a feature that does not exist.
              speeds: [speed],
              pausable: false,
              retreatable: true,
            }}
            on={{
              // The control is a real toggle and sends its new state; the old handler
              // ignored the payload and ran the fight out whichever way it was pressed,
              // so Auto could be turned on and never off. Both halves are remembered.
              'battle:auto': (on: boolean) => {
                rememberAuto(on);
                setAuto(on);
                if (on) void runAuto();
              },
              'battle:retreat': () => void retreat(),
            }}
          />
          {/* Skip is Mistvale's, not the library's: it belongs to the *playback* clock
              rather than to the fight, and it only exists while there is a recording left
              to jump over (P10a).

              It used to appear only once the *server* had finished, which was the same
              thing back when one Auto press resolved the whole fight. Since B3 it does
              not: auto takes a few turns at a time, so `settled` stays false until the
              last chunk and the button that exists to skip an auto-battle was missing for
              all of it. Auto is the other way in — while it is engaged there is always a
              recording ahead of the player, and skipping it is the whole point. */}
          {/* The ladder the library cannot draw. Beside its row rather than inside it,
              because the row is the library's chrome and this is state React owns. */}
          <SpeedLadder
            open={openSpeeds}
            current={speed}
            unlocks={speedUnlocks}
            onPick={(next) => {
              rememberSpeed(next);
              setSpeed(next);
            }}
          />
          {/* `!watched` rather than `playing`: auto drains its buffer between requests, and
              gating on the queue made the button blink out and back several times a fight.
              Pressing it with nothing queued is a no-op.

              And only on a stage this account has already beaten (owner, 2026-08-22) — the
              first walk down a road is a fight you watch. The server decided it when the
              battle opened and refuses the request regardless; this is so the button is
              not offered and then taken away. */}
          {canSkip && !watched && (settled || preferredAuto) && (
            <Button size="sm" variant="ghost" onClick={() => void skipToLatest()}>
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
          // Options are construction-time, so without this the party's health bars were
          // painted once — at full — and stayed there for the whole fight. `setMembers`
          // rather than a rebuild, because rebuilding restarts every bar's fill animation
          // and drops the selection ring on whoever is acting.
          apply={(frame, next) => {
            frame.setMembers(next.members);
            for (const member of next.members) {
              frame.setHealth(member.id, member.health ?? 0, member.healthMax ?? 0);
              frame.setInactive(member.id, (member.health ?? 0) <= 0);
            }
          }}
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
            // The plate follows whoever is under consideration, and the health on it is the
            // number the player is watching while they decide. Without a push it showed the
            // health that unit had when the plate first appeared.
            apply={(plate, next) => {
              plate.setName(next.name ?? '');
              plate.setHealth(next.health ?? 0, next.healthMax ?? 0);
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
              {/* Skip is named only when it is actually offered. A first clear is not
                  skippable (C7), so on the one fight a player is most likely to be
                  impatient through, this line had been pointing at a button that was not
                  on the screen. */}
              {!(settled || preferredAuto)
                ? 'Resolving…'
                : canSkip
                  ? 'Playing out — Skip to jump ahead.'
                  : 'Playing out — the first walk down a road is one you watch.'}
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
                apply={(plate, next) => {
                  plate.setName(next.name ?? '');
                  plate.setHealth(next.health ?? 0, next.healthMax ?? 0);
                }}
              />
              {/* `bindKeys` is off: the dock already owns 1-9 for navigation, and a number
                  key that fires a skill on one screen and moves you off it on another is
                  worse than no shortcut at all. */}
              <div className={styles.skills} ref={setBarHost}>
                <Fui
                  of={ActionBar}
                  options={{ actions: slots, bindKeys: false, slotSize: 'lg' }}
                  // Cooldowns move every turn, and a hotbar that keeps the ones it was
                  // built with tells the player a spent ultimate is ready.
                  apply={(bar, next) => {
                    (next.actions ?? []).forEach((action, index) => bar.setAction(index, action));
                  }}
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
                {/* What each slot actually does, in the game's own words: who it lands on,
                    what it costs in turns, and when it comes back. All of it has been in
                    the content bundle since P1 and no screen had ever said it. */}
                <SkillTips host={barHost} skills={skills} cooldowns={actingUnit.cooldowns ?? {}} />
              </div>
            </>
          ) : (
            <span className={styles.hint}>Waiting for the server…</span>
          )}

          {/* Never a silent black rectangle, and never a vague one: the sentence names which
              of four things went wrong, because each is a different thing to fix. */}
          {notice && <span className={styles.error}>{notice.message}</span>}

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

/**
 * Whether the empty battle screen is standing in for the cold open, and on which stage.
 *
 * The opening fight is the only battle in the game that is not started from a map — there
 * is no map yet, and no team to bring. So the empty battle screen offers it, but *only*
 * while the tutorial is actually waiting on it: the check is the step's own goal naming a
 * `tutorial` stage, which means an operator who re-cuts the script moves this button with
 * it, and a player past that step never sees it again.
 *
 * A hook rather than a component that returns null, because the *screen* has to know: an
 * offer to start the opening fight and a notice that no fight is running are two different
 * states of the same blank screen, and drawing both stacked the way out of the tutorial
 * underneath the tutorial's own card.
 */
function useColdOpenStage(): StageDef | null {
  const step = useTutorialStore(currentStep);
  const bundle = useContentStore((state) => state.bundle);
  const goal = step?.goal;
  const stageKey = goal?.type === 'stageClear' ? String(goal.filters.stageKey ?? '') : '';
  const stage = bundle?.stages.find((entry) => entry.key === stageKey);
  return stage && stage.mode === 'tutorial' ? stage : null;
}

function ColdOpen({ stage }: { stage: StageDef }): JSX.Element {
  const step = useTutorialStore(currentStep);
  const startBattle = useBattleStore((state) => state.startBattle);
  const busy = useBattleStore((state) => state.busy);

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
