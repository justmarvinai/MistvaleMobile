import { and, desc, eq } from 'drizzle-orm';
import {
  advance,
  buildRules,
  buildStageWaves,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  contributions,
  createBattle,
  createRng,
  deriveStats,
  retreat as retreatBattle,
  type BattleAction,
  type UnitRef,
  type BattleEvent,
  type BattleState,
  type ChampionEntry,
  type ChampionScalingConfig,
  type UnitContribution,
} from '@mistvale/engine';
import {
  UNLOCK_LEVELS,
  boostedChampionXp,
  multiBattleResultSchema,
  xpBoostMultiplier,
  type ArenaResult,
  type BattleMode,
  canSkipBattle,
  allyRefusal,
  multiBattleRefusal,
  type ChampionDef,
  type EnemyDef,
  type GearInstance,
  type MultiBattleResult,
  type MultiBattleRun,
  type MultiBattleState,
  type MultiBattleStopReason,
  type StageDef,
  type TitanRun,
  type WorldBossStrike,
  type DeepRunOutcome,
  type SpireClimb,
} from '@mistvale/shared';
import { battleSessions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { countersFor, record, remaining } from '../../lib/daily-counters';
import { AppError } from '../../lib/errors';
import { computeEnergy } from '../../lib/progression';
import type { ContentCache } from '../../content/cache';
import * as hall from '../arena/hall';
import * as ladder from '../arena/ladder';
import { arenaConfigFrom } from '../arena/rating';
import * as depths from '../depths/service';
import * as titan from '../titan/service';
import * as worldboss from '../worldboss/service';
import * as deeprun from '../deeprun/service';
import * as spire from '../spire/service';
import * as gear from '../gear/service';
import { borrowedTeam, PresetTeamError, stageSeed } from './preset';
import * as mastery from '../mastery/service';
import * as meta from '../meta/progress';
import * as quests from '../meta/quests';
import * as progress from '../progress/service';
import * as chronicle from '../summon/service';
import * as rewards from '../rewards/service';
import * as roster from '../roster/service';
import { accountBonusFor, accountBonusesFor } from '../roster/account';
import { assertAvailable } from '../meta/expeditions';
import * as warband from '../warband/service';

/**
 * Battles, server-side.
 *
 * The engine decides what happens; this module decides what it costs, what it pays, and
 * how it survives a dropped connection. Three rules shape everything here:
 *
 *  - **The server is authoritative.** The client sends "use skill 2 on slot 1" and gets
 *    back events. It never sends a result.
 *  - **One battle at a time.** A unique partial index enforces it, so a second start
 *    cannot strand the energy the first one spent.
 *  - **Retries are safe.** Every action carries a client-generated `actionId`; replaying
 *    one returns the recorded state instead of taking another turn.
 */

export interface BattleContext {
  db: Database;
  content: ContentCache;
}

export interface StartOptions {
  playerId: string;
  mode: BattleMode;
  stageKey: string;
  /** `player_champions` ids, in formation order. The first is the leader (aura). */
  team: string[];
  /**
   * A warden to borrow a champion from — their player id, not a champion's (C37).
   *
   * Which champion is *their* choice: the standard-bearer they nominated. The borrower
   * does not pick, which is what makes the nomination mean something and keeps the request
   * to one id. The borrowed champion takes one of the four slots, so `team` plus this is
   * still one to four.
   */
  ally?: string | undefined;
  /** Client-generated. Replaying it returns the fight that was already opened. */
  actionId: string;
}

export interface BattleView {
  id: string;
  mode: string;
  stageKey: string;
  status: string;
  outcome: string | null;
  state: BattleState;
  events: BattleEvent[];
  rewards: RewardSummary | null;
  /**
   * Whether the player may jump this fight to its end (`canSkipBattle`).
   *
   * Decided when the fight opened and carried on the row, so it says the same thing on
   * every turn and after a reload — and so it cannot be flipped by the clear this very
   * battle is about to record.
   */
  canSkip: boolean;
  /**
   * What each of the player's champions did, once the fight is over.
   *
   * Folded out of the event log by the engine (`contributions`) rather than stored, which
   * is what keeps it honest: the log is the whole record of the fight and the row already
   * holds all of it, so a tally computed from anything else could only ever be a second
   * opinion. Empty while the battle is still running — the results screen is the only
   * thing that asks, and folding a growing log on every turn would be work nobody reads.
   *
   * The player's side only, which is the owner's rule: this is a report on the team you
   * brought, not a breakdown of the enemy's health bar.
   */
  contributions: UnitContribution[];
  /**
   * The `player_champions` ids that fought, in formation order.
   *
   * The engine works in slots and the client works in roster copies, and the results screen
   * is the first thing that needs both: slot *n* of `contributions` is `team[n]`, which is
   * what lets a champion's card carry the level and the star rank it finished the fight on
   * rather than only the name the log knows. It is also the team **Replay** sends, so a
   * repeat is the same four rather than whatever the picker last remembered.
   *
   * Empty for the modes that field champions the account does not own — the cold open and
   * every Trial fight a borrowed team.
   */
  team: string[];
  /**
   * The warden whose champion fought beside the party, and the slot they stood in (C37).
   *
   * Null on every fight nobody borrowed for, which is nearly all of them. The name is the
   * one the lender held **when the fight opened** rather than a join at read time: a rename
   * afterwards must not rewrite the record of who fought beside you, and a fight is read
   * on every turn where a join would not be free.
   */
  borrowedFrom: { slot: number; profileName: string } | null;
}

export interface RewardSummary {
  silver: number;
  playerXp: number;
  /** Champion XP actually paid, boost included — the figure the party really received. */
  championXp: number;
  /**
   * What the boost multiplied that by, or 1 when none was running.
   *
   * Reported rather than left to the client to work out from its own copy of the timer: a
   * fight settled a second after the boost expired paid the plain figure, and a results
   * screen reading a clock would claim otherwise. The server says what it paid.
   */
  xpBoost: number;
  stars: number;
  levelsGained: number;
  /** Relics the clear dropped, already owned by the player by the time this is read. */
  gear: GearInstance[];
  /** Stackables the clear dropped, by item key. */
  items: Record<string, number>;
  /** True the first time this stage has ever been beaten. */
  firstClear: boolean;
  /** Paid on top of the stage payout: the first-clear bonus and any star chest. */
  bonus: Record<string, number>;
  /** Chapter star-chest tiers this clear crossed. */
  chestTiers: number[];
  /**
   * True when this run was the first to solve a trial inside its par (C10d).
   *
   * Its own flag rather than something read out of `bonus`, because the results screen has
   * a different thing to say about it — "you beat par" is the sentence the whole mode
   * exists for, and a par with no rewards behind it would otherwise be silent.
   */
  beatPar: boolean;
  /**
   * What a Titan run was worth: the damage, the rung it reached, and whether it beat the
   * account's own record. Null for every other mode — a Titan is the only fight in the
   * game paid for how far it got rather than for whether it was won.
   */
  titan: TitanRun | null;
  /**
   * What a strike against a world boss did: its damage, this account's running total for
   * the wake, and where the shared pool now stands. Null for every other mode.
   *
   * Nothing here is a payout. A wake's ladder is claimed on its own screen, because a rung
   * is about the week rather than about this fight — which is exactly what separates a
   * world boss from the Titan it looks like.
   */
  worldBoss: WorldBossStrike | null;
  /**
   * What a finished descent was worth: how deep it got, whether it reached the bottom, and
   * the rung that paid. Null for every other mode, and null on the floors of a run that is
   * still going — a descent pays once, at the end.
   */
  deepRun: DeepRunOutcome | null;
  /**
   * What clearing a floor of the Mistspire did to the climb: how high it now stands, the
   * key it cost, and any landings it brought into reach. Null for every other mode, and
   * null on a *lost* floor — a defeat costs nothing, which is the tower's own rule.
   *
   * The landings are named rather than paid. They are collected on the tower's own screen,
   * because a floor's rewards already land in the results modal and a second bag of loot
   * inside the same modal reads as a bug.
   */
  spire: SpireClimb | null;
  /**
   * The day's first victory in this mode, paid automatically. Empty once it has been
   * earned today, or in a mode the config pays nothing for.
   */
  firstWin: Record<string, number>;
  /**
   * What an Arena fight moved, on both ratings. Null for every other mode — and present
   * on an arena *loss* too, because losing is a result the ladder records rather than the
   * absence of one.
   */
  arena: ArenaResult | null;
  /**
   * Relics the vault had no room for, and the silver paid instead (Q5).
   *
   * Zeroed on every payout that did not overflow, which is nearly all of them. Present so
   * the results screen can say what happened rather than a player quietly wondering where
   * a drop went.
   */
  vaultOverflow: gear.VaultOverflow;
  /**
   * How many turns the fight took — the same figure filed as the stage's record.
   *
   * Sent rather than counted off the state the client already holds, so the pair on the
   * results screen ("12 turns · best 9") comes from one place. Zero on a fight that
   * records nothing.
   */
  turns: number;
  /**
   * The record before this run, or null when this was the first clear or the stage keeps
   * none.
   *
   * "Before" is load-bearing: `recordClear` folds this run's count into `bestTurns` as it
   * files it, so a best read afterwards would say 9 and 9 on the very run that set it,
   * and the screen could never say a record had been broken.
   */
  previousBest: number | null;
}

/** The payout of a fight that pays nothing but is still a result. */
const NO_REWARDS: RewardSummary = {
  silver: 0,
  playerXp: 0,
  championXp: 0,
  xpBoost: 1,
  stars: 0,
  levelsGained: 0,
  gear: [],
  items: {},
  firstClear: false,
  bonus: {},
  chestTiers: [],
  beatPar: false,
  firstWin: {},
  arena: null,
  titan: null,
  worldBoss: null,
  deepRun: null,
  spire: null,
  vaultOverflow: gear.NO_OVERFLOW,
  turns: 0,
  previousBest: null,
};

const MAX_TEAM = 4;

function contentMaps(content: ContentCache): {
  champions: Map<string, ChampionDef>;
  enemies: Map<string, EnemyDef>;
  stages: Map<string, StageDef>;
} {
  const bundle = content.current().bundle;
  return {
    champions: new Map(bundle.champions.map((champion) => [champion.key, champion])),
    enemies: new Map(bundle.enemies.map((enemy) => [enemy.key, enemy])),
    stages: new Map(bundle.stages.map((stage) => [stage.key, stage])),
  };
}

function engineRules(content: ContentCache, mode: BattleMode) {
  const bundle = content.current().bundle;
  return buildRules(mode, bundle.skills, bundle.statuses);
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The engine config a fight runs on, with a Titan's own turn cap applied.
 *
 * `combat.maxTurns` is a runaway guard at 300; a Titan's cap is the *length of the puzzle*
 * and belongs to the keep. It is applied as an override on the config rather than as a new
 * rule, because a cap is a number the engine already reads. Every path that advances a
 * fight goes through this, since a cap honoured only when the fight opened is no cap.
 */
function titanConfigFor(
  ctx: BattleContext,
  config: ReturnType<typeof combatConfigFrom>,
  mode: string,
  stageKey: string,
): ReturnType<typeof combatConfigFrom> {
  if (mode !== 'titan' && mode !== 'worldBoss') return config;
  const stage = contentMaps(ctx.content).stages.get(stageKey);
  if (!stage) return config;
  // Two modes, one rule: a fight against something authored to outlast you ends on its own
  // cap rather than on the engine's runaway guard. The world boss borrows it wholesale,
  // because a strike against a shared pool is a Titan run with the pool moved off the
  // account.
  const cap =
    mode === 'titan'
      ? titan.keepForStage(ctx.content, stage)?.rules.turnCap
      : worldboss.keepForStage(ctx.content, stage)?.rules.turnCap;
  return cap ? { ...config, maxTurns: cap } : config;
}

function assertTeamShape(team: readonly string[], borrowedSlots = 0): void {
  if (team.length === 0 || team.length + borrowedSlots > MAX_TEAM) {
    throw new AppError(
      'VALIDATION',
      borrowedSlots > 0
        ? `A team is one to ${MAX_TEAM} champions, and a borrowed warden takes one of them.`
        : `A team is one to ${MAX_TEAM} champions.`,
    );
  }
  if (new Set(team).size !== team.length) {
    throw new AppError('VALIDATION', 'A champion cannot take two slots.');
  }
}

/**
 * Refuses a stage the player has not earned.
 *
 * Two gates, asked in the order a player would want them answered: the Depths' own — an
 * account level, a rotation day — and then the stage's unlock chain. The campaign map and
 * the Depths hub grey stages out with the same rules, so this never contradicts what the
 * player was looking at when they pressed the button.
 */
async function assertStageOpen(
  tx: Tx,
  ctx: BattleContext,
  player: { id: string; createdAt: Date; level: number },
  stage: StageDef,
  stages: ReadonlyMap<string, StageDef>,
): Promise<void> {
  const snapshot = ctx.content.current();
  const cleared = await progress.standings(tx, player.id);
  const chapters = new Map(
    snapshot.bundle.campaignChapters.map((entry) => [entry.key, entry.number]),
  );

  // The Depths' own gates ride along here, so a spring that is shut on a Tuesday refuses
  // the fight rather than merely hiding it.
  const context = depths.contextFor(player, snapshot.bundle.config, new Date());
  const gates = depths.gates(snapshot.bundle.dungeons, player.level, context.rotation);

  const check = progress.checkUnlock(
    stage,
    player.level,
    (stageKey) => cleared.get(stageKey)?.cleared === true,
    (stageKey) =>
      progress.stageLabel(
        stages.get(stageKey),
        chapters.get(stages.get(stageKey)?.parentKey ?? ''),
      ),
    (parentKey) => gates.get(parentKey) ?? null,
  );
  if (!check.open) throw new AppError('LOCKED_CONTENT', check.reason ?? 'That stage is shut.');
}

/**
 * Turns owned champions into the entries the engine fights with.
 *
 * Relics and masteries are resolved into flat stat bonuses here rather than inside the
 * engine: the engine takes numbers, and everything about what a percentage resolves
 * against is a server concern (docs/COMBAT_SYSTEM.md §1). This is why the number on the
 * champion screen is the number that fights.
 */
export async function assembleEntries(
  tx: Tx,
  ctx: BattleContext,
  owned: readonly roster.RosterEntry[],
  champions: ReadonlyMap<string, ChampionDef>,
  scaling: ReturnType<typeof championScalingFrom>,
  /**
   * Whose Hall of Valor applies.
   *
   * Required rather than inferred: in the Arena both sides are assembled in the same
   * call, and each carries its own Hall. Guessing from the champions would give the
   * attacker's bonuses to the defender's team.
   */
  hallOwnerId: string,
  /**
   * Leaves the relics behind.
   *
   * The Deep Run's one rule: four champions go down at their own levels and ranks with
   * nothing they were wearing. Everything else about them still counts — masteries, the
   * Hall, imprint and standing — because "no relics" is the rule that was asked for and
   * stripping the rest would make it a Trial with your own champions.
   */
  options: { withoutGear?: boolean } = {},
): Promise<ChampionEntry[]> {
  const snapshot = ctx.content.current();
  const equipped = options.withoutGear
    ? new Map<string, never[]>()
    : await gear.gearByChampion(
        tx,
        owned.map((member) => member.id),
      );
  const gearContext = gear.gearContextFrom(snapshot.bundle);
  const masteryNodes = mastery.nodesFrom(ctx.content);

  // The Hall is account-wide and unconditional, so it lands on the stats side of the
  // split with relics rather than riding into the engine as an effect.
  const arenaConfig = arenaConfigFrom(snapshot.bundle.config);
  const hallLevels = await hall.levelsFor(tx, hallOwnerId);

  // Imprint and standing belong to the same account the Hall does, and answer the same
  // question — what this *collection* is worth to the four champions it sent. Read once
  // for the team rather than once per member.
  const accountBonuses = await accountBonusesFor(tx, ctx.content, hallOwnerId);

  return owned.map((member) => {
    const def = champions.get(member.championKey);
    if (!def) {
      throw new AppError(
        'CONTENT_STALE',
        `Champion "${member.championKey}" is no longer published.`,
      );
    }
    const base = deriveStats(def.baseStats, member, scaling);

    // Masteries split the same way relics do not: what is unconditional becomes stats
    // here, and what needs a fight to decide rides in as effects the engine evaluates.
    const learned = mastery.resolveMasteries(member.masteries ?? [], masteryNodes);
    const masteryStats = mastery.applyMasteryStats(base, learned);
    const assembled = gear.assembleChampion(
      base,
      equipped.get(member.id) ?? [],
      gearContext,
      { flat: masteryStats, setBonusAmplifyPct: learned.setBonusAmplifyPct },
      accountBonusFor(accountBonuses, member.championKey, def.rarity),
    );

    const bonuses = { ...assembled.gear };
    for (const [stat, value] of Object.entries(masteryStats) as [keyof typeof bonuses, number][]) {
      bonuses[stat] = (bonuses[stat] ?? 0) + value;
    }
    // The engine fights with `bonuses`, so the collection's contribution has to be folded
    // in here as well — a champion whose sheet says 22,000 HP and whose fight starts at
    // 20,000 is the exact disagreement the account column exists to make visible.
    for (const [stat, value] of Object.entries(assembled.account) as [
      keyof typeof bonuses,
      number,
    ][]) {
      if (value !== 0) bonuses[stat] = (bonuses[stat] ?? 0) + value;
    }
    for (const [stat, value] of Object.entries(
      hall.bonusFor(hallLevels, def.element, base, arenaConfig),
    ) as [keyof typeof bonuses, number][]) {
      bonuses[stat] = (bonuses[stat] ?? 0) + value;
    }

    return {
      def,
      level: member.level,
      rank: member.rank,
      ascension: member.ascension,
      bonuses,
      masteries: learned.battleEffects,
    };
  });
}

/**
 * A Deep Run room, shaped as the stage the battle machinery expects.
 *
 * A room *is* a stage in every sense the engine cares about — waves, a cost, star rules — it
 * simply is not authored as one, because it lives in a pool the descent draws from rather
 * than on a map anybody walks. Synthesising one here is what lets a descent's fights reuse
 * `start`, `act`, playback, Auto, the speed ladder and resume-after-reload without a second
 * implementation of any of them, and it is why `battle_sessions.stage_key` still names
 * something real: the room.
 *
 * It pays nothing and records no clear. What a descent is worth is the depth it reached,
 * paid once when the run ends.
 */
function roomAsStage(ctx: BattleContext, roomKey: string): StageDef | undefined {
  for (const def of ctx.content.current().bundle.deepRuns) {
    const room = def.rooms.find((entry) => entry.key === roomKey);
    if (!room) continue;
    return {
      key: room.key,
      sortOrder: 0,
      mode: 'deepRun',
      parentKey: def.key,
      number: 1,
      difficulty: 'normal',
      energyCost: 0,
      waves: room.waves,
      rewards: {
        silverMin: 0,
        silverMax: 0,
        playerXp: 0,
        championXp: 0,
        drops: {
          gearChance: 0,
          gearRankMin: 1,
          gearRankMax: 1,
          gearRarityWeights: {},
          gearSlots: [],
          gearSetKeys: [],
          items: [],
        },
      },
      // Stars mean nothing here — a descent is scored on depth — so they are set where they
      // cannot be earned rather than left to imply a hard-won floor went badly.
      starRules: { noDeaths: true, maxTurns: 1 },
      firstClearRewards: {},
      unlock: {},
      presetTeam: [],
    };
  }
  return undefined;
}

/**
 * Starts a battle.
 *
 * Spends energy and creates the session in one transaction, so a crash between the two
 * cannot bill a player for a fight that does not exist.
 */
export async function start(ctx: BattleContext, options: StartOptions): Promise<BattleView> {
  const { champions, enemies, stages } = contentMaps(ctx.content);

  const stage =
    options.mode === 'deepRun' ? roomAsStage(ctx, options.stageKey) : stages.get(options.stageKey);
  if (!stage) throw AppError.notFound(`No stage "${options.stageKey}".`);
  // Practice is a *lens* on a stage rather than a kind of stage: it re-fights a campaign
  // stage or a dungeon floor at no cost for no reward, so it is the one mode that does not
  // have to match the stage's own. Every other mode must.
  if (options.mode !== 'practice' && stage.mode !== options.mode) {
    throw new AppError('VALIDATION', `Stage "${options.stageKey}" is not a ${options.mode} stage.`);
  }

  // Two kinds of fight where the player brings nobody, for opposite reasons. The cold open
  // borrows because it happens before the account owns a champion at all; a **trial**
  // borrows because everybody should get the *same* four champions against the same enemy,
  // so what is measured is the play rather than the account. Either way the stage carries
  // the team, and anything the client sends is ignored rather than refused — there is
  // nothing it could usefully say.
  const borrowed = stage.mode === 'tutorial' || stage.mode === 'trial';
  if (borrowed) {
    if (stage.presetTeam.length === 0) {
      throw new AppError('CONTENT_STALE', `Stage "${options.stageKey}" has nobody to fight with.`);
    }
  } else {
    // The ally occupies a slot rather than adding a fifth: every boss in the game is tuned
    // against four and the formation is drawn for four (C28).
    assertTeamShape(options.team, options.ally ? 1 : 0);
  }

  // Where a borrowed champion is welcome is a design decision, and it is written once in
  // `allyRefusal` so the team chooser greys out exactly what this refuses.
  if (options.ally) {
    const refusal = allyRefusal(options.mode);
    if (refusal) throw new AppError('VALIDATION', refusal);
  }

  const snapshot = ctx.content.current();
  const config = combatConfigFrom(snapshot.bundle.config);
  const scaling = championScalingFrom(snapshot.bundle.config);

  return ctx.db.transaction(async (tx) => {
    // Lock the player row: energy, the active-battle check and the insert all have to
    // agree, and two taps on a flaky connection must not both get through.
    const [player] = await tx
      .select()
      .from(players)
      .where(eq(players.id, options.playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const [existing] = await tx
      .select()
      .from(battleSessions)
      .where(
        and(eq(battleSessions.playerId, options.playerId), eq(battleSessions.status, 'active')),
      );
    if (existing) {
      // Unless it is the fight this very request opened. A retry on a dropped connection
      // used to be told it was already in a battle — about a fight it could not see and
      // had to retreat out of, having spent the energy for it.
      if (existing.lastActionId === options.actionId) return toView(existing);
      // Otherwise a conflict, not a cooldown: the fix is to finish the fight, not to wait.
      throw new AppError('ALREADY_EXISTS', 'You are already in a battle. Finish or retreat first.');
    }

    // The unlock chain has been authored in content since P1; this is where it finally
    // binds. Checked against the same rule the campaign map greys stages out with, so a
    // player is never shown an open door the server will slam.
    if (options.mode === 'tutorial') {
      // Nothing to gate: it is the first thing that happens, and the tutorial's own
      // position is what decides whether it is offered at all. A **trial** borrows its team
      // the same way and is gated all the same — it is ordinary published content with an
      // unlock chain, and the screen greys out exactly what this refuses.
    } else if (options.mode !== 'practice') {
      await assertStageOpen(tx, ctx, player, stage, stages);
    } else if (!(await progress.hasCleared(tx, options.playerId, stage.key))) {
      // The sandbox is for *re*-fighting: free entry to a stage nobody has beaten would be
      // a way to scout every boss in the game at no cost (GAME_DESIGN §15.7).
      throw new AppError('LOCKED_CONTENT', 'You can only practise a stage you have cleared.');
    }

    // Whether this fight can be jumped to its end, settled now rather than at the end.
    // It has to be *now*: the answer is about a clear that already existed when the fight
    // opened, and the fight itself may be the one that records the first (owner's rule,
    // 2026-08-22). Practice has already proved a clear above; arena needs no lookup at all.
    const canSkip = canSkipBattle(
      options.mode,
      options.mode === 'practice' ||
        (options.mode !== 'arena' &&
          !borrowed &&
          (await progress.hasCleared(tx, options.playerId, stage.key))),
    );

    // A champion on an expedition cannot be sent into a fight — that unavailability is the
    // whole reason expeditions cost anything (C10c). Checked before the energy is spent, so
    // a refusal never bills for a battle that did not start.
    if (!borrowed) await assertAvailable(tx, options.playerId, options.team);
    const owned = borrowed ? [] : await roster.findOwned(tx, options.playerId, options.team);
    if (!borrowed && owned.length !== options.team.length) {
      throw new AppError('VALIDATION', 'That team includes a champion you do not own.');
    }

    const entries = borrowed
      ? borrowedTeamFor(ctx, stage, champions, scaling)
      : await assembleEntries(tx, ctx, owned, champions, scaling, options.playerId, {
          // The Deep Run's one rule, applied at the only place it can be: the assembly.
          withoutGear: options.mode === 'deepRun',
        });

    // The borrowed warden, resolved and charged for **before** any energy is spent, so a
    // refusal never bills for a fight that did not start. Assembled from the *lender's*
    // side of everything — their relics, masteries, Hall and collection — because a
    // champion that fought at the borrower's power would not be the one that was offered.
    let ally: warband.BorrowedAlly | null = null;
    if (options.ally) {
      ally = await warband.borrow(
        tx,
        { db: ctx.db, content: ctx.content },
        {
          playerId: options.playerId,
          dailyCounters: player.dailyCounters,
          dailyCountersDay: player.dailyCountersDay,
        },
        options.ally,
        new Date(),
      );
      const lent = await roster.findOwned(tx, ally.wardenId, [ally.championId]);
      if (lent.length !== 1) {
        throw new AppError('CONTENT_STALE', `${ally.profileName} no longer holds that champion.`);
      }
      const assembled = await assembleEntries(tx, ctx, lent, champions, scaling, ally.wardenId, {});
      entries.push(...assembled);
    }

    // A descent's fight is the ordinary one with two things folded in that only exist
    // inside a run: the boons taken so far, and the health the party is carrying. Both are
    // read from the run rather than sent by the client, because both are state the server
    // owns — and the boons reach the engine as stat bonuses and mastery effects, the
    // vocabulary it already speaks, so it needs to know nothing about descents.
    if (options.mode === 'deepRun') {
      await deeprun.dressForTheDescent(tx, ctx.content, options.playerId, stage.parentKey, entries);
    }

    // Energy: derived from the clock, so an idle account costs nothing to keep current.
    const now = new Date();
    const energy = computeEnergy({
      storedValue: player.energy,
      updatedAt: player.energyUpdatedAt,
      level: player.level,
      now,
    });
    // A Titan is paid for in keys rather than energy: the resource the mode limits is
    // *attempts*, because the whole point is a wall you cannot brute-force by farming.
    // Refused and spent here, under the player-row lock this transaction already holds,
    // so two taps on a flaky connection cannot spend one key twice.
    const keep = titan.keepForStage(ctx.content, stage);
    if (options.mode === 'titan') {
      if (!keep) {
        throw new AppError('CONTENT_STALE', `Stage "${stage.key}" has no Titan behind it.`);
      }
      await titan.spendKey(
        tx,
        ctx.content,
        {
          playerId: options.playerId,
          level: player.level,
          dailyCounters: player.dailyCounters,
          dailyCountersDay: player.dailyCountersDay,
        },
        keep,
        now,
      );
    }

    // The Mistspire refuses three things and spends nothing: a tower the account has not
    // reached, a floor that is not the next one up, and a day with no keys left. The key
    // itself comes off on the **clear** (`settleSpire`), because a warded floor is a puzzle
    // and a puzzle you are charged to attempt is one people look the answer up for.
    if (options.mode === 'spire') {
      const tower = spire.keepForStage(ctx.content, stage);
      if (!tower) {
        throw new AppError('CONTENT_STALE', `Stage "${stage.key}" has no tower behind it.`);
      }
      await spire.assertFloorOpen(
        tx,
        ctx.content,
        {
          playerId: options.playerId,
          level: player.level,
          dailyCounters: player.dailyCounters,
          dailyCountersDay: player.dailyCountersDay,
        },
        tower,
        stage,
        now,
      );
      // The ward, checked against the champions actually being fielded. Last of the three,
      // because "you have no keys" and "that floor is not next" are true whoever is on the
      // team, and being told to fix the team first would be advice about the wrong thing.
      spire.assertTeamMeetsWard(
        ctx.content,
        stage,
        owned.map((entry) => {
          const def = champions.get(entry.championKey);
          return {
            key: entry.championKey,
            name: def?.name ?? entry.championKey,
            factionKey: def?.factionKey ?? '',
            element: def?.element ?? '',
            role: def?.role ?? '',
            rarity: def?.rarity ?? 'common',
          };
        }),
      );
    }

    // A world boss is the same bargain with the pool moved off the account: strikes a day
    // rather than energy, spent when the fight opens. It also refuses a wake that is asleep
    // or already felled — checked here rather than at the end, so nobody spends an evening
    // on a boss that fell while they were choosing a team.
    if (options.mode === 'worldBoss') {
      const wake = worldboss.keepForStage(ctx.content, stage);
      if (!wake) {
        throw new AppError('CONTENT_STALE', `Stage "${stage.key}" has no world boss behind it.`);
      }
      await worldboss.spendStrike(
        tx,
        ctx.content,
        {
          playerId: options.playerId,
          level: player.level,
          dailyCounters: player.dailyCounters,
          dailyCountersDay: player.dailyCountersDay,
        },
        wake,
        now,
      );
    }

    // Practice re-fights are free by design (GAME_DESIGN §15 — the sandbox), and so is the
    // cold open — a fight before the account has spent anything cannot cost energy it has
    // not been shown yet.
    const cost =
      options.mode === 'practice' ||
      options.mode === 'titan' ||
      options.mode === 'worldBoss' ||
      borrowed
        ? 0
        : stage.energyCost;
    if (energy.value < cost) {
      throw new AppError('ENERGY_LOW', 'Not enough energy for that stage.');
    }

    await tx
      .update(players)
      .set({
        energy: energy.value - cost,
        // Stamping "now" restarts the regeneration clock from the spend, which is what
        // makes energy derivable from the row rather than needing a ticking job.
        energyUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(players.id, options.playerId));

    // A seed drawn from the process CSPRNG, not the battle's own stream: a player must
    // not be able to predict a fight from a previous one's replay.
    //
    // A **trial** is the one exception, and deliberately so: its seed is the stage key, so
    // every attempt by every account opens the *same fight* — the same crits, the same
    // resists, the same order of play. That is what turns a par into a measure of play
    // rather than of luck, and it is why re-rolling a trial by holding Auto until the dice
    // fall well is not a strategy: there are no dice left to fall.
    const seed = options.mode === 'trial' ? stageSeed(stage.key) : randomSeed();
    const rules = engineRules(ctx.content, options.mode);
    const battleConfig = titanConfigFor(ctx, config, options.mode, stage.key);
    const opened = createBattle(
      {
        seed,
        mode: options.mode,
        allies: buildTeam(entries, scaling, options.mode),
        waves: buildStageWaves(stage, enemies, scaling),
      },
      rules,
      battleConfig,
    );

    // …and then run it to the first decision the player actually has to make.
    //
    // `createBattle` builds the board and emits `battleStart`, and that is all: no turn
    // meter has moved and `awaiting` is null. A battle handed over in that state is one
    // the client cannot drive — the skill bar is keyed on `awaiting` naming an ally, so
    // there was nobody to act with and the bar read "Waiting for the server…" until the
    // player pressed Auto or Retreat. **Manual play has never worked**, since P3; every
    // test that touched a fight either pressed Auto, pressed Skip, or posted an action
    // straight to the API, where a supplied action is applied to whoever acts first and
    // `awaiting` is never consulted.
    //
    // `auto: false` stops the moment an ally is ready to choose, so what the player gets
    // is the opening as it happened: meters filling, any enemy faster than the whole team
    // acting first, and then the bar.
    const first = advance(opened.state, rules, battleConfig, { auto: false });
    const openingState = first.state;
    const openingEvents = [...opened.events, ...first.events];

    // Everything that took the field counts as met, which is what makes the Chronicle a
    // record of the world rather than a list of receipts (GAME_DESIGN §10).
    await chronicle.see(tx, options.playerId, [
      ...entries.map((entry) => entry.def.key),
      ...stage.waves.flatMap((wave) => wave.map((unit) => unit.enemyKey)),
    ]);

    const [row] = await tx
      .insert(battleSessions)
      .values({
        playerId: options.playerId,
        mode: options.mode,
        stageKey: options.stageKey,
        contentRev: snapshot.rev,
        teamIds: owned.map((member) => member.id),
        // Only the account's own copies are in `teamIds`, so a borrowed warden is recorded
        // beside it rather than in it: the ids in that list are what the payout pays and a
        // champion somebody else owns must never be one of them.
        ...(ally ? { borrowedFrom: ally.profileName } : {}),
        seed,
        state: openingState,
        events: openingEvents,
        energySpent: cost,
        // The id of the request that opened it, so a retry of *this* request finds the
        // fight rather than an error. Each turn then overwrites it with its own, which is
        // right: by the time an action has been taken, a replayed start is not a retry.
        lastActionId: options.actionId,
        canSkip,
        status: openingState.finished ? 'finished' : 'active',
        outcome: openingState.outcome,
        ...(openingState.finished ? { finishedAt: now } : {}),
      })
      .returning();
    if (!row) throw new AppError('INTERNAL', 'Could not start that battle.');

    // Vanishingly rare and guarded rather than assumed away: the opening runs enemy turns,
    // and a team that loses every champion before one of them is ready to act has already
    // lost. Settled here rather than left `active` with `finished` state, which is a fight
    // the player could neither act in nor be paid for.
    const summary = openingState.finished
      ? await settleFinished(
          tx,
          ctx,
          { ...row, teamIds: (row.teamIds as string[]) ?? [] },
          openingState,
          openingEvents,
          options.playerId,
        )
      : null;
    if (summary) {
      await tx
        .update(battleSessions)
        .set({ rewards: summary, updatedAt: now })
        .where(eq(battleSessions.id, row.id));
    }

    return {
      id: row.id,
      mode: options.mode,
      stageKey: options.stageKey,
      status: openingState.finished ? 'finished' : 'active',
      outcome: openingState.outcome,
      state: openingState,
      events: openingEvents,
      rewards: summary,
      canSkip,
      contributions: contributionTable(
        openingState.finished ? 'finished' : 'active',
        openingEvents,
      ),
      team: (row.teamIds as string[]) ?? [],
      borrowedFrom: borrowedFromOf(row),
    };
  });
}

/**
 * `borrowedTeam`, with the content cache read for it and its one failure mapped.
 *
 * The maths lives in `./preset` so `pnpm sim` can fight the cold open headlessly with the
 * exact team this builds; all that belongs here is where the tables come from and what a
 * deleted champion means to an HTTP caller.
 */
function borrowedTeamFor(
  ctx: BattleContext,
  stage: StageDef,
  champions: ReadonlyMap<string, ChampionDef>,
  scaling: ChampionScalingConfig,
): ChampionEntry[] {
  try {
    return borrowedTeam(
      stage,
      champions,
      scaling,
      gear.gearContextFrom(ctx.content.current().bundle),
    );
  } catch (cause) {
    if (cause instanceof PresetTeamError) throw new AppError('CONTENT_STALE', cause.message);
    throw cause;
  }
}

/** The battle a player is currently in, if any. */
export async function active(ctx: BattleContext, playerId: string): Promise<BattleView | null> {
  const [row] = await ctx.db
    .select()
    .from(battleSessions)
    .where(and(eq(battleSessions.playerId, playerId), eq(battleSessions.status, 'active')))
    .orderBy(desc(battleSessions.createdAt))
    .limit(1);
  return row ? toView(row) : null;
}

export async function findById(
  ctx: BattleContext,
  playerId: string,
  battleId: string,
): Promise<BattleView> {
  const [row] = await ctx.db
    .select()
    .from(battleSessions)
    .where(and(eq(battleSessions.id, battleId), eq(battleSessions.playerId, playerId)));
  if (!row) throw AppError.notFound('No such battle.');
  return toView(row);
}

export interface StepOptions {
  playerId: string;
  battleId: string;
  /** Client-generated; replaying one returns the recorded state rather than acting twice. */
  actionId: string;
  /** Absent means "let the AI take this turn". */
  action?: BattleAction;
  /** Play the fight without stopping for input. */
  auto?: boolean;
  /** How many player turns auto may take before pausing again; omitted means all of them. */
  autoTurns?: number;
  /** The enemy auto-battle should concentrate on, where the skill leaves a choice. */
  focus?: UnitRef;
}

/**
 * Takes a turn, or runs the fight to its end on auto.
 *
 * The whole step — engine advance, session write, rewards on victory — is one
 * transaction, so a battle can never resolve without paying out or pay out twice.
 */
export async function step(ctx: BattleContext, options: StepOptions): Promise<BattleView> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(battleSessions)
      .where(
        and(eq(battleSessions.id, options.battleId), eq(battleSessions.playerId, options.playerId)),
      )
      .for('update');
    if (!row) throw AppError.notFound('No such battle.');

    // A retried request is not a second turn.
    if (row.lastActionId === options.actionId) return toView(row);
    if (row.status !== 'active') {
      throw new AppError('VALIDATION', 'That battle is already over.');
    }

    const snapshot = ctx.content.current();
    const config = combatConfigFrom(snapshot.bundle.config);
    const rules = engineRules(ctx.content, row.mode as BattleMode);
    // Every turn of a Titan run has to be advanced against the *Titan's* cap, not the
    // global runaway guard — a cap applied only when the fight opened would let the run go
    // on to 300 turns from the second step onward, which is the mode with its point
    // removed.
    const battleConfig = titanConfigFor(ctx, config, row.mode, row.stageKey);

    const state = row.state as BattleState;
    const result = advance(state, rules, battleConfig, {
      auto: options.auto ?? false,
      ...(options.autoTurns === undefined ? {} : { autoTurns: options.autoTurns }),
      ...(options.focus ? { focus: options.focus } : {}),
      ...(options.action ? { action: options.action } : {}),
    });

    const events = [...(row.events as BattleEvent[]), ...result.events];
    const finished = result.state.finished;

    let summary: RewardSummary | null = (row.rewards as RewardSummary | null) ?? null;
    if (finished) {
      summary = await settleFinished(
        tx,
        ctx,
        { ...row, teamIds: (row.teamIds as string[]) ?? [] },
        result.state,
        events,
        options.playerId,
      );
    }

    await tx
      .update(battleSessions)
      .set({
        state: result.state,
        events,
        status: finished ? 'finished' : 'active',
        outcome: result.state.outcome,
        lastActionId: options.actionId,
        rewards: summary,
        updatedAt: new Date(),
        ...(finished ? { finishedAt: new Date() } : {}),
      })
      .where(eq(battleSessions.id, row.id));

    return {
      id: row.id,
      mode: row.mode,
      stageKey: row.stageKey,
      status: finished ? 'finished' : 'active',
      outcome: result.state.outcome,
      state: result.state,
      events,
      rewards: summary,
      canSkip: row.canSkip,
      contributions: contributionTable(finished ? 'finished' : 'active', events),
      team: (row.teamIds as string[]) ?? [],
      borrowedFrom: borrowedFromOf(row),
    };
  });
}

/** Ends a battle early. The energy stays spent — that is what makes retreating a decision. */
export async function retreat(
  ctx: BattleContext,
  playerId: string,
  battleId: string,
): Promise<BattleView> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(battleSessions)
      .where(and(eq(battleSessions.id, battleId), eq(battleSessions.playerId, playerId)))
      .for('update');
    if (!row) throw AppError.notFound('No such battle.');
    if (row.status !== 'active') return toView(row);

    const snapshot = ctx.content.current();
    const config = combatConfigFrom(snapshot.bundle.config);
    const rules = engineRules(ctx.content, row.mode as BattleMode);

    const result = retreatBattle(
      row.state as BattleState,
      rules,
      titanConfigFor(ctx, config, row.mode, row.stageKey),
    );
    const events = [...(row.events as BattleEvent[]), ...result.events];

    // Walking out of an arena fight is a loss, not an escape from one. The token is gone
    // either way, so a costless retreat would only mean a player could abandon every fight
    // that started badly — which would make losing rating opt-in and the ladder a fiction.
    // Walking out of a Titan run is not an escape either — the key is spent — but unlike
    // the Arena there is nothing to be spared by it: damage only ever accumulates, so
    // stopping early can only lower the score. So a retreat is settled and *paid* for what
    // it managed, which is the honest reading of "how far did you get" and means a
    // mis-click does not cost a whole attempt.
    const summary =
      row.mode === 'arena'
        ? await settleArena(tx, ctx, row, 'retreat', playerId)
        : row.mode === 'titan'
          ? await settleTitan(tx, ctx, row, events, playerId)
          : row.mode === 'worldBoss'
            ? await settleWorldBoss(tx, ctx, row, events, playerId)
            : null;

    await tx
      .update(battleSessions)
      .set({
        state: result.state,
        events,
        status: 'finished',
        outcome: 'retreat',
        rewards: summary,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(battleSessions.id, row.id));

    return {
      id: row.id,
      mode: row.mode,
      stageKey: row.stageKey,
      status: 'finished',
      outcome: 'retreat',
      state: result.state,
      events,
      rewards: summary,
      canSkip: row.canSkip,
      contributions: contributionTable('finished', events),
      team: (row.teamIds as string[]) ?? [],
      borrowedFrom: borrowedFromOf(row),
    };
  });
}

// ── Multi-battle ────────────────────────────────────────────────────────────

/** The counter name a batch spends from. Shares `players.daily_counters` with the rest. */
const MULTI_COUNTER = 'multiBattle';

export interface MultiOptions {
  playerId: string;
  mode: BattleMode;
  stageKey: string;
  team: string[];
  /** How many times to fight it. Trimmed by the allowance, by energy, and by the per-call cap. */
  runs: number;
  actionId: string;
}

export interface MultiLimits {
  unlockLevel: number;
  dailyCap: number;
  maxPerCall: number;
}

/** The three numbers that bound a batch, all operator-editable (`game_config`). */
export function multiLimitsFrom(config: Readonly<Record<string, unknown>>): MultiLimits {
  return {
    unlockLevel: intConfig(config, 'unlocks.multiBattleLevel', UNLOCK_LEVELS.multiBattle),
    dailyCap: intConfig(config, 'economy.multiBattleDailyCap', 30),
    maxPerCall: intConfig(config, 'economy.multiBattleMaxPerCall', 10),
  };
}

/**
 * What the team-select screen needs to draw the multi-battle control.
 *
 * Computed server-side like every other gate, so the button the client shows and the
 * batch the server will accept are the same rule read twice rather than two rules.
 */
export function multiState(
  content: ContentCache,
  player: {
    level: number;
    dailyCounters: Record<string, number>;
    dailyCountersDay: string | null;
  },
  now: Date,
): MultiBattleState {
  const config = content.current().bundle.config;
  const limits = multiLimitsFrom(config);
  const counters = countersFor(player, config, now);
  return {
    unlocked: player.level >= limits.unlockLevel,
    lockedReason:
      player.level >= limits.unlockLevel ? null : `Opens at account level ${limits.unlockLevel}.`,
    runsLeftToday: remaining(counters, MULTI_COUNTER, limits.dailyCap),
    dailyCap: limits.dailyCap,
    maxPerCall: limits.maxPerCall,
  };
}

/**
 * Fights the same stage N times and returns a summary.
 *
 * The farming backbone (GAME_DESIGN §9.1). Each run is an ordinary battle — same engine,
 * same fresh seed, same payout path — so nothing here is a shortcut except that nobody
 * watches. Three things make it a different shape from `start` rather than a loop over it:
 *
 *  - **No sessions are written.** Thirty states and thirty event logs is megabytes per
 *    farm, and a batch has nothing to resume. The summary is the record, and it lives on
 *    the player row so a retry has something to replay (docs/DATA_MODEL.md §4).
 *  - **How many is the server's answer, not the client's.** The requested count is trimmed
 *    by the daily allowance, by energy, and by the per-call cap, and the player is told
 *    which one bit.
 *  - **A defeat ends the batch.** Throwing a losing team at a stage nine more times burns
 *    energy for nothing, so the first loss stops it and keeps the rest.
 */
export async function runMany(
  ctx: BattleContext,
  options: MultiOptions,
): Promise<MultiBattleResult> {
  const { champions, enemies, stages } = contentMaps(ctx.content);

  const stage = stages.get(options.stageKey);
  if (!stage) throw AppError.notFound(`No stage "${options.stageKey}".`);
  // Which modes a batch may not run is stated once in `multiBattleRefusal` and read here
  // and by the picker, because the two had already disagreed: this list used to know about
  // practice and the cold open and not about the Titan, so `/battles/multi` could run Titan
  // stages without touching `spendKey` — an attempts-limited mode farmed for free.
  const refusal = multiBattleRefusal(options.mode);
  if (refusal) throw new AppError('VALIDATION', refusal);
  if (stage.mode !== options.mode) {
    throw new AppError('VALIDATION', `Stage "${options.stageKey}" is not a ${options.mode} stage.`);
  }
  assertTeamShape(options.team);

  const snapshot = ctx.content.current();
  const config = combatConfigFrom(snapshot.bundle.config);
  const scaling = championScalingFrom(snapshot.bundle.config);
  const limits = multiLimitsFrom(snapshot.bundle.config);

  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select()
      .from(players)
      .where(eq(players.id, options.playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    // A retried request is not a second batch. The whole summary was kept for exactly
    // this: a dropped response on a phone must not farm the stage twice.
    const last = player.lastMultiBattle;
    if (last && last.actionId === options.actionId) {
      return multiBattleResultSchema.parse(last.result);
    }

    if (player.level < limits.unlockLevel) {
      throw new AppError(
        'LOCKED_CONTENT',
        `Multi-battle opens at account level ${limits.unlockLevel}.`,
      );
    }

    const [existing] = await tx
      .select({ id: battleSessions.id })
      .from(battleSessions)
      .where(
        and(eq(battleSessions.playerId, options.playerId), eq(battleSessions.status, 'active')),
      );
    if (existing) {
      throw new AppError('ALREADY_EXISTS', 'You are already in a battle. Finish or retreat first.');
    }

    await assertStageOpen(tx, ctx, player, stage, stages);

    // Farming ten runs at once is still fielding a team, so the same rule applies.
    await assertAvailable(tx, options.playerId, options.team);
    const owned = await roster.findOwned(tx, options.playerId, options.team);
    if (owned.length !== options.team.length) {
      throw new AppError('VALIDATION', 'That team includes a champion you do not own.');
    }
    const entries = await assembleEntries(tx, ctx, owned, champions, scaling, options.playerId);

    const now = new Date();
    const energy = computeEnergy({
      storedValue: player.energy,
      updatedAt: player.energyUpdatedAt,
      level: player.level,
      now,
    });
    const counters = countersFor(player, snapshot.bundle.config, now);
    const allowance = remaining(counters, MULTI_COUNTER, limits.dailyCap);

    const cost = stage.energyCost;
    const affordable = cost > 0 ? Math.floor(energy.value / cost) : options.runs;
    if (allowance <= 0) {
      throw new AppError(
        'COOLDOWN',
        `You have used all ${limits.dailyCap} of today's multi-battle runs.`,
      );
    }
    if (affordable <= 0) {
      throw new AppError('ENERGY_LOW', 'Not enough energy for that stage.');
    }

    // Which limit bit, in the order a player would want to hear it: the one they cannot
    // do anything about today, then the one that refills, then the one that is just how
    // big a press is.
    const planned = Math.min(options.runs, limits.maxPerCall, affordable, allowance);
    let stoppedReason: MultiBattleStopReason | null =
      planned === options.runs
        ? null
        : allowance === planned
          ? 'dailyCap'
          : affordable === planned
            ? 'outOfEnergy'
            : 'perCallLimit';

    // Everything that takes the field counts as met, once for the batch rather than
    // once per run: the Chronicle records that they fought, not how often.
    await chronicle.see(tx, options.playerId, [
      ...entries.map((entry) => entry.def.key),
      ...stage.waves.flatMap((wave) => wave.map((unit) => unit.enemyKey)),
    ]);

    const rules = engineRules(ctx.content, options.mode);
    const runs: MultiBattleRun[] = [];
    const droppedGear: GearInstance[] = [];
    const items: Record<string, number> = {};
    let wins = 0;
    let silver = 0;
    let playerXp = 0;
    let championXp = 0;
    // The highest multiplier any run in the batch paid at. A batch is fought in one
    // transaction against one clock, so in practice every run shares it — but a boost that
    // expires mid-batch must report the one that actually paid rather than the last.
    let xpBoost = 1;
    let levelsGained = 0;
    let energySpent = 0;

    for (let index = 0; index < planned; index += 1) {
      // A fresh seed per run, from the process CSPRNG: ten runs of the same fight must be
      // ten different fights, or a batch would be one result multiplied.
      const seed = randomSeed();
      const opened = createBattle(
        {
          seed,
          mode: options.mode,
          allies: buildTeam(entries, scaling, options.mode),
          waves: buildStageWaves(stage, enemies, scaling),
        },
        rules,
        config,
      );
      const finished = advance(opened.state, rules, config, { auto: true });
      energySpent += cost;

      const summary = await settle(
        tx,
        ctx,
        { seed, mode: options.mode, stageKey: options.stageKey, teamIds: options.team },
        finished.state,
        options.playerId,
      );

      runs.push({
        outcome: runOutcome(finished.state.outcome),
        turns: finished.state.turn,
        stars: summary?.stars ?? 0,
        // Bonuses included, so the column the player reads adds up to the total under it.
        // A first clear inside a batch is still a first clear, and hiding its four hundred
        // silver in the footer would look like an arithmetic bug.
        silver: summary ? summary.silver + (summary.bonus.silver ?? 0) : 0,
      });

      if (summary) {
        wins += 1;
        silver += summary.silver + (summary.bonus.silver ?? 0);
        playerXp += summary.playerXp + (summary.bonus.playerXp ?? 0);
        championXp += summary.championXp;
        xpBoost = Math.max(xpBoost, summary.xpBoost);
        levelsGained += summary.levelsGained;
        droppedGear.push(...summary.gear);
        for (const [key, quantity] of Object.entries(summary.items)) {
          items[key] = (items[key] ?? 0) + quantity;
        }
      } else {
        // The energy for the losing run stays spent — the same rule a retreat follows.
        stoppedReason = 'defeated';
        break;
      }
    }

    await tx
      .update(players)
      .set({
        energy: energy.value - energySpent,
        energyUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(players.id, options.playerId));
    await record(tx, options.playerId, counters, MULTI_COUNTER, runs.length);

    const result: MultiBattleResult = {
      runs,
      stoppedReason,
      wins,
      silver,
      playerXp,
      championXp,
      xpBoost,
      levelsGained,
      gear: droppedGear,
      items,
      energySpent,
      energyLeft: energy.value - energySpent,
      runsLeftToday: allowance - runs.length,
    };

    await tx
      .update(players)
      .set({ lastMultiBattle: { actionId: options.actionId, result }, updatedAt: now })
      .where(eq(players.id, options.playerId));

    return result;
  });
}

/**
 * The account's champion-XP boost right now, as a multiplier.
 *
 * Two facts, from two places that each own theirs: **how long** it runs is on the player
 * row, and **what it is worth** is `game_config`, so the owner can move +25% to +50% for a
 * weekend without a deploy and without touching anybody's timer. `xpBoostMultiplier` is
 * the shared rule that combines them, which is also what the badge in the top bar reads —
 * the server and the screen cannot disagree about whether a boost is running.
 */
async function xpBoostFor(
  tx: Tx,
  ctx: BattleContext,
  playerId: string,
  now: Date,
): Promise<number> {
  const [row] = await tx
    .select({ until: players.xpBoostUntil })
    .from(players)
    .where(eq(players.id, playerId));
  return xpBoostMultiplier(
    row?.until ?? null,
    numberConfig(ctx.content.current().bundle.config, 'progression.xpBoostMultiplier', 1.25),
    now,
  );
}

/**
 * A game_config number that is allowed to be fractional, where `intConfig` is not.
 *
 * The XP boost multiplier is 1.25, and reading it through the integer helper would floor
 * it to 1 — a boost that publishes cleanly, reads correctly in Admin and pays nothing.
 */
function numberConfig(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A batch never retreats, so the engine's fourth outcome cannot reach a summary line. */
function runOutcome(outcome: BattleState['outcome']): MultiBattleRun['outcome'] {
  return outcome === 'victory' || outcome === 'turnLimit' ? outcome : 'defeat';
}

function intConfig(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

/**
 * Sends a finished fight to whichever settlement its mode wants.
 *
 * One dispatcher rather than a ternary repeated at each of the three places a battle can
 * end (the opening resolving itself, a turn finishing it, a retreat). Those three had
 * already drifted once — the retreat path knew about the Arena and the Titan and nothing
 * else — and each new mode was another chance for one of them to be forgotten. A mode that
 * settles differently is now a case here and nowhere else.
 */
async function settleFinished(
  tx: Tx,
  ctx: BattleContext,
  row: { id: string; seed: number; mode: string; stageKey: string; teamIds: string[] },
  state: BattleState,
  events: readonly BattleEvent[],
  playerId: string,
): Promise<RewardSummary | null> {
  if (row.mode === 'arena') return settleArena(tx, ctx, row, state.outcome, playerId);
  if (row.mode === 'titan') return settleTitan(tx, ctx, row, events, playerId);
  if (row.mode === 'worldBoss') return settleWorldBoss(tx, ctx, row, events, playerId);
  if (row.mode === 'deepRun') return settleDeepRun(tx, ctx, row, state, playerId);
  if (row.mode === 'spire') return settleSpire(tx, ctx, row, state, playerId);
  return settle(tx, ctx, row, state, playerId);
}

/**
 * Settles one floor of the Mistspire.
 *
 * A floor is an ordinary stage, so the ordinary settlement pays it — silver, experience,
 * drops, stars, the lot. What is added here is the *climb*: the key comes off and the
 * tower advances, and both only on a **win**.
 *
 * That last part is the mode's rule rather than an implementation detail. A warded floor
 * is a puzzle about which four champions to bring, and a puzzle you are charged to attempt
 * is one people look the answer up for instead of working out. So a defeat leaves the key,
 * the climb and the row exactly as they were, and the same ward can be attacked all evening
 * with a different four each time.
 */
async function settleSpire(
  tx: Tx,
  ctx: BattleContext,
  row: { id: string; seed: number; mode: string; stageKey: string; teamIds: string[] },
  state: BattleState,
  playerId: string,
): Promise<RewardSummary | null> {
  const summary = await settle(tx, ctx, row, state, playerId);
  if (!summary || state.outcome !== 'victory') return summary;

  const stage = contentMaps(ctx.content).stages.get(row.stageKey);
  const keep = stage ? spire.keepForStage(ctx.content, stage) : null;
  // Un-published mid-fight. The floor still pays what it paid; there is simply no tower
  // left to advance, and taking the whole result down over it would be the worse answer.
  if (!stage || !keep) return summary;

  const climber = await spire.contextFor(tx, playerId);
  const climb = await spire.settleClear(tx, ctx.content, climber, keep, stage, new Date());
  summary.spire = climb;

  // Reported here rather than in `settle` because the height is not known until the climb
  // has moved. The floor count is a plain increment; the height is a *threshold*, because
  // the climb resets monthly and a cumulative count would quietly pay for re-climbing the
  // same ten floors every month.
  if (climb.advanced) {
    await meta.track(tx, ctx, playerId, [
      { type: 'spireFloor', facts: { dungeonKey: keep.dungeon.key } },
      {
        type: 'spireHeight',
        amount: climb.highestFloor,
        facts: { dungeonKey: keep.dungeon.key },
      },
    ]);
  }
  return summary;
}

/**
 * Settles one floor of a Deep Run.
 *
 * Pays nothing, which is the point: a descent is scored on **depth**, once, when it ends.
 * What this does is write the fight's cost back into the run — the health each champion
 * finished on, and anybody who fell — and then either advance the descent or close it out
 * because nobody is left standing.
 *
 * The run ends here rather than in the route because a wipe is a *battle* outcome: whoever
 * is watching the fight is the one who needs to be told, and a run left open until the next
 * read would let a wiped party walk through another door.
 */
async function settleDeepRun(
  tx: Tx,
  ctx: BattleContext,
  row: { stageKey: string },
  state: BattleState,
  playerId: string,
): Promise<RewardSummary> {
  const stage = roomAsStage(ctx, row.stageKey);
  // Un-published mid-descent. The fight is over and cannot be filed against a run whose
  // rooms no longer exist; saying nothing beats guessing which descent it belonged to.
  if (!stage) return { ...NO_REWARDS };
  const runKey = stage.parentKey;

  const floor = await deeprun.settleFloor(tx, ctx.content, playerId, runKey, state);
  if (!floor) return { ...NO_REWARDS };

  if (!floor.wiped && !floor.bottom) return { ...NO_REWARDS };

  const outcome = await deeprun.endRun(
    tx,
    ctx.content,
    playerId,
    runKey,
    floor.wiped ? 'wiped' : 'completed',
    new Date(),
  );
  const granted =
    Object.keys(outcome.rewards).length > 0
      ? await rewards.grant(tx, playerId, outcome.rewards, `deepRun:${runKey}`)
      : null;

  // One descent is two reports: it happened, and it got this deep. The depth is a
  // *threshold* — a mission asking for floor 10 wants a run that reached it rather than
  // ten runs that reached floor 1.
  await meta.track(tx, ctx, playerId, [
    { type: 'deepRunFinished', facts: { runKey } },
    { type: 'deepRunDepth', amount: outcome.floor, facts: { runKey } },
  ]);

  return {
    ...NO_REWARDS,
    bonus: outcome.rewards,
    levelsGained: granted?.levelsGained ?? 0,
    deepRun: outcome,
  };
}

/**
 * Settles a strike against a world boss.
 *
 * Two things happen and neither is a payout: the damage is folded into the shared pool and
 * into this account's own total for the wake. The contribution ladder is **claimed** on the
 * screen rather than paid here, because a rung is about the week rather than about this
 * fight — which is the difference between a wake and a Titan run.
 *
 * Like a Titan, it settles on **any ending**: victory, defeat, the turn cap and a retreat
 * all did the damage they did, and there is nothing for a forfeit to protect when damage
 * only ever accumulates.
 */
async function settleWorldBoss(
  tx: Tx,
  ctx: BattleContext,
  row: { stageKey: string },
  events: readonly BattleEvent[],
  playerId: string,
): Promise<RewardSummary> {
  const { stages } = contentMaps(ctx.content);
  const stage = stages.get(row.stageKey);
  const keep = stage ? worldboss.keepForStage(ctx.content, stage) : null;
  // Un-published mid-fight. The strike is over and cannot be filed against a boss that no
  // longer exists; saying so beats inventing a wake to put it in.
  if (!keep) return { ...NO_REWARDS };

  const strike = await worldboss.settleStrike(tx, ctx.content, playerId, keep, events, new Date());
  if (!strike) return { ...NO_REWARDS };

  // One strike is two reports: it happened, and the account's total for the wake now
  // stands here. The damage one is a *threshold* — a mission asking for a million wants a
  // week that reached it, not fifty strikes that add up to it twice.
  await meta.track(tx, ctx, playerId, [
    { type: 'worldBossStrike', facts: { dungeonKey: keep.dungeon.key } },
    {
      type: 'worldBossDamage',
      amount: strike.totalDamage,
      facts: { dungeonKey: keep.dungeon.key },
    },
  ]);

  return { ...NO_REWARDS, worldBoss: strike };
}

/**
 * Pays out a finished battle.
 *
 * Only a victory pays. Silver is rolled from the battle's own seed, so a replay of the
 * same fight reports the same loot and the numbers in a share link are checkable.
 */
async function settle(
  tx: Tx,
  ctx: BattleContext,
  row: { seed: number; mode: string; stageKey: string; teamIds: string[] },
  state: BattleState,
  playerId: string,
): Promise<RewardSummary | null> {
  if (state.outcome !== 'victory') return null;

  const { stages } = contentMaps(ctx.content);
  const stage = stages.get(row.stageKey);
  if (!stage) return null;

  // Practice is free and pays nothing — including stars, clears and first-clear bonuses.
  // A sandbox that quietly advanced progress would be the cheapest farm in the game.
  if (row.mode === 'practice') {
    return { ...NO_REWARDS, stars: starsFor(stage, state), turns: state.turn };
  }

  // The cold open pays nothing either — it is fought with champions the account does not
  // own, so there is nobody for champion XP to land on and no clear worth recording — but
  // it *is* a battle that was won, and it has to say so. The tutorial step that opened it
  // is waiting on exactly that report, and it is the only listener that will hear it: a
  // free fight once per account is not a farm, and pretending it never happened would mean
  // the script's first step could only be finished by something other than finishing it.
  if (row.mode === 'tutorial') {
    await meta.track(tx, ctx, playerId, [
      { type: 'battleWin', facts: { mode: row.mode } },
      { type: 'stageClear', facts: { mode: row.mode, stageKey: row.stageKey } },
    ]);
    return { ...NO_REWARDS, stars: starsFor(stage, state), turns: state.turn };
  }

  // A separate stream from the battle's: consuming loot rolls must not shift combat.
  const lootRng = createRng(row.seed ^ 0x5f37_59df);
  const silver = rewards.rollSilver(stage.rewards.silverMin, stage.rewards.silverMax, () =>
    lootRng.next(),
  );

  const stars = starsFor(stage, state);

  const granted = await rewards.grant(
    tx,
    playerId,
    { silver, playerXp: stage.rewards.playerXp },
    rewards.battleSource(row.mode, row.stageKey),
  );

  /**
   * The champion-XP boost, read here and nowhere else.
   *
   * Read *now* rather than when the fight opened, because the boost is a wall clock and
   * the honest question is what was running when the experience was paid — a fight that
   * outlasts its own boost pays the plain figure, which is the rule every game in this
   * genre uses and the only one a countdown on screen can be true about.
   */
  const boost = await xpBoostFor(tx, ctx, playerId, new Date());

  await rewards.grantChampionXp(
    tx,
    row.teamIds,
    stage.rewards.championXp,
    roster.levelCapForRank,
    boost,
  );

  const drops = await rollDrops(tx, ctx, row, stage, playerId, lootRng);

  // Progress is recorded after the payout because its bonuses — first clear, star chests
  // — are earned by *progress* rather than by the fight, and must not be re-paid on a
  // re-farm. `recordClear` owns that distinction.
  const cleared = await progress.recordClear(tx, playerId, stage, ctx.content, state.turn, stars);

  // One win is several reports: it is a battle, a stage clear, possibly a boss kill and a
  // dungeon floor, and it spent energy. Sent from here rather than from four call sites so
  // there is one place to be wrong, and inside this transaction so a rolled-back fight
  // cannot leave quest credit behind. After the payout, too, so a win that levels the
  // account opens the quests that level unlocks — with this battle already counted.
  await meta.track(tx, ctx, playerId, [
    { type: 'battleWin', facts: { mode: row.mode } },
    { type: 'stageClear', facts: { mode: row.mode, stageKey: row.stageKey } },
    ...(isBossStage(ctx, stage) ? [{ type: 'bossKill' as const, facts: { mode: row.mode } }] : []),
    ...(stage.mode === 'campaign'
      ? []
      : [{ type: 'dungeonClear' as const, facts: { dungeonKey: stage.parentKey } }]),
    ...(stage.energyCost > 0 ? [{ type: 'useEnergy' as const, amount: stage.energyCost }] : []),
    // How many trials this account has now solved inside par — a threshold, so a re-run of
    // one already beaten cannot count twice and a mission set after the fact still
    // completes. Reported only when this run moved the number.
    ...(cleared.beatPar
      ? [
          {
            type: 'trialsBeaten' as const,
            amount: await progress.trialsBeaten(tx, playerId, ctx.content),
          },
        ]
      : []),
    // Stars held in this chapter, as a threshold rather than as a gain: "3★ chapter 2" is
    // satisfied by the total standing there now, so re-clearing a stage for a better star
    // cannot double-count, and a mission set after the fact still completes.
    ...(stage.mode === 'campaign'
      ? [
          {
            type: 'chapterStars' as const,
            amount: cleared.chapterStars,
            facts: { chapterKey: stage.parentKey },
          },
        ]
      : []),
  ]);

  // The day's first victory in this mode, paid on the spot. After the fan-out, so a win
  // that levels the account has already opened whatever that level opens.
  const firstWin = await quests.awardFirstWin(tx, ctx, playerId, row.mode);

  return {
    silver,
    playerXp: stage.rewards.playerXp,
    // The boosted figure, because it is what the party actually received. The plain one is
    // recoverable from `xpBoost` beside it, and the screen shows both.
    championXp: boostedChampionXp(stage.rewards.championXp, boost),
    xpBoost: boost,
    stars,
    levelsGained: granted.levelsGained,
    gear: drops.gear,
    items: drops.items,
    vaultOverflow: drops.vaultOverflow,
    firstClear: cleared.firstClear,
    bonus: cleared.bonus,
    chestTiers: cleared.chestTiers,
    beatPar: cleared.beatPar,
    turns: state.turn,
    previousBest: cleared.previousBest,
    firstWin,
    arena: null,
    titan: null,
    worldBoss: null,
    deepRun: null,
    spire: null,
  };
}

/**
 * Settles an Arena fight: moves both ratings, pays the medals.
 *
 * Unlike every other mode this runs on a *loss* as well as a win, because a loss is a
 * result the ladder records rather than the absence of one — the defender gains what the
 * attacker gives up. Anything short of victory is a loss for the attacker, including the
 * turn limit: an attack that could not finish inside the clock did not take the fight.
 */
/**
 * Exported for the Arena, which opens battles of its own and — very rarely — has one
 * already decided by the time the attacker would first act.
 */
export async function settleArena(
  tx: Tx,
  ctx: BattleContext,
  // In Arena the stage key *is* the opponent: there is no stage, only somebody's defence.
  row: { id: string; stageKey: string },
  outcome: BattleState['outcome'],
  playerId: string,
): Promise<RewardSummary> {
  const arena = await ladder.settleBattle(tx, ctx, {
    attackerId: playerId,
    defenderId: row.stageKey,
    battleId: row.id,
    won: outcome === 'victory',
  });

  // The first-win bonus is for *winning*, so unlike the rating it only lands on a victory.
  const firstWin =
    outcome === 'victory' ? await quests.awardFirstWin(tx, ctx, playerId, 'arena') : {};

  return { ...NO_REWARDS, firstWin, arena };
}

/**
 * Settles a Titan run: scores it, records it, and pays the rung it reached.
 *
 * Separate from `settle` for the reason the mode exists — `settle` returns null unless the
 * outcome is `victory`, and a Titan run almost never is one. **Every ending pays**: the
 * turn cap is the ordinary one, a defeat is the early one, and a kill is the top of the
 * ladder. What differs between them is only how much damage was done by the time it
 * stopped, which is the number the whole mode is about.
 *
 * The rewards go through `RewardService` like everything else, so a Titan chest lands in
 * the economy log beside a chapter chest and nothing here becomes a second payout path.
 */
async function settleTitan(
  tx: Tx,
  ctx: BattleContext,
  row: { stageKey: string },
  events: readonly BattleEvent[],
  playerId: string,
): Promise<RewardSummary> {
  const { stages } = contentMaps(ctx.content);
  const stage = stages.get(row.stageKey);
  const keep = stage ? titan.keepForStage(ctx.content, stage) : null;
  // A Titan un-published mid-fight. The run is over and cannot be scored against a ladder
  // that no longer exists; saying so beats crediting a rung nobody authored.
  if (!keep) return { ...NO_REWARDS };

  const now = new Date();
  const counters = await titan.countersOf(tx, ctx.content, playerId, now);
  const run = await titan.settleRun(tx, playerId, keep, events, counters);

  const bonus = { ...run.rewards };
  const granted =
    Object.keys(bonus).length > 0
      ? await rewards.grant(tx, playerId, bonus, rewards.battleSource('titan', row.stageKey))
      : null;

  // One run is two reports: it happened, and it is worth this much. The damage one is a
  // *threshold*, so a mission asking for half a million wants one run that did it rather
  // than fifty that add up — which is what `GOAL_ACCUMULATION` says about `titanDamage`.
  await meta.track(tx, ctx, playerId, [
    { type: 'titanRun', facts: { dungeonKey: keep.dungeon.key } },
    { type: 'titanDamage', amount: run.damage, facts: { dungeonKey: keep.dungeon.key } },
  ]);

  return {
    ...NO_REWARDS,
    titan: run,
    bonus,
    levelsGained: granted?.levelsGained ?? 0,
  };
}

/** Whether a stage's waves hold anything content has flagged as a boss. */
function isBossStage(ctx: BattleContext, stage: StageDef): boolean {
  const { enemies } = contentMaps(ctx.content);
  return stage.waves.some((wave) => wave.some((unit) => enemies.get(unit.enemyKey)?.isBoss));
}

/**
 * What the clear dropped, beyond silver and experience.
 *
 * The relic's set comes from the chapter and its slot from the stage number — the source
 * game's arrangement, and the reason a chapter is a farm for something specific rather
 * than a lottery. Rolled from the battle's own loot stream, so a replay of a fight
 * reports the same drop it originally paid.
 */
async function rollDrops(
  tx: Tx,
  ctx: BattleContext,
  row: { stageKey: string },
  stage: StageDef,
  playerId: string,
  lootRng: ReturnType<typeof createRng>,
): Promise<{
  gear: GearInstance[];
  items: Record<string, number>;
  vaultOverflow: gear.VaultOverflow;
}> {
  const snapshot = ctx.content.current();
  const band = stage.rewards.drops;
  const dropped: GearInstance[] = [];
  const items: Record<string, number> = {};
  let vaultOverflow = gear.NO_OVERFLOW;

  if (band && band.gearChance > 0 && lootRng.chance(band.gearChance)) {
    const gearContext = gear.gearContextFrom(snapshot.bundle);
    // A stage that names its own sets wins; otherwise the chapter's single set applies.
    // Campaign stages inherit — one chapter, one set, one farm — while a dungeon floor
    // has no chapter and carries the four sets its keep is known for.
    const chapter = snapshot.bundle.campaignChapters.find((entry) => entry.key === stage.parentKey);
    const setKeys =
      band.gearSetKeys.length > 0 ? band.gearSetKeys : chapter?.setKey ? [chapter.setKey] : [];
    const request = gear.rollBand(
      lootRng,
      {
        setKeys,
        slots: band.gearSlots,
        rankMin: band.gearRankMin,
        rankMax: band.gearRankMax,
        rarityWeights: band.gearRarityWeights,
      },
      gearContext,
    );
    if (request) {
      // Through the capped path, not `createGear`: a full vault must not fail the whole
      // settlement of a fight the player has already won. What does not fit is paid as
      // silver and reported, so the results screen can say so in a line.
      const { created, overflow } = await gear.createGearBatchCapped(
        tx,
        playerId,
        [{ ...request, source: `stage:${row.stageKey}` }],
        lootRng,
        gearContext,
      );
      for (const row of created) dropped.push(gear.toDto(row, gearContext));
      vaultOverflow = overflow;
    }
  }

  for (const drop of band?.items ?? []) {
    if (!lootRng.chance(drop.chance)) continue;
    const quantity = lootRng.int(drop.min, Math.max(drop.min, drop.max));
    items[drop.itemKey] = (items[drop.itemKey] ?? 0) + quantity;
  }
  if (Object.keys(items).length > 0) {
    await rewards.grantItems(tx, playerId, items, rewards.battleSource('drop', row.stageKey));
  }

  if (vaultOverflow.silver > 0) {
    await rewards.grant(
      tx,
      playerId,
      { silver: vaultOverflow.silver },
      `gear:vaultFull:${row.stageKey}`,
    );
  }

  return { gear: dropped, items, vaultOverflow };
}

/**
 * How many stars the clear earned.
 *
 * One for the win, one for finishing inside the turn limit, one for finishing with
 * everyone alive (docs/CONTENT_PLAN_EA01.md §3).
 */
export function starsFor(stage: StageDef, state: BattleState): number {
  if (state.outcome !== 'victory') return 0;
  let stars = 1;
  if (state.turn <= stage.starRules.maxTurns) stars += 1;
  if (!stage.starRules.noDeaths || state.allies.every((unit) => unit.alive)) stars += 1;
  return stars;
}

/** Exported for the Arena, which opens battles of its own through the same table. */
/**
 * The contribution table a finished view carries, and nothing while the fight is going on.
 *
 * One rule in one place: five different places build a `BattleView` — `start`, `step`,
 * `retreat`, `toView` and the Arena's own attack — and each of them would otherwise be
 * free to disagree about when the table appears. It is folded rather than stored because
 * the event log on the row *is* the record, and a second copy could only ever go stale.
 *
 * The player's side only, which is the owner's rule: this reports on the team you brought,
 * not on the enemy's health bar.
 */
export function contributionTable(
  status: string,
  events: readonly BattleEvent[],
): UnitContribution[] {
  return status === 'finished' ? contributions(events, 'ally') : [];
}

/**
 * The borrowed warden a view carries, out of the two fields the row stores about them.
 *
 * Its own function for `contributionTable`'s reason: five places build a `BattleView` and
 * the slot is *derived* — the borrowed champion is pushed onto the formation after the
 * account's own, so it is `teamIds.length` — which is exactly the kind of arithmetic that
 * rots when it is written out five times.
 */
export function borrowedFromOf(row: {
  borrowedFrom: string | null;
  teamIds: unknown;
}): BattleView['borrowedFrom'] {
  if (!row.borrowedFrom) return null;
  const team = (row.teamIds as string[] | null) ?? [];
  return { slot: team.length, profileName: row.borrowedFrom };
}

export function toView(row: typeof battleSessions.$inferSelect): BattleView {
  return {
    id: row.id,
    mode: row.mode,
    stageKey: row.stageKey,
    status: row.status,
    outcome: row.outcome,
    state: row.state as BattleState,
    events: row.events as BattleEvent[],
    rewards: (row.rewards as RewardSummary | null) ?? null,
    canSkip: row.canSkip,
    contributions: contributionTable(row.status, row.events as BattleEvent[]),
    team: (row.teamIds as string[]) ?? [],
    borrowedFrom: borrowedFromOf(row),
  };
}

/** A battle seed the player cannot predict. */
function randomSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! >>> 0;
}
