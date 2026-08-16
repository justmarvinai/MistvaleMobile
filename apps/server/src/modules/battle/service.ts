import { and, desc, eq } from 'drizzle-orm';
import {
  advance,
  buildRules,
  buildStageWaves,
  buildTeam,
  championScalingFrom,
  combatConfigFrom,
  createBattle,
  createRng,
  deriveStats,
  retreat as retreatBattle,
  type BattleAction,
  type BattleEvent,
  type BattleState,
  type ChampionEntry,
} from '@mistvale/engine';
import type { BattleMode, ChampionDef, EnemyDef, GearInstance, StageDef } from '@mistvale/shared';
import { battleSessions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { computeEnergy } from '../../lib/progression';
import type { ContentCache } from '../../content/cache';
import * as depths from '../depths/service';
import * as gear from '../gear/service';
import * as progress from '../progress/service';
import * as chronicle from '../summon/service';
import * as rewards from '../rewards/service';
import * as roster from '../roster/service';

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
}

export interface RewardSummary {
  silver: number;
  playerXp: number;
  championXp: number;
  stars: number;
  levelsGained: number;
  /** Relics the clear dropped, already owned by the player by the time this is read. */
  gear: GearInstance[];
  /** Stackables the clear dropped, by item key. */
  items: Record<string, number>;
  /** True the first time this stage has ever been beaten. */
  firstClear: boolean;
  /** Paid on top of the stage payout: the first-clear bonus and any star chest. */
  bonus: rewards.RewardBundle;
  /** Chapter star-chest tiers this clear crossed. */
  chestTiers: number[];
}

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

/**
 * Starts a battle.
 *
 * Spends energy and creates the session in one transaction, so a crash between the two
 * cannot bill a player for a fight that does not exist.
 */
export async function start(ctx: BattleContext, options: StartOptions): Promise<BattleView> {
  const { champions, enemies, stages } = contentMaps(ctx.content);

  const stage = stages.get(options.stageKey);
  if (!stage) throw AppError.notFound(`No stage "${options.stageKey}".`);
  if (stage.mode !== options.mode) {
    throw new AppError('VALIDATION', `Stage "${options.stageKey}" is not a ${options.mode} stage.`);
  }
  if (options.team.length === 0 || options.team.length > MAX_TEAM) {
    throw new AppError('VALIDATION', `A team is one to ${MAX_TEAM} champions.`);
  }
  if (new Set(options.team).size !== options.team.length) {
    throw new AppError('VALIDATION', 'A champion cannot take two slots.');
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
      .select({ id: battleSessions.id })
      .from(battleSessions)
      .where(
        and(eq(battleSessions.playerId, options.playerId), eq(battleSessions.status, 'active')),
      );
    if (existing) {
      // A conflict, not a cooldown: the fix is to finish the fight, not to wait.
      throw new AppError('ALREADY_EXISTS', 'You are already in a battle. Finish or retreat first.');
    }

    // The unlock chain has been authored in content since P1; this is where it finally
    // binds. Checked against the same rule the campaign map greys stages out with, so a
    // player is never shown an open door the server will slam.
    if (options.mode !== 'practice') {
      const cleared = await progress.standings(tx, options.playerId);
      const chapters = new Map(
        snapshot.bundle.campaignChapters.map((entry) => [entry.key, entry.number]),
      );
      // The Depths' own gates — account level and the rotation day — ride along here, so
      // a spring that is shut on a Tuesday refuses the fight rather than merely hiding it.
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

    const owned = await roster.findOwned(tx, options.playerId, options.team);
    if (owned.length !== options.team.length) {
      throw new AppError('VALIDATION', 'That team includes a champion you do not own.');
    }

    // Relics are resolved into flat stat bonuses here rather than inside the engine: the
    // engine takes numbers, and everything about what a percentage resolves against is a
    // server concern (docs/COMBAT_SYSTEM.md §1). This is why the number on the champion
    // screen is the number that fights.
    const equipped = await gear.gearByChampion(tx, options.team);
    const gearContext = gear.gearContextFrom(snapshot.bundle);

    const entries: ChampionEntry[] = owned.map((member) => {
      const def = champions.get(member.championKey);
      if (!def) {
        throw new AppError(
          'CONTENT_STALE',
          `Champion "${member.championKey}" is no longer published.`,
        );
      }
      const base = deriveStats(def.baseStats, member, scaling);
      const assembled = gear.assembleChampion(base, equipped.get(member.id) ?? [], gearContext);
      return {
        def,
        level: member.level,
        rank: member.rank,
        ascension: member.ascension,
        bonuses: assembled.gear,
      };
    });

    // Energy: derived from the clock, so an idle account costs nothing to keep current.
    const now = new Date();
    const energy = computeEnergy({
      storedValue: player.energy,
      updatedAt: player.energyUpdatedAt,
      level: player.level,
      now,
    });
    // Practice re-fights are free by design (GAME_DESIGN §15 — the sandbox).
    const cost = options.mode === 'practice' ? 0 : stage.energyCost;
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
    const seed = randomSeed();
    const rules = engineRules(ctx.content, options.mode);
    const opened = createBattle(
      {
        seed,
        mode: options.mode,
        allies: buildTeam(entries, scaling, options.mode),
        waves: buildStageWaves(stage, enemies),
      },
      rules,
      config,
    );

    // Everything that took the field counts as met, which is what makes the Chronicle a
    // record of the world rather than a list of receipts (GAME_DESIGN §10).
    await chronicle.see(tx, options.playerId, [
      ...owned.map((member) => member.championKey),
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
        seed,
        state: opened.state,
        events: opened.events,
        energySpent: cost,
      })
      .returning({ id: battleSessions.id });
    if (!row) throw new AppError('INTERNAL', 'Could not start that battle.');

    return {
      id: row.id,
      mode: options.mode,
      stageKey: options.stageKey,
      status: 'active',
      outcome: null,
      state: opened.state,
      events: opened.events,
      rewards: null,
    };
  });
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
  /** Play the rest of the fight without stopping for input. */
  auto?: boolean;
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

    const state = row.state as BattleState;
    const result = advance(state, rules, config, {
      auto: options.auto ?? false,
      ...(options.action ? { action: options.action } : {}),
    });

    const events = [...(row.events as BattleEvent[]), ...result.events];
    const finished = result.state.finished;

    let summary: RewardSummary | null = (row.rewards as RewardSummary | null) ?? null;
    if (finished) {
      summary = await settle(
        tx,
        ctx,
        { ...row, teamIds: (row.teamIds as string[]) ?? [] },
        result.state,
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

    const result = retreatBattle(row.state as BattleState, rules, config);
    const events = [...(row.events as BattleEvent[]), ...result.events];

    await tx
      .update(battleSessions)
      .set({
        state: result.state,
        events,
        status: 'finished',
        outcome: 'retreat',
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
      rewards: null,
    };
  });
}

/**
 * Pays out a finished battle.
 *
 * Only a victory pays. Silver is rolled from the battle's own seed, so a replay of the
 * same fight reports the same loot and the numbers in a share link are checkable.
 */
async function settle(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  ctx: BattleContext,
  row: { id: string; seed: number; mode: string; stageKey: string; teamIds: string[] },
  state: BattleState,
  playerId: string,
): Promise<RewardSummary | null> {
  if (state.outcome !== 'victory') return null;

  const { stages } = contentMaps(ctx.content);
  const stage = stages.get(row.stageKey);
  if (!stage) return null;

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

  await rewards.grantChampionXp(tx, row.teamIds, stage.rewards.championXp, roster.levelCapForRank);

  const drops = await rollDrops(tx, ctx, row, stage, playerId, lootRng);

  // Progress is recorded after the payout because its bonuses — first clear, star chests
  // — are earned by *progress* rather than by the fight, and must not be re-paid on a
  // re-farm. `recordClear` owns that distinction.
  const cleared = await progress.recordClear(tx, playerId, stage, ctx.content, state.turn, stars);

  return {
    silver,
    playerXp: stage.rewards.playerXp,
    championXp: stage.rewards.championXp,
    stars,
    levelsGained: granted.levelsGained,
    gear: drops.gear,
    items: drops.items,
    firstClear: cleared.firstClear,
    bonus: cleared.bonus,
    chestTiers: cleared.chestTiers,
  };
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
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  ctx: BattleContext,
  row: { stageKey: string },
  stage: StageDef,
  playerId: string,
  lootRng: ReturnType<typeof createRng>,
): Promise<{ gear: GearInstance[]; items: Record<string, number> }> {
  const snapshot = ctx.content.current();
  const band = stage.rewards.drops;
  const dropped: GearInstance[] = [];
  const items: Record<string, number> = {};

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
      const created = await gear.createGear(
        tx,
        playerId,
        { ...request, source: `stage:${row.stageKey}` },
        lootRng,
        gearContext,
      );
      dropped.push(gear.toDto(created, gearContext));
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

  return { gear: dropped, items };
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

function toView(row: typeof battleSessions.$inferSelect): BattleView {
  return {
    id: row.id,
    mode: row.mode,
    stageKey: row.stageKey,
    status: row.status,
    outcome: row.outcome,
    state: row.state as BattleState,
    events: row.events as BattleEvent[],
    rewards: (row.rewards as RewardSummary | null) ?? null,
  };
}

/** A battle seed the player cannot predict. */
function randomSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! >>> 0;
}
