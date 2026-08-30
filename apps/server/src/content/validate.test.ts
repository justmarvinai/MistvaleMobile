import { describe, expect, it } from 'vitest';
import type { ContentType } from '@mistvale/shared';
import { validateAndNormalise, validateContentSet, type ContentSet } from './validate';

/**
 * Validator unit tests.
 *
 * The validator is the only thing standing between an editor's mistake and a broken live
 * game, so each rule it enforces is pinned here independently of the database.
 */

function setOf(entries: Record<string, Record<string, unknown>>): ContentSet {
  const content: ContentSet = new Map();
  for (const [contentType, entities] of Object.entries(entries)) {
    content.set(contentType as ContentType, new Map(Object.entries(entities)));
  }
  return content;
}

const faction = { key: 'testers', name: 'Testers', lore: '', icon: '', sortOrder: 0 };

const asset = {
  key: 'test_asset',
  kind: 'unit',
  source: 'repo',
  basePath: 'test',
  tracks: {},
  stillPath: '',
  avatarPath: '',
  sortOrder: 0,
};

const skill = {
  key: 'test_a1',
  name: 'Strike',
  description: '',
  slot: 'a1',
  cooldown: 0,
  targeting: { side: 'enemy', mode: 'single' },
  components: [{ type: 'damage', scale: 'atk', mult: 2, hits: 1 }],
  upgrades: [],
  aiHints: {},
  animation: { track: 'attack' },
  sortOrder: 0,
};

const champion = {
  key: 'hero',
  name: 'Hero',
  title: '',
  lore: '',
  factionKey: 'testers',
  element: 'ember',
  rarity: 'rare',
  role: 'attack',
  baseStats: {
    hp: 15000,
    atk: 1000,
    def: 900,
    spd: 100,
    critRate: 15,
    critDmg: 50,
    res: 30,
    acc: 0,
  },
  skills: ['test_a1'],
  aura: null,
  assetKey: 'test_asset',
  isFood: false,
  summonable: true,
  starter: false,
  balanceVersion: 1,
  sortOrder: 0,
};

const validSet = () =>
  setOf({
    faction: { testers: faction },
    asset: { test_asset: asset },
    skill: { test_a1: skill },
    champion: { hero: champion },
  });

describe('validateContentSet', () => {
  it('accepts a complete, consistent set', () => {
    const result = validateContentSet(validSet());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.checked).toBe(4);
  });

  it('accepts an empty set', () => {
    const result = validateContentSet(new Map());
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  describe('shape', () => {
    it('reports field-level schema failures', () => {
      const content = setOf({
        champion: { hero: { ...champion, baseStats: { ...champion.baseStats, spd: 9_999 } } },
      });
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors[0]?.path).toContain('baseStats.spd');
    });

    it('catches an entity stored under a key that disagrees with its own', () => {
      const content = setOf({ faction: { wrong_key: faction } });
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors[0]?.message).toMatch(/declares key/i);
    });
  });

  describe('references', () => {
    it.each([
      ['faction', { ...champion, factionKey: 'ghosts' }],
      ['asset', { ...champion, assetKey: 'missing_asset' }],
      ['skill', { ...champion, skills: ['no_such_skill'] }],
    ])('rejects a champion pointing at a missing %s', (_label, broken) => {
      const content = validSet();
      content.get('champion')?.set('hero', broken);
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors.some((issue) => /does not exist/i.test(issue.message))).toBe(true);
    });

    it('rejects a skill applying a status nobody defined', () => {
      const content = validSet();
      content.get('skill')?.set('test_a1', {
        ...skill,
        components: [
          { type: 'damage', scale: 'atk', mult: 2, hits: 1 },
          { type: 'applyStatus', status: 'imaginary_curse', turns: 2, target: 'hitTargets' },
        ],
      });
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors[0]?.path).toMatch(/components\.1\.status/);
    });

    it('rejects a stage whose wave names an unknown enemy', () => {
      const content = validSet();
      content.set(
        'campaignChapter',
        new Map([
          [
            'ch1',
            {
              key: 'ch1',
              number: 1,
              name: 'One',
              region: '',
              lore: '',
              backgroundAsset: '',
              starRewards: [],
              sortOrder: 0,
            },
          ],
        ]),
      );
      content.set(
        'stage',
        new Map([
          [
            's1',
            {
              key: 's1',
              mode: 'campaign',
              parentKey: 'ch1',
              number: 1,
              difficulty: 'normal',
              energyCost: 4,
              waves: [[{ enemyKey: 'nobody', level: 3, stars: 1, slot: 0 }]],
              rewards: { silverMin: 1, silverMax: 2, playerXp: 1, championXp: 1 },
              starRules: { noDeaths: true, maxTurns: 12 },
              firstClearRewards: {},
              unlock: {},
              sortOrder: 0,
            },
          ],
        ]),
      );

      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors.some((issue) => issue.contentType === 'stage')).toBe(true);
    });

    /**
     * Reward maps are flat `{silver: 5000, sigil_gleaming: 1}`, which is what makes them
     * pleasant to author and what makes a typo invisible: the payout would hand over
     * nothing and nobody would find out from an error.
     */
    describe('reward maps', () => {
      const questWith = (rewards: Record<string, number>): ContentSet => {
        const content = validSet();
        content.set(
          'quest',
          new Map([
            [
              'q1',
              {
                key: 'q1',
                name: 'A quest',
                description: '',
                period: 'daily',
                goals: [{ type: 'battleWin', target: 3, filters: {} }],
                rewards,
                countsTowardChest: true,
                unlockLevel: 1,
                icon: '',
                active: true,
                sortOrder: 0,
              },
            ],
          ]),
        );
        return content;
      };

      it('accepts currencies and account XP without an item anywhere in sight', () => {
        const result = validateContentSet(questWith({ silver: 5_000, playerXp: 100 }));
        expect(result.ok, JSON.stringify(result.errors)).toBe(true);
      });

      it('rejects a reward naming an item that does not exist', () => {
        const result = validateContentSet(questWith({ sigil_gleeming: 1 }));
        expect(result.ok).toBe(false);
        expect(result.errors[0]?.path).toBe('rewards.sigil_gleeming');
      });

      it('rejects a first-clear reward naming a missing item', () => {
        const content = validSet();
        content.set(
          'campaignChapter',
          new Map([
            [
              'ch1',
              {
                key: 'ch1',
                number: 1,
                name: 'One',
                region: '',
                lore: '',
                backgroundAsset: '',
                starRewards: [{ stars: 9, rewards: { tome_imaginary: 1 } }],
                sortOrder: 0,
              },
            ],
          ]),
        );
        const result = validateContentSet(content);
        expect(result.ok).toBe(false);
        expect(result.errors[0]?.path).toBe('starRewards.0.rewards.tome_imaginary');
      });

      it('rejects a goal filtered on a dungeon nobody defined', () => {
        // A quest that asks for fifteen floors of a keep that was renamed is a quest
        // nobody can finish, which is worse than one nobody was offered.
        const content = validSet();
        content.set(
          'quest',
          new Map([
            [
              'q1',
              {
                key: 'q1',
                name: 'A quest',
                description: '',
                period: 'weekly',
                goals: [
                  { type: 'dungeonClear', target: 3, filters: { dungeonKey: 'keep_of_nowhere' } },
                ],
                rewards: {},
                countsTowardChest: true,
                unlockLevel: 1,
                icon: '',
                active: true,
                sortOrder: 0,
              },
            ],
          ]),
        );
        const result = validateContentSet(content);
        expect(result.ok).toBe(false);
        expect(result.errors[0]?.path).toBe('goals.0.filters.dungeonKey');
      });
    });

    it('rejects two enemies sharing a slot in one wave', () => {
      const content = validSet();
      content.set(
        'enemy',
        new Map([
          [
            'grunt',
            {
              key: 'grunt',
              name: 'Grunt',
              archetype: 'grunt',
              element: 'ember',
              role: 'attack',
              baseStats: {
                hp: 1000,
                atk: 100,
                def: 100,
                spd: 90,
                critRate: 15,
                critDmg: 50,
                res: 20,
                acc: 0,
              },
              growth: 1.045,
              skills: ['test_a1'],
              assetKey: 'test_asset',
              isBoss: false,
              bossMechanics: { almightyImmunity: false, tmReductionImmune: false },
              sortOrder: 0,
            },
          ],
        ]),
      );
      content.set(
        'campaignChapter',
        new Map([
          [
            'ch1',
            {
              key: 'ch1',
              number: 1,
              name: 'One',
              region: '',
              lore: '',
              backgroundAsset: '',
              starRewards: [],
              sortOrder: 0,
            },
          ],
        ]),
      );
      content.set(
        'stage',
        new Map([
          [
            's1',
            {
              key: 's1',
              mode: 'campaign',
              parentKey: 'ch1',
              number: 1,
              difficulty: 'normal',
              energyCost: 4,
              waves: [
                [
                  { enemyKey: 'grunt', level: 3, stars: 1, slot: 0 },
                  { enemyKey: 'grunt', level: 3, stars: 1, slot: 0 },
                ],
              ],
              rewards: { silverMin: 1, silverMax: 2, playerXp: 1, championXp: 1 },
              starRules: { noDeaths: true, maxTurns: 12 },
              firstClearRewards: {},
              unlock: {},
              sortOrder: 0,
            },
          ],
        ]),
      );

      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors.some((issue) => /occupy slot/i.test(issue.message))).toBe(true);
    });
  });

  describe('engine registry', () => {
    it('rejects a status mapped to a behaviour the engine lacks', () => {
      const content = validSet();
      content.set(
        'status',
        new Map([
          [
            'weird',
            {
              key: 'weird',
              name: 'Weird',
              kind: 'buff',
              engineType: 'timeTravel',
              family: 'weird',
              potency: 1,
              params: { tick: 'none', maxStacks: 1 },
              icon: '',
              description: '',
              sortOrder: 0,
            },
          ],
        ]),
      );

      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
    });
  });

  describe('design rules', () => {
    it('rejects an A1 with a cooldown', () => {
      const content = validSet();
      content.get('skill')?.set('test_a1', { ...skill, cooldown: 3 });
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors[0]?.message).toMatch(/no cooldown/i);
    });

    it('warns, without blocking, when a Legendary kit looks thin', () => {
      const content = validSet();
      content.get('champion')?.set('hero', { ...champion, rarity: 'legendary' });
      const result = validateContentSet(content);
      expect(result.ok).toBe(true);
      expect(result.warnings.some((issue) => /at least 4 skills/i.test(issue.message))).toBe(true);
    });

    it('does not apply the kit-depth rule to food units', () => {
      const content = validSet();
      content.get('champion')?.set('hero', { ...champion, rarity: 'legendary', isFood: true });
      const result = validateContentSet(content);
      expect(result.warnings.some((issue) => /at least 4 skills/i.test(issue.message))).toBe(false);
    });

    it('warns when nothing is summonable', () => {
      const content = validSet();
      content.get('champion')?.set('hero', { ...champion, summonable: false });
      const result = validateContentSet(content);
      expect(result.ok).toBe(true);
      expect(result.warnings.some((issue) => /empty pool/i.test(issue.message))).toBe(true);
    });
  });

  describe('normalisation', () => {
    it('fills schema defaults so stored content never depends on how it was authored', () => {
      const authored = {
        key: 'test_a1',
        name: 'Sparse',
        slot: 'a1',
        targeting: { side: 'enemy', mode: 'single' },
        // No hits, no description, no cooldown, no upgrades, no aiHints, no animation.
        components: [{ type: 'damage', scale: 'atk', mult: 2 }],
      };

      const content = validSet();
      content.get('skill')?.set('test_a1', authored);
      const { result, normalised } = validateAndNormalise(content);

      expect(result.ok).toBe(true);
      const stored = normalised.get('skill')?.get('test_a1') as {
        components: { hits: number }[];
        cooldown: number;
        upgrades: unknown[];
        animation: { track: string };
      };
      expect(stored.components[0]?.hits).toBe(1);
      expect(stored.cooldown).toBe(0);
      expect(stored.upgrades).toEqual([]);
      expect(stored.animation.track).toBe('attack');
    });

    it('normalises the sparse and the explicit form to the same stored shape', () => {
      const sparse = validSet();
      sparse.get('skill')?.set('test_a1', {
        key: 'test_a1',
        name: 'Strike',
        slot: 'a1',
        targeting: { side: 'enemy', mode: 'single' },
        components: [{ type: 'damage', scale: 'atk', mult: 2 }],
      });

      const explicit = validSet();
      explicit.get('skill')?.set('test_a1', {
        ...skill,
        name: 'Strike',
        components: [{ type: 'damage', scale: 'atk', mult: 2, hits: 1 }],
      });

      const fromSparse = validateAndNormalise(sparse).normalised.get('skill')?.get('test_a1');
      const fromExplicit = validateAndNormalise(explicit).normalised.get('skill')?.get('test_a1');

      expect(fromSparse).toBeDefined();
      expect(fromSparse).toEqual(fromExplicit);
    });

    it('leaves entities that failed to parse out of the normalised set', () => {
      const content = setOf({ faction: { testers: { ...faction, sortOrder: 'nope' } } });
      const { result, normalised } = validateAndNormalise(content);
      expect(result.ok).toBe(false);
      expect(normalised.get('faction')?.has('testers')).toBe(false);
    });
  });

  describe('a borrowed team', () => {
    const coldOpen = (over: Record<string, unknown> = {}) => ({
      key: 'tut_open',
      sortOrder: 0,
      mode: 'tutorial',
      parentKey: 'chapter_01',
      number: 1,
      difficulty: 'normal',
      energyCost: 0,
      waves: [[{ enemyKey: 'test_enemy', level: 5, stars: 1, slot: 0 }]],
      rewards: { silverMin: 0, silverMax: 0, playerXp: 0, championXp: 0 },
      starRules: { noDeaths: false, maxTurns: 60 },
      presetTeam: [{ championKey: 'hero', level: 10, rank: 2, ascension: 0, relics: [] }],
      ...over,
    });

    const enemy = {
      key: 'test_enemy',
      name: 'Ambusher',
      archetype: 'grunt',
      element: 'verdant',
      role: 'attack',
      baseStats: {
        hp: 9000,
        atk: 700,
        def: 600,
        spd: 90,
        critRate: 15,
        critDmg: 50,
        res: 30,
        acc: 0,
      },
      growth: 1.045,
      skills: ['test_a1'],
      assetKey: 'test_asset',
      isBoss: false,
      bossMechanics: { almightyImmunity: false, tmReductionImmune: false },
      sortOrder: 0,
    };

    const withStage = (stage: Record<string, unknown>) => {
      const content = validSet();
      content.set('enemy', new Map([['test_enemy', enemy]]));
      content.set('stage', new Map([[String(stage.key), stage]]));
      return content;
    };

    it('accepts a tutorial stage that brings its own team', () => {
      const result = validateContentSet(withStage(coldOpen()));
      expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    });

    it('refuses a tutorial stage with nobody to fight with', () => {
      const result = validateContentSet(withStage(coldOpen({ presetTeam: [] })));
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => /carries nobody/.test(error.message))).toBe(true);
    });

    it('refuses a borrowed team on any other kind of stage', () => {
      const result = validateContentSet(
        withStage(coldOpen({ key: 'c99_s1_normal', mode: 'campaign', energyCost: 4 })),
      );
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => /Only a tutorial or trial stage/.test(error.message)),
      ).toBe(true);
    });

    it('refuses a trial that carries no par — the par is what makes it a trial', () => {
      const result = validateContentSet(
        withStage(coldOpen({ key: 'trial_x', mode: 'trial', energyCost: 0 })),
      );
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => /needs a par/.test(error.message))).toBe(true);
    });

    it('refuses a par on a stage that is not a trial', () => {
      const result = validateContentSet(
        withStage(
          coldOpen({
            trial: { name: 'Not a trial', parTurns: 10, parRewards: {}, hint: '' },
          }),
        ),
      );
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => /Only a trial stage carries a par/.test(error.message)),
      ).toBe(true);
    });

    it('refuses a borrowed champion nobody published', () => {
      const result = validateContentSet(
        withStage(coldOpen({ presetTeam: [{ championKey: 'nobody', relics: [] }] })),
      );
      expect(result.ok).toBe(false);
    });

    it('refuses a borrowed relic from a set nobody published', () => {
      const result = validateContentSet(
        withStage(
          coldOpen({
            presetTeam: [
              {
                championKey: 'hero',
                relics: [{ setKey: 'nothing', slot: 'weapon', rank: 2, rarity: 'rare' }],
              },
            ],
          }),
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('the tutorial script', () => {
    const tutorialStep = (step: number, over: Record<string, unknown> = {}) => ({
      key: `tut_${step}`,
      sortOrder: step,
      step,
      screen: 'haven',
      highlight: '',
      title: `Step ${step}`,
      body: 'Words.',
      rewards: {},
      grantsBefore: {},
      active: true,
      ...over,
    });

    it('accepts a script numbered 1…n', () => {
      const content = setOf({
        tutorialStep: { tut_1: tutorialStep(1), tut_2: tutorialStep(2), tut_3: tutorialStep(3) },
      });
      expect(validateContentSet(content).ok).toBe(true);
    });

    it('refuses a gap, because the script is walked by position', () => {
      const content = setOf({
        tutorialStep: { tut_1: tutorialStep(1), tut_3: tutorialStep(3) },
      });
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => /Step 2 is missing/.test(error.message))).toBe(true);
    });

    it('refuses two steps claiming the same number', () => {
      const content = setOf({
        tutorialStep: { tut_1: tutorialStep(1), tut_1b: tutorialStep(1, { key: 'tut_1b' }) },
      });
      const result = validateContentSet(content);
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => /appears twice/.test(error.message))).toBe(true);
    });

    it('refuses a step paying an item that does not exist', () => {
      const content = setOf({
        tutorialStep: { tut_1: tutorialStep(1, { rewards: { sigil_imaginary: 1 } }) },
      });
      expect(validateContentSet(content).ok).toBe(false);
    });

    it('refuses a goal filter the goal type does not understand', () => {
      const content = setOf({
        tutorialStep: {
          tut_1: tutorialStep(1, {
            goal: { type: 'summon', target: 1, filters: { mode: 'campaign' } },
          }),
        },
      });
      expect(validateContentSet(content).ok).toBe(false);
    });
  });

  /**
   * The mastery board's two rules.
   *
   * The second is the interesting one, and it is the Mistspire ward's rule in another
   * costume: content validated against the rules that *consume* it rather than against
   * itself. A tree can hold a node at every tier and still strand every build in the game.
   */
  describe('the mastery board', () => {
    const node = (tree: string, tier: number, index: number) => ({
      key: `${tree}_t${tier}_${index}`,
      sortOrder: 0,
      name: `${tree} ${tier}.${index}`,
      description: '',
      tree,
      tier,
      icon: '',
      effects: [{ type: 'stat', stat: 'atk', flat: 10, pct: 0 }],
    });

    /**
     * A board with a given number of nodes at every tier, per tree.
     *
     * Per tree rather than one figure for all three, because the rule under test is about
     * *pairs*: a board where one pair works and another does not is the case that separates
     * "some pair can fill a build" from "every pair can", and a uniform board cannot
     * express it.
     */
    const board = (
      perTier: number | Record<string, number>,
    ): Record<string, Record<string, unknown>> => {
      const out: Record<string, Record<string, unknown>> = {};
      for (const tree of ['onslaught', 'bulwark', 'insight']) {
        const count = typeof perTier === 'number' ? perTier : (perTier[tree] ?? 0);
        for (let tier = 1; tier <= 6; tier += 1) {
          for (let index = 0; index < count; index += 1) {
            const entity = node(tree, tier, index);
            out[entity.key] = entity;
          }
        }
      }
      return out;
    };

    it('accepts a board every pair of trees can fill', () => {
      // Two per tier is enough for every tier's allowance across a pair: the largest is 3.
      const result = validateContentSet(setOf({ mastery: board(2) }));
      expect(result.errors.filter((issue) => issue.contentType === 'mastery')).toEqual([]);
    });

    it('refuses a tree missing a whole tier', () => {
      const nodes = board(2);
      for (const key of Object.keys(nodes)) if (key.startsWith('bulwark_t4')) delete nodes[key];
      const result = validateContentSet(setOf({ mastery: nodes }));
      expect(result.ok).toBe(false);
      expect(result.errors.some((issue) => issue.message.includes('no tier 4 mastery'))).toBe(true);
    });

    it('refuses a board no pair of trees can fill, even with every tier populated', () => {
      // One node per tier per tree: every tree passes the dead-end check, and every pair
      // still supplies only 2 where tiers 2–5 allow 3. Nobody could ever finish a build,
      // and nothing on the board would say why.
      const result = validateContentSet(setOf({ mastery: board(1) }));
      expect(result.ok).toBe(false);
      const issue = result.errors.find((entry) => entry.key === 'mastery_build');
      expect(issue?.message).toContain('No pair of trees');
      expect(issue?.message).toContain('tier 2');
    });

    it('accepts a board where a pair does not work, since the player picks the pair', () => {
      // Onslaught and bulwark are one node per tier, so *that* pair supplies 2 where tiers
      // 2–5 allow 3 and could never finish a build. Either of them with insight supplies 4.
      // A player chooses the pair, so this content is specialised rather than broken —
      // refusing it would refuse a deliberate design.
      const result = validateContentSet(
        setOf({ mastery: board({ onslaught: 1, bulwark: 1, insight: 3 }) }),
      );
      expect(result.errors.filter((issue) => issue.key === 'mastery_build')).toEqual([]);
    });

    it('says nothing at all about masteries when none are published', () => {
      // A partial content set is an ordinary state mid-authoring; the board's rules are
      // about a board that exists.
      const result = validateContentSet(setOf({ faction: { testers: faction } }));
      expect(result.errors.filter((issue) => issue.contentType === 'mastery')).toEqual([]);
    });
  });

  /**
   * The Vale Pass's publish rules, which are all of the same kind: a season that publishes
   * cleanly, looks right in the editor, and is wrong in a way only the rules that *consume*
   * it can see. The Mistspire ward's lesson (C11) on a third content family.
   */
  describe('the Vale Pass', () => {
    const season = (overrides: Record<string, unknown> = {}) => ({
      key: 'pass_test',
      sortOrder: 0,
      name: 'Test Season',
      description: '',
      bannerAsset: '',
      schedule: { kind: 'monthly' },
      pointRules: [{ type: 'battleWin', points: 10, label: '', filters: {} }],
      tiers: [
        { points: 100, free: { silver: 1000 }, premium: { crystals: 10 } },
        { points: 200, free: { silver: 2000 }, premium: { crystals: 20 } },
      ],
      unlockCost: 500,
      dailyPointCap: 600,
      unlockLevel: 1,
      active: true,
      ...overrides,
    });

    const problems = (overrides: Record<string, unknown> = {}) =>
      validateContentSet(setOf({ valePass: { pass_test: season(overrides) } })).errors.filter(
        (issue) => issue.contentType === 'valePass',
      );

    it('accepts a season that climbs and pays on both columns', () => {
      expect(problems()).toEqual([]);
    });

    it('refuses a ladder that does not climb', () => {
      const errors = problems({
        tiers: [
          { points: 200, free: { silver: 1 }, premium: {} },
          { points: 200, free: { silver: 2 }, premium: {} },
        ],
      });
      expect(errors.some((issue) => issue.message.includes('climb'))).toBe(true);
    });

    it('refuses a tier that pays nothing on either column', () => {
      const errors = problems({
        tiers: [
          { points: 100, free: { silver: 1 }, premium: {} },
          { points: 200, free: {}, premium: {} },
        ],
      });
      expect(errors.some((issue) => issue.path === 'tiers.1')).toBe(true);
    });

    it('refuses a season whose free column pays nothing at all', () => {
      // A paywall wearing a ladder, on a game with no payments. It is exactly the shape an
      // operator produces by filling the premium column first and running out of evening.
      const errors = problems({
        tiers: [
          { points: 100, free: {}, premium: { crystals: 10 } },
          { points: 200, free: {}, premium: { crystals: 20 } },
        ],
      });
      expect(errors.some((issue) => issue.message.includes('behind a purchase'))).toBe(true);
    });

    it('refuses a price for a column with nothing in it', () => {
      const errors = problems({
        tiers: [
          { points: 100, free: { silver: 1 }, premium: {} },
          { points: 200, free: { silver: 2 }, premium: {} },
        ],
        unlockCost: 500,
      });
      expect(errors.some((issue) => issue.path === 'unlockCost')).toBe(true);
    });

    it('accepts a free season — an unlock cost of zero opens the column', () => {
      expect(
        problems({
          tiers: [
            { points: 100, free: { silver: 1 }, premium: {} },
            { points: 200, free: { silver: 2 }, premium: {} },
          ],
          unlockCost: 0,
        }),
      ).toEqual([]);
    });

    it('refuses a point rule on a high-water mark, which would pay forever', () => {
      // `accountLevel` is appended to *every* report batch by the fan-out, so a rule on it
      // pays its points on every action a player ever takes. It publishes cleanly and looks
      // exactly right in the editor — which is the whole reason this rule exists.
      const errors = problems({
        pointRules: [{ type: 'accountLevel', points: 10, label: '', filters: {} }],
      });
      expect(errors.some((issue) => issue.message.includes('high-water mark'))).toBe(true);
    });

    it('holds an event to the same rule, since they share the shape', () => {
      const errors = validateContentSet(
        setOf({
          event: {
            ev: {
              key: 'ev',
              sortOrder: 0,
              name: 'E',
              description: '',
              bannerAsset: '',
              schedule: { kind: 'monthly' },
              pointRules: [{ type: 'gearLevel', points: 10, label: '', filters: {} }],
              milestones: [{ points: 100, rewards: { silver: 1 } }],
              unlockLevel: 1,
              active: true,
            },
          },
        }),
      ).errors;
      expect(errors.some((issue) => issue.message.includes('high-water mark'))).toBe(true);
    });

    it('refuses a window that ends before it starts', () => {
      const errors = problems({
        schedule: {
          kind: 'window',
          startsAt: '2026-09-10T00:00:00Z',
          endsAt: '2026-09-01T00:00:00Z',
        },
      });
      expect(errors.some((issue) => issue.path === 'schedule.endsAt')).toBe(true);
    });

    it('says nothing at all when no season is published', () => {
      const result = validateContentSet(setOf({ faction: { testers: faction } }));
      expect(result.errors.filter((issue) => issue.contentType === 'valePass')).toEqual([]);
    });
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const content = setOf({
      champion: {
        hero: { ...champion, factionKey: 'ghosts', assetKey: 'nope', skills: ['nope'] },
      },
    });
    const result = validateContentSet(content);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
