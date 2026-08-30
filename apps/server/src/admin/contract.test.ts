import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ADMIN_API_PREFIX,
  API_ENDPOINTS,
  API_PREFIX,
  ROUTES,
  apiPath,
  buildOpenApiDocument,
  type ApiEndpoint,
} from '@mistvale/shared';
import { accounts, battleSessions, contentEntries, contentRevisions } from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * The published contract, checked against the running server.
 *
 * `docs/openapi/admin-api.json` is generated from the Zod schemas in
 * `packages/shared/src/openapi.ts`, and the Admin Suite generates its client types from
 * that artifact. Nothing in that chain re-reads the handlers, so without this test the
 * document could describe an API the server does not actually serve.
 *
 * Here every endpoint is called for real and its response parsed with the very schema the
 * document was generated from. A handler that adds, drops or renames a field fails here
 * until the contract is updated to match.
 */

const dbUp = await isDatabaseAvailable();

/**
 * Fills path parameters with values that exist in the fixture.
 *
 * `:id` is a *second* account created for the purpose. The player-management endpoints
 * refuse to act on the caller's own account and one of them signs every session out, so
 * pointing them at the admin running the suite would either fail the guard or end the
 * session every later case depends on.
 */
function urlFor(endpoint: ApiEndpoint, key = 'testers'): string {
  const prefix = endpoint.surface === 'admin' ? ADMIN_API_PREFIX : API_PREFIX;
  return (
    `${prefix}${endpoint.path}`
      .replace(':type', 'factions')
      .replace(':key', key)
      // The job runner takes a name from a closed list rather than an id; `daily` is the
      // safe one to exercise — it prunes an empty fixture and rebuilds an empty ladder.
      .replace(':name', 'daily')
      // Most `:id` routes are keyed on a player; the battle inspector is the one that is
      // not, and substituting a player id there answers NOT_FOUND rather than exercising
      // the contract — which is a green test about a 404.
      .replace(':id', endpoint.operationId === 'getBattle' ? targetBattleId : targetPlayerId)
  );
}

/** The disposable account the player-management cases act on. */
let targetPlayerId = '';

/** A finished fight for the inspector's contract case to read. */
let targetBattleId = '';

const FIXTURE = [
  {
    path: 'factions',
    key: 'testers',
    data: { key: 'testers', name: 'Testers', lore: '', icon: '', sortOrder: 0 },
  },
  {
    path: 'assets',
    key: 'test_asset',
    data: {
      key: 'test_asset',
      kind: 'unit',
      source: 'repo',
      basePath: 'test/unit',
      tracks: { idle: { frames: 9, fps: 9, loop: true } },
      stillPath: 'test/unit/still',
      avatarPath: '',
      sortOrder: 0,
    },
  },
  {
    path: 'skills',
    key: 'test_a1',
    data: {
      key: 'test_a1',
      name: 'Test Strike',
      slot: 'a1',
      targeting: { side: 'enemy', mode: 'single' },
      components: [{ type: 'damage', scale: 'atk', mult: 2 }],
    },
  },
  {
    path: 'champions',
    key: 'test_hero',
    data: {
      key: 'test_hero',
      name: 'Test Hero',
      factionKey: 'testers',
      element: 'ember',
      rarity: 'rare',
      role: 'attack',
      baseStats: { hp: 15000, atk: 1000, def: 900, spd: 100 },
      skills: ['test_a1'],
      assetKey: 'test_asset',
    },
  },
  // An enemy, a chapter and a stage, so the balance sandbox has something to fight on.
  // Deliberately feeble: the sandbox case asserts the *shape* of a result, and a fixture
  // stage that the bench champion cannot beat would make the response's turn figures null
  // and the case would then prove less than it looks like it does.
  {
    path: 'enemies',
    key: 'test_grunt',
    data: {
      key: 'test_grunt',
      name: 'Test Grunt',
      archetype: 'grunt',
      element: 'verdant',
      role: 'attack',
      baseStats: { hp: 400, atk: 60, def: 40, spd: 70 },
      anchorLevel: 10,
      skills: ['test_a1'],
      assetKey: 'test_asset',
    },
  },
  {
    path: 'chapters',
    key: 'test_chapter',
    data: { key: 'test_chapter', number: 1, name: 'Test Chapter' },
  },
  {
    path: 'stages',
    key: 'test_stage',
    data: {
      key: 'test_stage',
      mode: 'campaign',
      parentKey: 'test_chapter',
      number: 1,
      difficulty: 'normal',
      energyCost: 4,
      waves: [[{ enemyKey: 'test_grunt', level: 5, stars: 6, slot: 0 }]],
      rewards: {
        silverMin: 10,
        silverMax: 20,
        playerXp: 5,
        championXp: 5,
        drops: {},
      },
      starRules: { noDeaths: true, maxTurns: 20 },
    },
  },
];

describe.skipIf(!dbUp)('API contract', () => {
  let app: FastifyInstance;
  let adminCookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await truncateAll(app);
    await app.db.delete(contentEntries);
    await app.db.delete(contentRevisions);
    await app.content.load();
    app.setContentRevision(app.content.rev);

    const accountName = uniqueAccountName('contract');
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName,
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    adminCookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    await app.db
      .update(accounts)
      .set({ rank: 'admin' })
      .where(eq(accounts.accountName, accountName));

    // Draft and publish the fixture, so read endpoints have live content, the revision
    // list is non-empty, and revert has somewhere to go.
    const asAdmin = (options: InjectOptions) =>
      app.inject({ ...options, cookies: { mv_session: adminCookie } });

    for (const entity of FIXTURE) {
      const response = await asAdmin({
        method: 'PUT',
        url: `${ADMIN_API_PREFIX}/content/${entity.path}/${entity.key}`,
        payload: { data: entity.data },
      });
      expect(response.statusCode, `drafting ${entity.key}`).toBe(200);
    }

    const published = await asAdmin({
      method: 'POST',
      url: `${ADMIN_API_PREFIX}/content/publish`,
      payload: { note: 'contract fixture' },
    });
    expect(published.statusCode, 'publishing the fixture').toBe(200);
    app.setContentRevision(app.content.rev);

    // A second draft, so the diff and discard endpoints have something to report.
    await asAdmin({
      method: 'PUT',
      url: `${ADMIN_API_PREFIX}/content/factions/testers`,
      payload: { data: { ...FIXTURE[0]!.data, name: 'Testers Renamed' } },
    });

    // The account the player-management cases act on. Never the admin's own.
    const target = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('subject'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(target.statusCode, 'registering the contract subject').toBe(201);
    targetPlayerId = target.json().data.player.id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Bodies for the write endpoints; everything else needs none. */
  const BODIES: Record<string, unknown> = {
    adminLogin: { accountName: 'unused', password: 'unused' },
    saveContentEntry: { data: FIXTURE[0]!.data },
    publishContent: { note: 'contract test' },
    revertContent: { rev: 1 },
    setPlayerRank: { rank: 'gamemaster' },
    setPlayerBanned: { banned: true, reason: 'contract test' },
    renamePlayer: { profileName: uniqueProfileName() },
    grantToPlayer: { silver: 500, note: 'contract test' },
    // No attachments: the fixture publishes a handful of entities and no items, so a
    // reward map would be refused by the same catalogue check that protects a real send.
    sendMail: {
      target: 'all',
      title: 'Contract test',
      body: 'Sent by the contract suite.',
      attachments: {},
      expiresInDays: 1,
    },
    // One run: the case is about the response's shape, and the arithmetic behind it is
    // pinned on real content in `simulate.test.ts` and on every stage in the game by the
    // CI balance gates.
    simulateStage: { stageKey: 'test_stage', tier: 'fresh', runs: 1 },
    // Re-imports the fixture faction exactly as it stands, which is the case worth
    // exercising here: identical-to-live writes no draft, so this contract case cannot
    // leave a pending edit behind for the publish cases that follow it.
    importContent: {
      files: [{ type: 'factions', entities: [{ key: 'testers', data: FIXTURE[0]!.data }] }],
    },
  };

  /**
   * Per-case setup.
   *
   * The cases run in contract order and several of them consume state — deleting a
   * draft, discarding all of them — so an endpoint that needs a pending draft has to
   * create its own rather than rely on one an earlier case left behind.
   */
  const SETUP: Record<string, () => Promise<void>> = {
    // Created here rather than in `beforeAll`, and the reason is worth the comment: these
    // cases run in endpoint order, `resetAccount` comes first, and a reset cascades every
    // battle the subject ever fought. A row seeded up front is gone by the time this runs.
    getBattle: async () => {
      const [battle] = await app.db
        .insert(battleSessions)
        .values({
          playerId: targetPlayerId,
          mode: 'campaign',
          stageKey: 'test_stage',
          contentRev: 1,
          seed: 1,
          state: { turn: 1 },
          events: [{ type: 'battleStart', allies: [], enemies: [] }],
          status: 'finished',
          outcome: 'victory',
        })
        .returning({ id: battleSessions.id });
      targetBattleId = battle!.id;
    },
    publishContent: async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `${ADMIN_API_PREFIX}/content/factions/testers`,
        cookies: { mv_session: adminCookie },
        payload: { data: { ...FIXTURE[0]!.data, name: 'Testers Publishable' } },
      });
      expect(response.statusCode, 'seeding a draft to publish').toBe(200);
    },
  };

  // adminLogin needs a password we cannot know here (the fixture account's password is
  // known, but logging in again would rotate the cookie mid-suite), and adminLogout would
  // end the session every later case depends on. Both are covered in content.test.ts.
  const COVERED_ELSEWHERE = new Set(['adminLogin', 'adminLogout']);

  const endpoints = API_ENDPOINTS.filter(
    (endpoint) => !COVERED_ELSEWHERE.has(endpoint.operationId),
  );

  it('describes every endpoint the suite exercises', () => {
    // A new endpoint added to the contract without a case here would otherwise be
    // published as documented-but-unverified.
    expect(endpoints.length + COVERED_ELSEWHERE.size).toBe(API_ENDPOINTS.length);
    expect(endpoints.length).toBeGreaterThan(10);
  });

  it.each(endpoints.map((endpoint) => [endpoint.operationId, endpoint] as const))(
    '%s returns exactly what the contract declares',
    async (operationId, endpoint) => {
      await SETUP[operationId]?.();

      const response = await app.inject({
        method: endpoint.method.toUpperCase() as 'GET',
        url: urlFor(endpoint),
        cookies: endpoint.surface === 'admin' ? { mv_session: adminCookie } : undefined,
        ...(endpoint.body ? { payload: BODIES[operationId] ?? {} } : {}),
      });

      expect(response.statusCode, `${operationId}: ${response.body.slice(0, 300)}`).toBe(200);

      const envelope = response.json() as { ok: boolean; data: unknown; rev: number };
      expect(envelope.ok).toBe(true);
      expect(typeof envelope.rev).toBe('number');

      const parsed = endpoint.response.safeParse(envelope.data);
      if (!parsed.success) {
        throw new Error(
          `${operationId} response does not match its contract:\n` +
            parsed.error.issues
              .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('\n'),
        );
      }
    },
  );

  it('generates a document whose operations all resolve their $refs', () => {
    const document = buildOpenApiDocument({ version: '0.0.0-test' }) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') refs.add(value);
        else walk(value);
      }
    };
    walk(document.paths);
    walk(document.components.schemas);

    const missing = [...refs].filter(
      (ref) => !(ref.replace('#/components/schemas/', '') in document.components.schemas),
    );
    expect(missing).toEqual([]);
    expect(refs.size).toBeGreaterThan(10);
  });
});
