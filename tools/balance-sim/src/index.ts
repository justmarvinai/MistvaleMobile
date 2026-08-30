import {
  arenaDiversity,
  benchmarkRoster,
  campaignStages,
  dungeonFloors,
  loadContent,
  simulateColdOpen,
  simulateStage,
  wardedTeam,
  simulateTitan,
  simulateTrial,
  simulateTrialOnAuto,
  roleIndex,
  starterKeys,
  withCollection,
  withRelics,
  type ArenaSetup,
  type BenchSetup,
  type LoadedContent,
  type StageResult,
  type TeamSpec,
  type TrialSolution,
} from './sim';

/**
 * `pnpm sim` — the tuning report, and the gates CI enforces.
 *
 * Prints a table per scenario and exits non-zero when a gate fails, so a balance change
 * that makes chapter 1 unwinnable for a fresh account cannot reach `main`
 * (COMBAT_SYSTEM §14).
 */

/**
 * Runs per scenario.
 *
 * The simulation is deterministic given a seed, and every scenario starts from seed 1,
 * so this measurement is *reproducible*: the same content produces the same win rate on
 * every machine and every CI run. There is no flake to tolerate — but the sample still
 * has to be large enough that the estimate sits well clear of the gate rather than
 * straddling it. At well under a millisecond per run, a large default is nearly free.
 *
 * `SIM_RUNS` lowers it for a quick local look. Doing so changes which seeds are sampled,
 * so a small run is an indication, not a verdict.
 */
const RUNS = Number(process.env.SIM_RUNS ?? 2_000);

/**
 * Runs per Mistspire floor.
 *
 * A twelfth of the campaign's, because the tower fights **forty-two** stages a pass — the
 * two unwarded ends plus nine wards, each with its own team — and a win-rate gate at 0.8
 * does not need two thousand samples to be sound. Enough to separate "reliably" from
 * "sometimes", which is all the gate claims.
 */
const SPIRE_RUNS = Math.max(30, Math.round(RUNS / 12));

/**
 * Where a champion is measured, and how hard.
 *
 * The last fight of the campaign, at the investment a finished account brings to it. It is
 * chosen for what it lacks as much as for what it is: no boss mechanic. The Titan and the
 * world boss are the obvious dummies — nobody kills them and both run to a turn cap — and
 * a hit-counter shield would turn the whole table into "is this champion a multi-hitter",
 * which is a fact about that boss rather than about the champion.
 *
 * A hundred runs each at the default. Measured rather than picked: across two disjoint
 * blocks of seeds the worst a champion's index moved was **5.6 points**, against the fifty
 * points of margin between the roster's fastest and the outlier bound — so the gate fires
 * on a regression and never on the sampling.
 */
const BENCHMARK_STAGE = 'c12_s7_brutal';
const BENCHMARK_RUNS = Math.max(30, Math.round(RUNS / 20));

/**
 * How far above its role's median a champion may sit.
 *
 * Wide on purpose, and not the 85–115% COMBAT_SYSTEM §14 documents. The narrow band is a
 * *tuning* target for a champion pass nobody has run yet; this number only has to separate
 * "stronger than its peers", which is content design, from "broken", which is a bug. The
 * roster spans 75–151% as shipped and a champion given a hundred times its authored attack
 * reaches 262%, so the bound sits between the two with real room on each side.
 *
 * **There is deliberately no lower bound**, and the reason is the more interesting half.
 * The score is what the *team* did, and the other three carry the fight — so the measure
 * saturates from below. A champion stripped to one point of attack, one of health and one
 * of defence, which dies on the first wave and does nothing at all, still scores **66%**,
 * against a roster whose own weakest is 75%. Any floor far enough from 75% to clear the
 * six points of sampling noise would sit below 66% and could never fire: a guard that
 * cannot be made to fail has not been checked, so it is not written. `champion-does-
 * something` is what covers that end, and it fires on exactly that mutation.
 */
const OUTLIER_HIGH = 200;

/**
 * How many Arena pairings the diversity report draws, and what it may say.
 *
 * Each pairing is fought **twice**, sides swapped, because the attacker moves first and
 * that is worth real win rate — scoring one direction only would credit the draw rather
 * than the champions. At the default that is six thousand battles and about eight seconds.
 *
 * The band is on a **role** rather than on a champion, and the reason is measured. One
 * champion in four cannot escape the noise floor of its three random partners: a champion
 * given a hundred times its authored attack tops the table at 76.5%, against an authored
 * best of 76.3%, and stripped to 1/1/1 it falls only to 20.6% against an authored worst of
 * 24.9%. Nothing could cross a champion-level bound, so none is written. A role pools six
 * to fourteen champions over thousands of battles and moves by only **0.2 to 1.3 points**
 * across disjoint seed blocks, which is a statistic a gate can stand on.
 *
 * **A ceiling and no floor**, for the same structural reason C29 has no floor: a role can
 * be pushed up but not down. Every attack champion cut to a *twentieth* of its authored
 * attack moves the role from 42.5% to 38.5% and stops there — a comp is four champions
 * drawn from thirty-seven, so a comp holding a crippled attacker still holds three others
 * who win it. Pushed the other way it moves freely: supports at five times their attack
 * reach 65.9% and at twenty times 67.0%, which is about the ceiling the format allows.
 *
 * So the bound is **62%**: five points clear of the shipped maximum of 56.9% — five times
 * the drift — and demonstrably crossable, which is the whole test of whether a gate is
 * real. What it says is the thing §14 is actually asking: no comp has to be built out of
 * one role to compete.
 */
const ARENA_PAIRINGS = Math.max(200, Math.round(RUNS * 1.5));
const ARENA_ROLE_HIGH = 62;

/**
 * The line each trial is authored around — the answer key.
 *
 * A trial is a puzzle with a specific solution, so the only honest way to know its par is
 * fair is to play that solution and see it land. These are not a general "good player":
 * no single policy solves four different puzzles, which is the point of there being four.
 *
 * It lives in the balance tool and never ships to a client. What a player is given is the
 * hint on the trial's own card, which says what the shape of the answer is and not what
 * the answer is.
 */
const TRIAL_SOLUTIONS: Readonly<Record<string, TrialSolution>> = {
  // Break the counter with the cheap two-hit openers, then spend everything in the window
  // the broken shield leaves open. Reversing those two is the whole trap.
  trial_warded_coil: {
    focus: ['trial_warded_coil'],
    prefer: [
      'anuria_a1_twinshot',
      'bracken_puck_a1_pinprick',
      'ashka_torchhand_a1_torchslash',
      'cantor_maelis_a1_dirge_note',
    ],
    avoid: [],
    whenExposed: [
      'anuria_a3_arrowstorm',
      'cantor_maelis_a3_drowning_chorus',
      'bracken_puck_a3_briar_dance',
      'ashka_torchhand_a2_cinder_rush',
      'anuria_a2_wardens_aim',
      'cantor_maelis_a2_undertow_hymn',
      'bracken_puck_a2_hourthief',
    ],
  },
  // Everything spent on the wall is handed straight back. Kill the mender first, and it is
  // an ordinary fight against three things that cannot heal.
  trial_mending_fen: { focus: ['trial_fen_mender'], prefer: [], avoid: [] },
  // The hatchlings never stop coming and they hit like the thing that called them. Killing
  // them is a treadmill; the crown is the only health bar that stays down.
  trial_brood_crown: { focus: ['trial_brood_crown'], prefer: [], avoid: [] },
  // Its armour makes a blow worth almost nothing and its answer makes one worth less than
  // that. The poison on the cheap openers is the whole clock, and the big skills are a way
  // of hitting it — which is the one thing that does not work.
  trial_standing_stone: {
    focus: ['trial_standing_stone'],
    prefer: [
      'maruan_a1_thornlash',
      'old_gharssa_a1_venom_spit',
      'szarran_coilfather_a1_coil_bite',
      'briar_knight_a2_bramble_mantle',
      'briar_knight_a1_thorn_guard',
    ],
    avoid: [
      'maruan_a3_verdant_ruin',
      'old_gharssa_a3_mire_bloom',
      'szarran_coilfather_a2_broodmire',
      'szarran_coilfather_a3_venom_crown',
      'szarran_coilfather_a4_the_coil_closes',
    ],
  },
};

interface Gate {
  name: string;
  detail: string;
  passed: boolean;
  measured: string;
}

function tutorialTeam(content: LoadedContent, starter: string): TeamSpec[] {
  // A brand-new account: the chosen starter, alone, at level 1 and one star.
  void content;
  return [{ championKey: starter, level: 1, rank: 1, ascension: 0 }];
}

function parTeam(content: LoadedContent): TeamSpec[] {
  // "At par recommended power": four Rares at the level chapter 1 expects.
  const rares = [...content.champions.values()]
    .filter((champion) => champion.rarity === 'rare' && !champion.isFood && champion.summonable)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 4);
  return rares.map((champion) => ({
    championKey: champion.key,
    level: 20,
    rank: 3,
    ascension: 0,
  }));
}

/**
 * The composition the XP farm is *for*: one maxed carry and three food units along for
 * the ride (ECONOMY_BALANCE §3).
 *
 * Deliberately not four good champions. A stage's champion XP is a total split across the
 * team, so the loop only pays if the three passengers can be worthless — which means the
 * carry has to clear the stage almost alone. Simulating four maxed champions would measure
 * a team nobody fields to farm and would pass a gate the real loop fails.
 */
function farmTeam(content: LoadedContent): TeamSpec[] {
  const carry = [...content.champions.values()]
    .filter((champion) => !champion.isFood && champion.summonable)
    .sort((a, b) => a.key.localeCompare(b.key))
    .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))[0];
  const food = [...content.champions.values()]
    .filter((champion) => champion.isFood)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 3);
  if (!carry || food.length < 3) throw new Error('No carry-plus-food team in the seeds.');

  return [
    ...withRelics(content, [{ championKey: carry.key, level: 60, rank: 6, ascension: 6 }]),
    ...food.map((champion) => ({
      championKey: champion.key,
      level: 1,
      rank: 1,
      ascension: 0,
    })),
  ];
}

function rarityRank(rarity: string): number {
  return ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(rarity);
}

/**
 * The power an account is expected to have arrived at a Normal chapter with.
 *
 * One definition, used by the per-chapter gate and by the Brutal wall check, so "fresh off
 * Normal" means the same thing in both places.
 */
function normalPar(chapter: number): { level: number; rank: number } {
  return {
    level: Math.min(60, 20 + (chapter - 1) * 10),
    rank: Math.min(6, 3 + Math.floor((chapter - 1) / 2)),
  };
}

function table(title: string, rows: StageResult[]): void {
  console.log(`\n${title}`);
  console.log('  stage            runs   win%   avg turns   ms/run');
  for (const row of rows) {
    const turns = Number.isNaN(row.averageTurns) ? '—' : row.averageTurns.toFixed(1);
    console.log(
      `  ${row.stageKey.padEnd(16)} ${String(row.runs).padStart(4)}  ` +
        `${(row.winRate * 100).toFixed(1).padStart(5)}  ${turns.padStart(9)}  ` +
        `${row.msPerRun.toFixed(2).padStart(6)}`,
    );
  }
}

function main(): void {
  const content = loadContent();
  const gates: Gate[] = [];

  // ── Gate 1: a fresh account clears the opening stages on auto ───────────
  const starters = starterKeys(content);
  if (starters.length === 0) throw new Error('No champion is flagged as a starter.');

  const opening = campaignStages(content, 1, 'normal').slice(0, 3);
  if (opening.length < 3) throw new Error('Chapter 1 Normal has fewer than three stages.');

  for (const starter of starters) {
    const rows = opening.map((stage) =>
      simulateStage(content, stage.key, tutorialTeam(content, starter), RUNS),
    );
    table(`Starter "${starter}" — chapter 1 Normal, level 1`, rows);

    const worst = Math.min(...rows.map((row) => row.winRate));
    gates.push({
      name: `starter:${starter}`,
      detail: 'clears 1-1…1-3 Normal on auto at least 95% of the time',
      passed: worst >= 0.95,
      measured: `worst stage ${(worst * 100).toFixed(1)}%`,
    });
  }

  // ── Gate 2: a par team beats every published chapter boss ───────────────
  // Levelled to the chapter it faces, because "at par recommended power" is the whole
  // point of the check — a level-20 team wiping on chapter 3 is expected, not a bug.
  for (let chapter = 1; chapter <= 12; chapter += 1) {
    const stages = campaignStages(content, chapter, 'normal');
    const boss = stages[stages.length - 1];
    if (!boss) continue;

    const team = parTeam(content).map((member) => ({ ...member, ...normalPar(chapter) }));

    const result = simulateStage(content, boss.key, team, RUNS);
    table(`Par team — chapter ${chapter} boss, Normal`, [result]);
    gates.push({
      name: `chapter-${chapter}-boss`,
      detail: 'falls to a par team on auto at least 70% of the time',
      passed: result.winRate >= 0.7,
      measured: `${(result.winRate * 100).toFixed(1)}%`,
    });
  }

  // ── Gate 2b: Hard and Brutal are a second and third pass, not a wall ────
  // A difficulty opens on finishing the whole one below it, so the team walking into
  // Hard 1-1 is the team that just cleared 12-7 Normal — levelled, ranked and wearing
  // what twelve chapters dropped. Both endpoints are checked: the *first* chapter of a
  // difficulty has to fall to the team that just unlocked it, and the *last* has to fall
  // to a team that has farmed the difficulty itself.
  for (const difficulty of ['hard', 'brutal'] as const) {
    const opening = campaignStages(content, 1, difficulty).at(-1);
    const finale = campaignStages(content, 12, difficulty).at(-1);
    if (!opening || !finale) continue;

    // Who arrives: whoever just finished the difficulty below. Brutal inherits a team that
    // has been through Hard, which is why it can afford to start above where Hard ended.
    const arriving = withRelics(
      content,
      parTeam(content).map((member) => ({
        ...member,
        ...(difficulty === 'hard' ? { level: 50, rank: 5, ascension: 2 } : {}),
        ...(difficulty === 'brutal' ? { level: 60, rank: 6, ascension: 4 } : {}),
      })),
    );
    const maxed = withCollection(
      content,
      withRelics(
        content,
        parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 6 })),
      ),
    );

    const entry = simulateStage(content, opening.key, arriving, RUNS);
    const deep = simulateStage(content, finale.key, maxed, RUNS);
    table(`${difficulty} — chapter 1 boss (on arrival) and chapter 12 boss (maxed)`, [entry, deep]);

    gates.push({
      name: `${difficulty}-entry`,
      detail: 'chapter 1 falls to the team that just unlocked this difficulty, 70% of the time',
      passed: entry.winRate >= 0.7,
      measured: `${(entry.winRate * 100).toFixed(1)}%`,
    });
    gates.push({
      name: `${difficulty}-finale`,
      detail: 'chapter 12 falls to a fully levelled team at least 50% of the time',
      passed: deep.winRate >= 0.5,
      measured: `${(deep.winRate * 100).toFixed(1)}%`,
    });
  }

  // The other half of a ladder: it has to be *a ladder*. Two walls, one per axis. If a
  // chapter-1 team can walk to 12-7 Normal, the eleven chapters between are decoration;
  // if the team that just finished Normal can walk into Brutal 12-7, so are the two
  // difficulties. The same check the Depths keeps get, asked of the campaign.
  const walls: [string, string, ReturnType<typeof parTeam>][] = [];
  const normalFinale = campaignStages(content, 12, 'normal').at(-1);
  const brutalFinale = campaignStages(content, 12, 'brutal').at(-1);
  if (normalFinale) {
    walls.push([
      'normal-wall',
      normalFinale.key,
      parTeam(content).map((member) => ({ ...member, ...normalPar(1) })),
    ]);
  }
  if (brutalFinale) {
    walls.push([
      'brutal-wall',
      brutalFinale.key,
      parTeam(content).map((member) => ({ ...member, ...normalPar(12) })),
    ]);
  }
  for (const [name, stageKey, team] of walls) {
    const overreach = simulateStage(content, stageKey, team, RUNS);
    gates.push({
      name,
      detail:
        name === 'normal-wall'
          ? '12-7 Normal turns back a chapter-1 team at least 90% of the time'
          : 'Brutal 12-7 turns back a team fresh off Normal at least 90% of the time',
      passed: overreach.winRate <= 0.1,
      measured: `${(overreach.winRate * 100).toFixed(1)}% got through`,
    });
  }

  // ── Gate 3: the Depths open where they say they do, and end as a wall ───
  // Two questions per keep. Floor 1 has to fall to a team that has just reached the
  // dungeon's unlock level, or the door is a lie. The deepest floor has to fall to a
  // fully levelled team, or the treadmill has no end — but it is allowed to be hard,
  // which is why the bar there is lower.
  for (const dungeon of [...content.dungeons.values()].sort((a, b) => a.sortOrder - b.sortOrder)) {
    // A Titan and a world boss are `dungeon` entities because that is where everything else
    // about them fits, but "does the deepest floor fall" is not a question about either:
    // both are authored so that nobody clears them. The Titan's own gates are below; the
    // world boss's pool is a *shared* number and so is not a thing one simulated team can
    // be measured against at all — what it is worth is a live population, which no
    // simulation has.
    if (dungeon.kind === 'titan' || dungeon.kind === 'worldBoss') continue;
    const floors = dungeonFloors(content, dungeon.key);
    const first = floors[0];
    const deepest = floors[floors.length - 1];
    if (!first || !deepest) continue;

    const entry = parTeam(content).map((member) => ({
      ...member,
      level: Math.min(60, dungeon.unlockLevel * 2 + 6),
      rank: 4,
    }));
    // The deepest floor is measured against a team that has actually farmed for it:
    // levelled, ranked, ascended and wearing relics. An unequipped champion is not who
    // walks into floor 15, and gating on one would tune the Depths for nobody.
    const maxed = withCollection(
      content,
      withRelics(
        content,
        parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 4 })),
      ),
    );

    const shallow = simulateStage(content, first.key, entry, RUNS);
    const deep = simulateStage(content, deepest.key, maxed, RUNS);
    table(
      `${dungeon.name} — floor ${first.number} (at unlock) and floor ${deepest.number} (maxed)`,
      [shallow, deep],
    );

    gates.push({
      name: `${dungeon.key}-entry`,
      detail: 'floor 1 falls to a team at the dungeon’s unlock level at least 70% of the time',
      passed: shallow.winRate >= 0.7,
      measured: `${(shallow.winRate * 100).toFixed(1)}%`,
    });
    gates.push({
      name: `${dungeon.key}-deepest`,
      detail: 'the deepest floor falls to a fully levelled team at least 50% of the time',
      passed: deep.winRate >= 0.5,
      measured: `${(deep.winRate * 100).toFixed(1)}%`,
    });

    // The other half of a ladder: it has to be *a ladder*. If the team that just unlocked
    // the dungeon can walk to the bottom of it, the fifteen floors between are decoration.
    if (floors.length > 4) {
      const overreach = simulateStage(content, deepest.key, entry, RUNS);
      gates.push({
        name: `${dungeon.key}-wall`,
        detail: 'the deepest floor turns back an entry-level team at least 80% of the time',
        passed: overreach.winRate <= 0.2,
        measured: `${(overreach.winRate * 100).toFixed(1)}% got through`,
      });
    }
  }

  // ── Gate 3b: the intended XP farm has to be farmable ────────────────────
  // Brutal 12-6 is where ECONOMY §3 sends a levelling team, and multi-battle is how they
  // get there ten runs at a time. Winning is not enough: a farm that occasionally grinds
  // to forty turns is a farm nobody presses twice, so this gates the *distribution*
  // rather than the average (COMBAT_SYSTEM §14).
  const farmStage = campaignStages(content, 12, 'brutal').at(-2);
  if (farmStage) {
    const farm = simulateStage(content, farmStage.key, farmTeam(content), RUNS);
    table('Farmer + three food — Brutal 12-6', [farm]);
    gates.push({
      name: 'xp-farm-wins',
      detail: 'Brutal 12-6 falls to one carry and three food units at least 97% of the time',
      passed: farm.winRate >= 0.97,
      measured: `${(farm.winRate * 100).toFixed(1)}%`,
    });
    // Not a speed target — a *safety margin*. One champion grinding through four waves of
    // elites takes a while by construction, and nobody watches it (that is what
    // multi-battle is for). What must never happen is the fight creeping toward the
    // 300-turn cap, where a farm stops being a farm and starts being a coin flip.
    gates.push({
      name: 'xp-farm-speed',
      detail: 'and does it well inside the turn cap — 95% of runs under 200 turns',
      passed: farm.winsWithin(200) >= 0.95,
      measured: `${(farm.winsWithin(200) * 100).toFixed(1)}% within 200 turns`,
    });
  }

  // ── Gate 3c: the cold open is a drama beat, and drama beats can be measured ──
  // The first ninety seconds of the game. It has to be *won* — a new account that loses
  // the opening cinematic learns the wrong thing about it — and it has to be *close*,
  // because a fight won at full health teaches that the game is trivial. So both halves
  // are gated: content that makes the ambush harmless fails here, and so does content
  // that makes it lethal.
  const coldOpen = [...content.stages.values()].find(
    (stage) => stage.mode === 'tutorial' && stage.presetTeam.length > 0,
  );
  if (coldOpen) {
    const opening = simulateColdOpen(content, coldOpen.key, RUNS);
    table(`The cold open — ${coldOpen.key}, borrowed team`, [opening]);
    console.log(
      `  lowest health any champion reached: ${(opening.medianWorstHp * 100).toFixed(0)}% (median run)`,
    );
    gates.push({
      name: 'cold-open-wins',
      detail: 'the borrowed team wins the opening fight every time',
      passed: opening.winRate >= 1,
      measured: `${(opening.winRate * 100).toFixed(1)}%`,
    });
    gates.push({
      name: 'cold-open-hurts',
      detail: 'and somebody is taken to under two-thirds doing it — the beat is the point',
      passed: opening.medianWorstHp <= 0.65,
      measured: `driven to ${(opening.medianWorstHp * 100).toFixed(0)}%`,
    });
    gates.push({
      name: 'cold-open-survives',
      detail: 'without being a coin flip — nobody is driven under a sixth',
      passed: opening.medianWorstHp >= 0.15,
      measured: `driven to ${(opening.medianWorstHp * 100).toFixed(0)}%`,
    });
  }

  // ── Gate 3d: the Titan is a ladder, not a wall or a formality ───────────
  //
  // The one mode a win rate says nothing about, because it is authored so that nobody
  // wins. What has to be true instead is a *spread*: a fresh account gets paid something
  // on its first key, a built account climbs, and there is still a rung above what a
  // fully-built team manages — otherwise the mode has a ceiling and the puzzle is over.
  //
  // Priced against the sim's deliberately modest relic set (`FULL_RELICS`), so a real
  // endgame set with good substats does better than the numbers here — which is what
  // leaves the top rung reachable rather than theoretical.
  const titanKeep = [...content.dungeons.values()].find(
    (dungeon) => dungeon.kind === 'titan' && dungeon.titan,
  );
  const titanStage = titanKeep
    ? [...content.stages.values()].find(
        (stage) => stage.mode === 'titan' && stage.parentKey === titanKeep.key,
      )
    : undefined;
  if (titanKeep?.titan && titanStage) {
    const ladder = [...titanKeep.titan.tiers].sort((a, b) => a.damage - b.damage);
    const bottom = ladder[0];
    const top = ladder[ladder.length - 1];
    const cap = titanKeep.titan.turnCap;
    // Fewer runs than the campaign gates: a Titan run is fifty turns rather than a dozen,
    // and the spread it is measuring is an order of magnitude wide.
    const titanRuns = Math.max(40, Math.round(RUNS / 20));

    const fresh = simulateTitan(
      content,
      titanStage.key,
      parTeam(content).map((member) => ({ ...member, level: 30, rank: 4, ascension: 0 })),
      cap,
      titanRuns,
    );
    const built = simulateTitan(
      content,
      titanStage.key,
      withCollection(
        content,
        withRelics(
          content,
          parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 6 })),
        ),
      ),
      cap,
      titanRuns,
    );

    console.log(`\nThe Titan — ${titanStage.key}, ${cap}-turn cap, ${titanRuns} runs`);
    for (const [name, result] of [
      ['a fresh account', fresh],
      ['fully built', built],
    ] as const) {
      console.log(
        `  ${name.padEnd(16)} median ${result.medianDamage.toLocaleString()} · ` +
          `best ${result.bestDamage.toLocaleString()} · ` +
          `${(result.cappedRate * 100).toFixed(0)}% lasted the cap`,
      );
    }

    if (bottom && top) {
      gates.push({
        name: 'titan-survives',
        detail: 'nobody kills the Titan — it is a measuring stick, not a boss',
        passed: built.killRate === 0,
        measured: `${(built.killRate * 100).toFixed(1)}% killed it`,
      });
      gates.push({
        name: 'titan-entry-pays',
        detail: 'a fresh account reaches the bottom rung on a typical first key',
        passed: fresh.medianDamage >= bottom.damage,
        measured: `${fresh.medianDamage.toLocaleString()} vs ${bottom.damage.toLocaleString()}`,
      });
      gates.push({
        name: 'titan-rewards-investment',
        detail: 'and a fully built one is at least an order of magnitude past it',
        passed: built.medianDamage >= fresh.medianDamage * 10,
        measured: `${built.medianDamage.toLocaleString()} vs ${fresh.medianDamage.toLocaleString()}`,
      });
      gates.push({
        name: 'titan-keeps-a-ceiling',
        detail: 'with the top rung still above what a built team typically manages',
        passed: built.medianDamage < top.damage,
        measured: `${built.medianDamage.toLocaleString()} vs ${top.damage.toLocaleString()}`,
      });
    }
  }

  // ── Gate 3d-ii: the world boss needs a crowd, and pays a newcomer ───────
  //
  // A shared pool cannot be simulated — what empties it is a live population, and no
  // simulation has one. What *can* be checked is the two ends of the arithmetic the pool
  // was sized against, and both are claims the seed makes in prose:
  //
  //  - **It takes more than one warden.** A fully built account spending every strike of a
  //    whole wake must not get through the bar alone, or the mode is a Titan with a longer
  //    name and the felling chest is a solo reward.
  //  - **A newcomer's first day is worth something.** The bottom rung has to be inside a
  //    single day's strikes from a modest account, or turning up pays nothing and the
  //    ladder — which is the *reliable* payout — only exists for accounts already finished.
  const wakeKeep = [...content.dungeons.values()].find(
    (dungeon) => dungeon.kind === 'worldBoss' && dungeon.worldBoss,
  );
  const wakeStage = wakeKeep
    ? [...content.stages.values()].find(
        (stage) => stage.mode === 'worldBoss' && stage.parentKey === wakeKeep.key,
      )
    : undefined;
  if (wakeKeep?.worldBoss && wakeStage) {
    const rules = wakeKeep.worldBoss;
    const strikesInAWake =
      rules.attemptsPerDay * (rules.schedule.kind === 'weekly' ? rules.schedule.durationDays : 1);
    const wakeRuns = Math.max(20, Math.round(RUNS / 40));

    const builtStrike = simulateTitan(
      content,
      wakeStage.key,
      withCollection(
        content,
        withRelics(
          content,
          parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 6 })),
        ),
      ),
      rules.turnCap,
      wakeRuns,
    );
    const freshStrike = simulateTitan(
      content,
      wakeStage.key,
      parTeam(content).map((member) => ({ ...member, level: 30, rank: 4, ascension: 0 })),
      rules.turnCap,
      wakeRuns,
    );

    const soloWake = builtStrike.medianDamage * strikesInAWake;
    console.log(`\nThe Wurm Wakes — ${wakeStage.key}, ${rules.turnCap}-turn cap`);
    console.log(
      `  one strike: fresh ${freshStrike.medianDamage.toLocaleString()} · ` +
        `built ${builtStrike.medianDamage.toLocaleString()} · ` +
        `a built warden's whole wake ${soloWake.toLocaleString()} of ${rules.maxHp.toLocaleString()}`,
    );

    gates.push({
      name: 'worldboss-needs-a-crowd',
      detail: `${strikesInAWake} strikes from one fully built warden do not empty the pool`,
      passed: soloWake < rules.maxHp,
      measured: `${soloWake.toLocaleString()} vs ${rules.maxHp.toLocaleString()}`,
    });

    const bottom = [...rules.tiers].sort((a, b) => a.damage - b.damage)[0];
    if (bottom) {
      const freshDay = freshStrike.medianDamage * rules.attemptsPerDay;
      gates.push({
        name: 'worldboss-entry-pays',
        detail: `and a modest account reaches the bottom rung on its first day (${rules.attemptsPerDay} strikes)`,
        passed: freshDay >= bottom.damage,
        measured: `${freshDay.toLocaleString()} vs ${bottom.damage.toLocaleString()}`,
      });
    }
  }

  // ── Gate 3d-iii: the Mistspire's wards are climbable ────────────────────
  //
  // The tower's balance question is not "can a good team clear floor 27" — a good team can
  // clear anything. It is **"can the four best `hp`-role champions in the game clear floor
  // 27"**, because that is the only team the ward allows, and a ward only an impossible
  // team could pass is a wall rather than a puzzle.
  //
  // So every warded floor is fought by a team built *from the ward itself* — the best four
  // eligible champions, at the investment an account climbing that high plausibly has —
  // and the gate is that it wins. This is the one measurement that could not be reasoned
  // out: whether the `hp` role, which has six champions in the whole game and none of them
  // built to kill anything, can take down floor 27 inside its turn limit.
  //
  // The unwarded ends are checked too, and in the other direction: floor 1 has to be
  // clearable by a beginner, and floor 30 must not be.
  const spires = [...content.dungeons.values()].filter((dungeon) => dungeon.kind === 'spire');
  for (const spire of spires) {
    const floors = [...content.stages.values()]
      .filter((stage) => stage.mode === 'spire' && stage.parentKey === spire.key)
      .sort((a, b) => a.number - b.number);
    if (floors.length === 0) continue;

    console.log(`\n${spire.name} — ${floors.length} floors, ${SPIRE_RUNS} runs a floor`);

    // The ends of the tower — floor 1 is climbable, floor 30 is a wall to a beginner and
    // falls to a finished account — are **not** gated here. The generic dungeon loop above
    // asks exactly those three questions of every keep with floors, this one included, from
    // a fixture tied to the dungeon's own unlock level. Repeating them under different
    // names would be three more gates saying the same thing, and the one that drifted would
    // be the one nobody reconciled.
    //
    // What is gated here is what only the Mistspire has: the wards.
    const wardTurns: { floor: number; turns: number }[] = [];
    for (const floor of floors) {
      const ward = floor.teamRestriction;
      if (!ward) continue;
      // The investment an account at that height plausibly has: the tower is thirty floors
      // over a month, so a mid-tower ward meets a mid-built team and a late one a nearly
      // finished one. Deliberately **without** `withCollection` — a player who has just
      // levelled four hp-role champions to climb one floor does not have them imprinted.
      // At the floor's **own** level rather than at a guess about the calendar. A ward is
      // a fair fight or it is not, and "fair" means the four champions it allows, levelled
      // to what is standing in front of them. The first cut used `25 + floor`, which put a
      // level-28 team on a level-15 floor and reported every ward as a walkover.
      const level = Math.max(...floor.waves.flat().map((unit) => unit.level));
      const rank = Math.min(6, 3 + Math.floor(level / 12));
      const ascension = Math.min(6, Math.floor(level / 10));
      const bare = wardedTeam(content, ward, level, rank, ascension);
      // Two teams, for the same reason a trial is fought twice. **Geared** is somebody who
      // went and built the four champions the ward wants — they must get through, or the
      // ward is a wall. **Bare** is the same four pulled off the bench and levelled but
      // never geared, which is what a player does the first time a ward stops them — and
      // they must *not* get through, or the ward asked for nothing and the tower is a
      // corridor with signs on it.
      const geared = withRelics(content, bare);
      const gearedRun =
        bare.length === 4
          ? simulateStage(content, floor.key, geared, SPIRE_RUNS)
          : { winRate: 0, medianTurns: Number.NaN };
      const bareRun =
        bare.length === 4
          ? simulateStage(content, floor.key, bare, SPIRE_RUNS, 5_000)
          : { winRate: 1, medianTurns: Number.NaN };
      wardTurns.push({ floor: floor.number, turns: gearedRun.medianTurns });
      console.log(
        `  floor ${String(floor.number).padStart(2)} warded ${(ward.kind + '=' + ward.value).padEnd(20)} ` +
          `geared ${String((gearedRun.winRate * 100).toFixed(0)).padStart(3)}% in ${String(gearedRun.medianTurns).padStart(2)} turns · ` +
          `ungeared ${String((bareRun.winRate * 100).toFixed(0)).padStart(3)}%`,
      );
      gates.push({
        name: `spire-ward-climbable-f${floor.number}`,
        detail: `floor ${floor.number} (${ward.kind} ${ward.value}) falls to four built champions the ward allows`,
        passed: bare.length === 4 && gearedRun.winRate >= 0.8,
        measured:
          bare.length === 4
            ? `${(gearedRun.winRate * 100).toFixed(0)}% won`
            : `only ${bare.length} champions qualify`,
      });
      // Deliberately **not** gated on the ungeared team losing. Every campaign gate in this
      // game is at 100% too: Mistvale is tuned so that a team levelled to the content beats
      // the content, and demanding otherwise here would quietly make the tower the hardest
      // thing in the game. What the Mistspire asks for is *breadth* — four levelled hp-role
      // champions is already a large ask — so the gear check is reported, not enforced.
      if (bare.length === 4 && bareRun.winRate > 0.9 && gearedRun.medianTurns <= 3) {
        console.log(
          `      note: floor ${floor.number} is a formality at this investment (${gearedRun.medianTurns} turns)`,
        );
      }
    }

    // A tower has to *climb*. Per-floor turn counts vary with which four champions a ward
    // happens to allow — Mistvale's tide champions are simply better than its mist ones,
    // and that is a fact about the roster rather than a tuning error — so the gate is on
    // the shape of the whole tower rather than on any one floor of it.
    const shallow = wardTurns.filter((entry) => entry.floor <= 10);
    const deep = wardTurns.filter((entry) => entry.floor >= 20);
    if (shallow.length > 0 && deep.length > 0) {
      const mean = (rows: typeof wardTurns) =>
        rows.reduce((sum, row) => sum + (Number.isFinite(row.turns) ? row.turns : 0), 0) /
        rows.length;
      const low = mean(shallow);
      const high = mean(deep);
      gates.push({
        name: 'spire-climbs-in-difficulty',
        detail: 'the tower is meaningfully harder at the top than at the bottom',
        passed: high >= low * 3,
        measured: `${high.toFixed(0)} turns near the top vs ${low.toFixed(0)} near the bottom`,
      });
    }
  }

  // ── Gate 3e: a trial is a puzzle, and a puzzle has to be both ────────────
  //
  // Two things have to be true of every trial, and they pull against each other. It has to
  // be **fair** — the line it is authored around comes in at or under par — and it has to
  // be a **puzzle** — pressing Auto does not. A trial that fails the first is a wall; one
  // that fails the second is a stage with a longer name.
  //
  // Neither is sampled, because there is nothing to sample: a trial's battle seed is its
  // own stage key (`battle.start`), so every account opens the identical fight and one run
  // is the whole distribution. What is measured here is exactly what a player will see.
  const trials = [...content.stages.values()]
    .filter((stage) => stage.mode === 'trial')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (trials.length > 0) {
    console.log('\nTrials — the same fight for everybody, played two ways');
    for (const stage of trials) {
      const par = stage.trial?.parTurns ?? 0;
      const solution = TRIAL_SOLUTIONS[stage.key];
      const auto = simulateTrialOnAuto(content, stage.key);
      const solved = solution ? simulateTrial(content, stage.key, solution) : null;

      console.log(
        `  ${(stage.trial?.name ?? stage.key).padEnd(20)} par ${String(par).padStart(3)} · ` +
          `auto ${auto.won ? 'won' : 'lost'} in ${auto.turns} · ` +
          (solved ? `the line ${solved.won ? 'won' : 'lost'} in ${solved.turns}` : 'NO LINE'),
      );

      gates.push({
        name: `trial-fair-${stage.key}`,
        detail: `${stage.trial?.name ?? stage.key}: the authored line wins it inside par`,
        passed: solved !== null && solved.won && solved.turns <= par,
        measured: solved
          ? `${solved.won ? 'won' : 'lost'} in ${solved.turns} vs par ${par}`
          : 'no line authored for this trial',
      });
      gates.push({
        name: `trial-puzzle-${stage.key}`,
        detail: `${stage.trial?.name ?? stage.key}: and auto-battle does not`,
        passed: !auto.won || auto.turns > par,
        measured: `auto ${auto.won ? `won in ${auto.turns}` : 'lost'} vs par ${par}`,
      });
    }
  }

  // ── Gate 3f: every champion pulls its weight, for its role ──────────────
  //
  // COMBAT_SYSTEM §14 has asked for this since P2 and the repo could not answer it: the
  // gate wants every champion inside a band of its *role's* benchmark, and nothing here
  // could measure what one champion contributes. `contributions()` (C21) reads it off the
  // event log and `packages/sim` (C27) is where a measurement both CI and the Admin
  // sandbox can call belongs, so the two halves finally met.
  //
  // The score is **turns to clear the bench**, and that was settled by measurement rather
  // than by argument — see `benchmark.ts`, which records why the obvious per-role figures
  // do not work (six of Mistvale's ten supports neither heal nor shield).
  //
  // **What is gated is not the documented 85–115% band**, and that is deliberate rather
  // than a shortfall. The roster has never been tuned against this measurement, so ten of
  // the thirty-seven sit outside that band today — which is the champion pass the roadmap
  // has always said this waits for, and a balance decision about a live game is the
  // owner's rather than a side effect of building the instrument (USER_QUESTIONS Q9).
  // What is enforced is the three statements that hold whatever the owner decides about
  // tuning: the bench fight is still winnable, every champion still does something, and
  // nobody has become an outlier by an order only a bug produces. The table below is what
  // the champion pass reads.
  const benchSetup: BenchSetup = {
    stageKey: BENCHMARK_STAGE,
    level: 60,
    rank: 6,
    ascension: 6,
    runs: BENCHMARK_RUNS,
  };
  const benchStage = content.stages.get(BENCHMARK_STAGE);
  if (benchStage) {
    console.log(`\nChampions — turns to clear ${BENCHMARK_STAGE} beside a fixed trio`);
    const bands = benchmarkRoster(content, benchSetup);
    for (const band of bands) {
      console.log(
        `  ${band.role} — median ${band.medianTurns.toFixed(1)} turns over ${band.members.length} champions`,
      );
      for (const row of band.members) {
        const index = roleIndex(row, band);
        console.log(
          `    ${row.name.padEnd(28)} ${row.turnsToClear.toFixed(1).padStart(5)}t ` +
            `${index.toFixed(0).padStart(4)}%  win ${(row.winRate * 100).toFixed(0).padStart(3)}%  ` +
            `dmg/t ${row.damagePerTurn.toFixed(0).padStart(5)}  sus/t ${row.sustainPerTurn.toFixed(0).padStart(5)}`,
        );
      }
    }

    const everyone = bands.flatMap((band) => band.members);

    // The bench itself, rather than any champion on it. If a content change made the last
    // Brutal stage unwinnable at this investment, every turn count above would be a `NaN`
    // and the two gates under it would be measuring nothing — so this is what keeps them
    // honest, and it is why it is stated as a fact about the fight and not about a name.
    const stuck = everyone.filter((row) => row.winRate < 0.95);
    gates.push({
      name: 'champion-bench-holds',
      detail: `${BENCHMARK_STAGE} is still a fight a built team wins, so the turn counts mean something`,
      passed: stuck.length === 0,
      measured:
        stuck.length === 0
          ? `${everyone.length} champions, all clearing`
          : `${stuck.length} teams did not clear (worst ${Math.min(...stuck.map((row) => row.winRate * 100)).toFixed(0)}%)`,
    });

    // Nobody is inert. Damage *or* healing *or* shielding, because all three are real work
    // and a pure healer with no damage is a champion somebody may legitimately author one
    // day — a gate that demanded damage would refuse them. What it refuses is a champion
    // that did none of the three, which is a broken kit rather than a weak one.
    const idle = everyone.filter(
      (row) => row.damagePerTurn + row.sustainPerTurn <= 0 || row.survivalRate <= 0,
    );
    gates.push({
      name: 'champion-does-something',
      detail: 'every champion deals damage, heals or shields, and survives some of the time',
      passed: idle.length === 0,
      measured:
        idle.length === 0
          ? `weakest contribution ${Math.min(...everyone.map((row) => row.damagePerTurn + row.sustainPerTurn)).toFixed(0)}/turn`
          : idle.map((row) => row.name).join(', '),
    });

    const outliers = bands.flatMap((band) =>
      band.members
        .map((row) => ({ row, index: roleIndex(row, band) }))
        .filter(({ index }) => index > OUTLIER_HIGH),
    );
    const spread = bands.flatMap((band) => band.members.map((row) => roleIndex(row, band)));
    gates.push({
      name: 'champion-role-outlier',
      detail: `no champion is more than ${OUTLIER_HIGH}% of its role's median`,
      passed: outliers.length === 0,
      measured:
        outliers.length === 0
          ? `roster spans ${Math.min(...spread).toFixed(0)}–${Math.max(...spread).toFixed(0)}%`
          : outliers.map(({ row, index }) => `${row.name} ${index.toFixed(0)}%`).join(', '),
    });
  }

  // ── Gate 3g: nobody is mandatory in the Arena ───────────────────────────
  //
  // The other half of §14's champion gate, and it asks a different question from the bench
  // above: not "how much faster does the wall fall with this champion" but "with power held
  // equal, does one name keep turning up on the winning side".
  //
  // **It is not the 40%-of-winning-comps figure the doc names**, and that is arithmetic
  // rather than a shortcut. A champion fills 4 of 37 comp slots, so it appears in 10.8% of
  // random comps; every battle produces exactly one winner, so half of all comps win. A
  // champion that won *every fight it ever appeared in* would still appear in only
  // 0.108 / 0.5 = 21.6% of winning comps. The line could never be crossed. That figure
  // means what it means in a metagame where players *choose* their comps; here they are
  // drawn, so the same question is asked in the form drawn comps can answer.
  const arenaSetup: ArenaSetup = {
    level: 60,
    rank: 6,
    ascension: 6,
    pairings: ARENA_PAIRINGS,
  };
  const arena = arenaDiversity(content, arenaSetup);
  if (arena.battles > 0) {
    console.log(`\nThe Arena — ${arena.battles} battles between random comps at equal power`);
    for (const band of arena.roles) {
      console.log(
        `  ${band.role.padEnd(9)} ${(band.winRate * 100).toFixed(1).padStart(5)}%  ` +
          `over ${band.champions} champions and ${band.battles} battles`,
      );
    }
    console.log('  strongest and weakest, for the record rather than for a gate:');
    for (const row of [...arena.champions.slice(0, 3), ...arena.champions.slice(-3)]) {
      console.log(
        `    ${row.name.padEnd(28)} ${(row.winRate * 100).toFixed(1).padStart(5)}%  ` +
          `${row.wins}/${row.battles}  ${row.role}`,
      );
    }

    const offRoles = arena.roles.filter((band) => band.winRate * 100 > ARENA_ROLE_HIGH);
    gates.push({
      name: 'arena-no-role-is-mandatory',
      detail: `no role wins more than ${ARENA_ROLE_HIGH}% of its Arena battles at equal power`,
      passed: offRoles.length === 0,
      measured:
        offRoles.length === 0
          ? arena.roles.map((band) => `${band.role} ${(band.winRate * 100).toFixed(0)}%`).join(', ')
          : offRoles.map((band) => `${band.role} ${(band.winRate * 100).toFixed(1)}%`).join(', '),
    });

    // A self-check on the *draw* rather than on the content, and the one thing about this
    // harness that can silently go wrong: if the comps stopped being drawn at random the
    // table would still print, still be sorted, and be about four champions. There is
    // deliberately no gate on the median — every battle has exactly one winner and each
    // pairing is fought both ways, so the middle champion sits at half whatever the fold
    // does, which makes it a tautology rather than a check.
    const unfought = arena.champions.filter((row) => row.battles === 0);
    gates.push({
      name: 'arena-every-champion-is-drawn',
      detail: 'every champion is fielded by the comp draw, so the table is about the roster',
      passed: unfought.length === 0,
      measured:
        unfought.length === 0
          ? `${arena.champions.length} champions, fewest ${Math.min(...arena.champions.map((row) => row.battles))} battles`
          : `${unfought.length} champions never fought`,
    });
  }

  // ── Gate 4: the headless performance budget ─────────────────────────────
  const perf = simulateStage(content, opening[0]!.key, parTeam(content), Math.max(RUNS, 100));
  gates.push({
    name: 'performance',
    detail: 'a campaign stage resolves headless in under 20 ms',
    passed: perf.msPerRun < 20,
    measured: `${perf.msPerRun.toFixed(2)} ms/run`,
  });

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(`\nGates (${RUNS} runs per scenario, seeds 1…${RUNS})`);
  let failed = 0;
  for (const gate of gates) {
    const mark = gate.passed ? 'PASS' : 'FAIL';
    if (!gate.passed) failed += 1;
    console.log(`  [${mark}] ${gate.name} — ${gate.detail} (${gate.measured})`);
  }

  if (failed > 0) {
    console.error(`\n${failed} gate(s) failed. Chapter 1 is not tuned for a fresh account.`);
    process.exit(1);
  }
  console.log('\nAll gates pass.');
}

main();
