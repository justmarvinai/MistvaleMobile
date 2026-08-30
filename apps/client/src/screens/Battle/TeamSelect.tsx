import { useMemo, useState } from 'react';
import {
  championMeets,
  multiBattleRefusal,
  restrictionLabel,
  teamRestrictionFailure,
} from '@mistvale/shared';
import type {
  BattleMode,
  FactionDef,
  MultiBattleResult,
  StageDef,
  TeamRestriction,
} from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { useRosterStore } from '../../state/rosterStore';
import { useBattleStore } from '../../state/battleStore';
import { useLoadoutStore } from '../../state/loadoutStore';
import { useNavStore } from '../../state/navStore';
import { MultiSummary } from './MultiSummary';
import styles from './TeamSelect.module.scss';
import { BossCard } from '../../ui/BossCard/BossCard';
import { stageBoss } from '../../ui/BossCard/bossRules';
import { Opposition } from './Opposition';
import { AllyStrip } from './AllyStrip';
import { Lineup, leaderAura } from './Lineup';
import { lineupSlots } from './slots';
import { useWarbandStore } from '../../state/warbandStore';
import { championArt } from '../../ui/championArt';

/**
 * Picking a team before a fight.
 *
 * Four slots, filled by clicking a champion. Slot one is the leader, whose aura applies —
 * which is why the order is the player's to choose rather than something we sort for them
 * (docs/UI_UX_DESIGN.md §3, screen 7), and since C22 the screen finally *says* what that
 * aura is.
 *
 * The layout is `Lineup`, shared with the Arena's picker: your four on the left, what is
 * waiting on the right, the roster underneath. What stays here is everything about *cost* —
 * energy against keys against strikes, the farm allowance, the practice sandbox — because
 * that is three economies and a layout that knew them all would be where they get confused.
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
 *
 * **It opens on the team you last sent.** Four empty slots on every stage of every evening
 * was the single most-repeated piece of work in the game (`state/loadoutStore.ts`). The
 * memory is per battle mode and filtered to champions still owned, so it can suggest a
 * stale squad but never an impossible one.
 */

/**
 * A fight paid for in **attempts** rather than energy.
 *
 * Two modes work this way and the picker has to say so twice — how the fight is shaped
 * ("one wave, fifty turns, paid for the damage you do") and what pressing the button
 * spends. It was a `titan` prop until the world boss wanted the identical two sentences
 * with one noun changed, which is the moment a special case becomes a shape.
 */
export interface AttemptCost {
  left: number;
  perDay: number;
  turnCap: number;
  /** Singular, lower case: "key", "strike". */
  noun: string;
  /**
   * What this fight *is*, in one line, replacing the energy-and-silver summary.
   *
   * Needed because "attempts rather than energy" and "paid for damage rather than for a
   * clear" turned out to be two different facts, and the first cut of this prop assumed
   * they were one. A browser found it on a Mistspire floor, which costs a key and is very
   * much scored on clearing: the picker told the player it was "paid for the damage you do".
   */
  summary?: string;
}

/**
 * How a ward reads on the door, using content's own names for a faction.
 *
 * The server has the same function against its cache (`spire/service.wardLabel`); this is
 * the client's half, and both defer to shared `restrictionLabel` so the phrasing is written
 * once. Only a faction needs content — the rest are enums shared has words for.
 */
function wardPhrase(ward: TeamRestriction, factions: readonly FactionDef[] | undefined): string {
  if (ward.kind !== 'faction') return restrictionLabel(ward);
  return restrictionLabel(ward, factions?.find((candidate) => candidate.key === ward.value)?.name);
}

export function TeamSelect({
  stage,
  title,
  attempts,
  onClose,
}: {
  stage: StageDef;
  /** Heading for the modal; defaults to the stage's own number. */
  title?: string;
  /**
   * What an attempt costs, when the fight is paid for in attempts rather than energy.
   *
   * Passed in rather than looked up, so the picker stays a picker and the Titan and world
   * boss screens stay the only places that know about keys and strikes.
   */
  attempts?: AttemptCost;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);
  const multi = usePlayerStore((state) => state.multiBattle);
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  const cleared = useProgressStore((state) => (state.stages.get(stage.key)?.clears ?? 0) > 0);
  const loadProgress = useProgressStore((state) => state.load);
  const startBattle = useBattleStore((state) => state.startBattle);
  const runMulti = useBattleStore((state) => state.runMulti);
  const busy = useBattleStore((state) => state.busy);
  const goTo = useNavStore((state) => state.setScreen);
  const warband = useWarbandStore((state) => state.warband);

  const rememberedTeam = useLoadoutStore((state) => state.teamFor);
  const rememberTeam = useLoadoutStore((state) => state.remember);
  const autoStart = useLoadoutStore((state) => state.auto);
  const setAuto = useLoadoutStore((state) => state.setAuto);

  /**
   * The team the player has actually touched, or null while they have touched nothing.
   *
   * Derived rather than seeded into state by an effect: the roster arrives after the first
   * paint, and copying it into state on arrival is a render cascade for a value that is a
   * pure function of two things already in hand. (The Arena's picker does the same.)
   */
  const [edits, setEdits] = useState<string[] | null>(null);
  const [runs, setRuns] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MultiBattleResult | null>(null);
  /**
   * The warden whose standard-bearer is coming along, by *their* player id (C37).
   *
   * Not remembered between fights, unlike the team: a borrow is one a day, so offering to
   * spend it again the moment the picker reopens is how somebody spends theirs by reflex on
   * a stage they were only glancing at.
   */
  const [ally, setAlly] = useState<string | null>(null);

  /**
   * What the dialog opens on: the last team sent into this mode.
   *
   * Filtered against the roster, because a champion fed away since last night is an id the
   * server would refuse and a slot the player cannot explain.
   */
  const suggested = useMemo(
    () => rememberedTeam(stage.mode, new Set(roster.map((owned) => owned.id))),
    [rememberedTeam, stage.mode, roster],
  );

  const team = edits ?? suggested;

  const championsByKey = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  /**
   * A warded floor's rule, and who on the current team fails it.
   *
   * Read off the **stage** rather than passed in, because the ward is a property of the
   * floor and the picker already holds the floor. Checked here as well as on the server for
   * the reason every client-side check in this game exists: to say *no* before anything is
   * spent, in a sentence, rather than to decide anything.
   */
  const ward = stage.teamRestriction;
  const wardLabelText = ward ? wardPhrase(ward, bundle?.factions) : null;
  const meetsWard = (championKey: string): boolean => {
    if (!ward) return true;
    const def = championsByKey.get(championKey);
    if (!def) return false;
    return championMeets(ward, {
      key: def.key,
      name: def.name,
      factionKey: def.factionKey,
      element: def.element,
      role: def.role,
      rarity: def.rarity,
    });
  };
  const wardFailure =
    ward && wardLabelText
      ? teamRestrictionFailure(
          ward,
          team
            .map((id) => roster.find((owned) => owned.id === id))
            .filter((owned): owned is NonNullable<typeof owned> => owned !== undefined)
            .map((owned) => {
              const def = championsByKey.get(owned.championKey);
              return {
                key: owned.championKey,
                name: def?.name ?? owned.championKey,
                factionKey: def?.factionKey ?? '',
                element: def?.element ?? '',
                role: def?.role ?? '',
                rarity: def?.rarity ?? ('common' as const),
              };
            }),
          wardLabelText,
        )
      : null;

  // A Titan costs a key rather than energy, so the energy bar has nothing to say about
  // whether the button works — but a spent allowance does.
  const affordable = attempts ? attempts.left > 0 : energy >= stage.energyCost;
  /** Whoever stands in the last wave, if it is somebody worth warning about. */
  const boss = stageBoss(stage, bundle?.enemies);
  const picked = team.length > 0;
  const canStart = picked && affordable && !busy && wardFailure === null;

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
  // The same list the server refuses a batch with, so a button that would be refused is
  // never drawn. `attempts` stays a separate prop because it also silences the *energy*
  // line; this is only about farming.
  const batchRefusal = multiBattleRefusal(stage.mode as BattleMode);

  // A borrowed warden takes one of the four rather than adding a fifth (C37), so the last
  // slot stops being offered the moment one is picked. The server says the same thing in
  // `assertTeamShape`; this only keeps the picker from composing a team it would refuse.
  const { ownCapacity, free } = lineupSlots(team.length, ally !== null);

  const toggle = (id: string): void => {
    setEdits(
      team.includes(id)
        ? team.filter((entry) => entry !== id)
        : team.length >= ownCapacity
          ? team
          : [...team, id],
    );
  };

  const start = async (mode: string): Promise<void> => {
    setError(null);
    try {
      // `practice` is a different mode from the stage's own, and `allyRefusal` is about the
      // mode the fight runs in — so a sandbox run carries no borrow, which is also right:
      // spending the day's one borrow on a fight that pays nothing would be a trap.
      const borrowed = ally !== null && mode === stage.mode;
      await startBattle({ mode, stageKey: stage.key, team, ...(borrowed ? { ally } : {}) });
      // Remembered on the way in, not on the way out: a fight the player retreats from was
      // still the team they meant to bring.
      rememberTeam(stage.mode, team);
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
      rememberTeam(stage.mode, team);
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

  const { aura, idle } = leaderAura(team, roster, championsByKey, bundle?.factions, stage.mode);
  /**
   * The warden standing in the lineup, resolved out of the list the store already holds.
   *
   * The store is the *server's* answer about who may be borrowed from and whether there is
   * a borrow left, so a pick that has gone stale — the warden released in another tab,
   * their nomination withdrawn — simply stops resolving and the slot empties, rather than
   * being carried into a start the server would refuse.
   */
  const lender = ally ? (warband.wardens.find((warden) => warden.playerId === ally) ?? null) : null;
  const borrowedBearer = lender?.standardBearer ?? null;
  const borrowedDef = borrowedBearer ? championsByKey.get(borrowedBearer.championKey) : undefined;

  const teamPower =
    team
      .map((id) => roster.find((owned) => owned.id === id)?.power ?? 0)
      .reduce((sum, power) => sum + power, 0) + (borrowedBearer?.power ?? 0);

  return (
    // `full` rather than `wide`: the confrontation is two formations side by side with a
    // roster under them, and at 1240 the two sides squeeze to a width where a champion card
    // is a thumbnail. The layout stacks the sides below 1100px on its own.
    <Modal open title={title ?? `Stage ${stage.number}`} onClose={onClose} size="full">
      <Lineup
        yours={{
          label: 'Your team',
          power: teamPower,
          aura,
          auraIdle: idle,
          auraHint: 'Whoever stands in slot one brings their aura to the whole team.',
        }}
        theirs={{ label: 'What is waiting' }}
        opposition={
          <>
            {/* Who is on the other side, wave by wave. Content has named every enemy of
                every stage since P2 and the only screen that ever read them was the fight
                itself — by which point the energy is spent and the team is locked. */}
            <Opposition stage={stage} heading={false} />

            {/* What the thing at the end *does* about being fought. Content has carried a
                boss's mechanics since P6 and no screen had ever said what was in them, so a
                keep meant to be a puzzle was a wall you lost to before guessing. On this
                side of the field because it is a fact about them, not about you. */}
            {boss && (
              <BossCard
                name={boss.name}
                where={boss.archetype === 'warlord' ? 'Warlord' : 'Keeper of the deep'}
                mechanics={boss.bossMechanics}
              />
            )}
          </>
        }
        team={team}
        {...(lender && borrowedBearer
          ? {
              guest: {
                name: borrowedDef?.name ?? borrowedBearer.championKey,
                portrait: borrowedDef
                  ? (championArt(borrowedDef, bundle?.assets).portrait ?? null)
                  : null,
                owner: lender.profileName,
                onRemove: () => setAlly(null),
              },
            }
          : {})}
        onToggle={toggle}
        {...(ward ? { eligible: meetsWard } : {})}
        {...(wardLabelText
          ? { barredReason: `The ward turns them back — only ${wardLabelText} may climb.` }
          : {})}
        notices={
          <>
            <p className={styles.summary}>
              {attempts
                ? (attempts.summary ??
                  `One wave · ${attempts.turnCap} turns · paid for the damage you do`)
                : `${stage.waves.length} waves · ${stage.energyCost} energy · ${stage.rewards.silverMin}–${stage.rewards.silverMax} silver`}
            </p>

            {/* The ward, in words, because it decides which of the cards below are even
                worth reading. A player who scrolls a roster of thirty and then finds out
                four of them were never eligible has been made to do the work twice. */}
            {wardLabelText && (
              <p className={styles.ward}>
                <strong>Warded.</strong> Only {wardLabelText} may climb this floor.
              </p>
            )}

            {/* A warden's champion, offered where the energy is about to be spent — which
                is the only place a borrow can honestly be spent, since there is one a day
                and a button on the Wardens screen would be a borrow with no fight
                attached. */}
            <AllyStrip
              mode={stage.mode as BattleMode}
              slotsFree={free}
              chosen={ally}
              onChoose={setAlly}
            />

            {error && <p className={styles.error}>{error}</p>}
          </>
        }
        footer={
          <>
            <div className={styles.actions}>
              <span className={styles.cost}>
                {attempts
                  ? `Costs one ${attempts.noun} — ${attempts.left} of ${attempts.perDay} left today`
                  : affordable
                    ? `Costs ${stage.energyCost} energy — you have ${energy}`
                    : `Needs ${stage.energyCost} energy — you have ${energy}`}
              </span>
              {/* Auto as a standing choice rather than a per-fight one, which is what
                  `loadoutStore` has held since B2 — the fight screen's toggle and this
                  checkbox are the same preference, so a player who always autos never
                  presses it again. */}
              <label className={styles.auto}>
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={(event) => setAuto(event.target.checked)}
                />
                Start on auto
              </label>
              <Button onClick={() => void start(stage.mode)} disabled={!canStart}>
                {busy ? 'Starting…' : 'Into the mist'}
              </Button>
            </div>

            {/* The same sentence the server would answer with, said before anything is
                spent. `teamRestrictionFailure` is shared, so these are one sentence. */}
            {wardFailure && <p className={styles.wardFailure}>{wardFailure}</p>}

            {multi.unlocked && !attempts && !batchRefusal && (
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
                {/* Said only when it costs something to not know. A borrow is one a day and
                    a batch is ten fights, so lending into one would be ten fights for one
                    borrow — the server takes no ally on `/battles/multi` and the picker
                    must not imply otherwise. */}
                {ally && (
                  <p className={styles.batchNote}>
                    A borrowed warden does not come on a batch — these runs are your {team.length}{' '}
                    alone.
                  </p>
                )}
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
          </>
        }
      />
    </Modal>
  );
}
