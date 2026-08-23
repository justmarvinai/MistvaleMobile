import {
  campaignStages,
  dungeonFloors,
  loadContent,
  simulateColdOpen,
  simulateStage,
  simulateTitan,
  starterKeys,
  withRelics,
  type LoadedContent,
  type StageResult,
  type TeamSpec,
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
    const maxed = withRelics(
      content,
      parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 6 })),
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
    // A Titan is a `dungeon` entity because that is where everything else about it fits,
    // but "does the deepest floor fall" is not a question about it: it is authored so
    // that nobody clears it. Its own gates are below.
    if (dungeon.kind === 'titan') continue;
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
    const maxed = withRelics(
      content,
      parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 4 })),
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
      withRelics(
        content,
        parTeam(content).map((member) => ({ ...member, level: 60, rank: 6, ascension: 6 })),
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
