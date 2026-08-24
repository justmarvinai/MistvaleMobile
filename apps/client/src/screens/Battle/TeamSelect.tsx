import { useEffect, useMemo, useState } from 'react';
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
import { Portrait } from '../../ui/Portrait/Portrait';
import { championArt } from '../../ui/championArt';
import { ChampionCard } from '../../ui/ChampionCard/ChampionCard';
import { Opposition } from './Opposition';

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
}

const MAX_SLOTS = 4;

/**
 * How a ward reads on the door, using content's own names for a faction.
 *
 * The server has the same function against its cache (`spire/service.wardLabel`); this is
 * the client's half, and both defer to shared `restrictionLabel` so the phrasing is written
 * once. Elements, roles and rarities are capitalised rather than looked up, because there
 * is no `element` entity holding "Tide" and inventing one to hold four strings would be a
 * content type nobody edits.
 */
function wardPhrase(ward: TeamRestriction, factions: readonly FactionDef[] | undefined): string {
  if (ward.kind === 'faction') {
    const faction = factions?.find((candidate) => candidate.key === ward.value);
    return restrictionLabel(ward, faction?.name ?? ward.value);
  }
  return restrictionLabel(ward, ward.value.charAt(0).toUpperCase() + ward.value.slice(1));
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

  const rememberedTeam = useLoadoutStore((state) => state.teamFor);
  const rememberTeam = useLoadoutStore((state) => state.remember);

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

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

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

  const toggle = (id: string): void => {
    setEdits(
      team.includes(id)
        ? team.filter((entry) => entry !== id)
        : team.length >= MAX_SLOTS
          ? team
          : [...team, id],
    );
  };

  const start = async (mode: string): Promise<void> => {
    setError(null);
    try {
      await startBattle({ mode, stageKey: stage.key, team });
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

  return (
    // 720 rather than the default 480. The body asked for a 30rem minimum inside a 480px
    // panel, so the painted frame's own border and padding had nowhere to go and the
    // action rows drew straight through it — which is the "bugged window" the owner saw.
    <Modal open title={title ?? `Stage ${stage.number}`} onClose={onClose} size="wide">
      <div className={styles.body}>
        <p className={styles.summary}>
          {attempts
            ? `One wave · ${attempts.turnCap} turns · paid for the damage you do`
            : `${stage.waves.length} waves · ${stage.energyCost} energy · ${stage.rewards.silverMin}–${stage.rewards.silverMax} silver`}
        </p>

        {/* The ward, first and in words, because it decides which of the cards below are
            even worth reading. A player who scrolls a roster of thirty and then finds out
            four of them were never eligible has been made to do the work twice. */}
        {wardLabelText && (
          <p className={styles.ward}>
            <strong>Warded.</strong> Only {wardLabelText} may climb this floor.
          </p>
        )}

        {/* Who is on the other side, wave by wave. Content has named every enemy of every
            stage since P2 and the only screen that ever read them was the fight itself —
            by which point the energy is spent and the team is locked. */}
        <Opposition stage={stage} />

        {/* What the thing at the end *does* about being fought. Content has carried a
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
                {/* A face only when somebody is standing there. `Portrait` draws its own
                    stand-in for a missing image, which is right for an art-pending champion
                    and wrong for an empty slot — four hooded figures under "Leader — Slot 2
                    — Slot 3 —" reads as a team that has already been picked. */}
                {def ? (
                  <Portrait
                    src={championArt(def, bundle?.assets).portrait ?? null}
                    name={def.name}
                    size={40}
                  />
                ) : (
                  <span className={styles.slotEmpty} aria-hidden="true" />
                )}
                <span className={styles.slotRole}>
                  {index === 0 ? 'Leader' : `Slot ${index + 1}`}
                </span>
                <span className={styles.slotName}>{def?.name ?? '—'}</span>
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
          // The same painted card the roster draws, which is the point: a player choosing
          // who to send should be looking at exactly what they looked at when they decided
          // who was worth levelling. A name and a level in a row cannot say rarity,
          // affinity or power, and those are the three things the choice turns on.
          <div className={styles.roster}>
            {roster.map((owned) => (
              <div
                key={owned.id}
                className={meetsWard(owned.championKey) ? undefined : styles.barred}
                title={
                  meetsWard(owned.championKey)
                    ? undefined
                    : `The ward turns them back — only ${wardLabelText} may climb.`
                }
              >
                <ChampionCard
                  champion={owned}
                  def={championsByKey.get(owned.championKey)}
                  selectable
                  selected={team.includes(owned.id)}
                  // Dimmed rather than removed. A ward is a puzzle about a roster, and a
                  // roster with the wrong half hidden cannot be reasoned about — the answer
                  // to "who else could I bring" is usually somebody you had forgotten you
                  // had. Picking one is still allowed; starting with one is not.
                  onOpen={() => toggle(owned.id)}
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <span className={styles.cost}>
            {attempts
              ? `Costs one ${attempts.noun} — ${attempts.left} of ${attempts.perDay} left today`
              : affordable
                ? `Costs ${stage.energyCost} energy — you have ${energy}`
                : `Needs ${stage.energyCost} energy — you have ${energy}`}
          </span>
          <Button onClick={() => void start(stage.mode)} disabled={!canStart}>
            {busy ? 'Starting…' : 'Into the mist'}
          </Button>
        </div>

        {/* The same sentence the server would answer with, said before anything is spent.
            `teamRestrictionFailure` is shared, so these are one sentence rather than two. */}
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
