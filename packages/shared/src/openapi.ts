import { z } from 'zod';
import { ADMIN_API_PREFIX, ADMIN_ROUTES, API_PREFIX, ROUTES, routePattern } from './routes';
import {
  adminAccountStateSchema,
  adminBanRequestSchema,
  adminEconomyEntrySchema,
  adminGrantRequestSchema,
  adminGrantResultSchema,
  adminPlayerDetailSchema,
  adminPlayerSearchSchema,
  adminPlayerSummarySchema,
  adminRenameRequestSchema,
  adminResetAccountResultSchema,
  adminResetPasswordResultSchema,
  adminSessionSchema,
  adminSessionsRevokedSchema,
  adminSetRankRequestSchema,
} from './admin';
import { arenaBotCensusSchema, arenaLadderResultSchema } from './arena';
import { mailBatchSchema, mailSendRequestSchema, mailSendResultSchema } from './mail';
import { accountSummarySchema, loginRequestSchema } from './auth';
import { apiErrorSchema } from './api';
import { CONTENT_REGISTRY, CONTENT_TYPES } from './content/registry';
import {
  contentBundleSchema,
  contentDiffEntrySchema,
  contentDiffSchema,
  contentIssueSchema,
  contentRevisionSummarySchema,
  contentTotalsSchema,
  contentValidationResultSchema,
} from './content/bundle';

/**
 * The published API contract.
 *
 * Every endpoint the Admin Suite consumes is described here once, in Zod, and the
 * OpenAPI artifact (`docs/openapi/admin-api.json`) is generated from it. The Admin repo
 * generates its TypeScript client types from that artifact, so there is exactly one
 * definition of each payload and `pnpm sync-api` can fail on drift rather than letting
 * two hand-written copies quietly disagree (docs/ADMIN_ARCHITECTURE.md §3).
 *
 * Response schemas describe the `data` member of the `{ok,data,rev}` envelope; the
 * envelope itself is applied uniformly when the document is built.
 */

// ── Reusable payload pieces ─────────────────────────────────────────────────

/** An entity as the editor sees it: the draft if there is one, else the live row. */
export const contentEntrySchema = z.object({
  key: z.string(),
  /** The entity itself. Always a JSON object — every content type is one. */
  data: z.record(z.string(), z.unknown()),
  state: z.enum(['live', 'draft', 'deleting']),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

export const contentTypeCountSchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  label: z.string(),
  path: z.string(),
  live: z.number().int(),
  drafts: z.number().int(),
});

export const auditEntrySchema = z.object({
  actor: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
});

export const adminOverviewSchema = z.object({
  players: z.object({
    total: z.number().int(),
    bots: z.number().int(),
    activeToday: z.number().int(),
  }),
  accounts: z.object({
    total: z.number().int(),
    admins: z.number().int(),
    banned: z.number().int(),
  }),
  content: z.object({
    rev: z.number().int(),
    publishedAt: z.string().nullable(),
    champions: z.number().int(),
    skills: z.number().int(),
    enemies: z.number().int(),
    stages: z.number().int(),
  }),
  recentAudit: z.array(auditEntrySchema),
});

export const publishResultSchema = z.object({
  rev: z.number().int(),
  summary: contentTotalsSchema,
  validation: contentValidationResultSchema,
});

// ── The endpoint table ──────────────────────────────────────────────────────

export interface ApiEndpoint {
  surface: 'public' | 'admin';
  method: 'get' | 'post' | 'put' | 'delete';
  /** Path relative to the surface prefix, with `:name` parameters. */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  /** Body schema for write methods. */
  body?: z.ZodType;
  /** The `data` member of the success envelope. */
  response: z.ZodType;
  /** Status codes this endpoint returns beyond 200 and the always-present ones. */
  errors?: number[];
}

const CONTENT_TYPE_PARAM_VALUES = CONTENT_TYPES.map((type) => CONTENT_REGISTRY[type].path);

export const API_ENDPOINTS: ApiEndpoint[] = [
  // ── Public ───────────────────────────────────────────────────────────────
  {
    surface: 'public',
    method: 'get',
    path: ROUTES.content.bundle,
    operationId: 'getContentBundle',
    summary: 'Fetch the live content bundle',
    description:
      'Served from memory and cached by revision. Send `If-None-Match` with the ETag ' +
      'from a previous response to get a 304 when content has not moved.',
    response: contentBundleSchema,
    errors: [304],
  },

  // ── Admin: auth ──────────────────────────────────────────────────────────
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.auth.login,
    operationId: 'adminLogin',
    summary: 'Sign in to the Admin Suite',
    description:
      'Requires an account with the `admin` rank. A correct password on a non-admin ' +
      'account returns the same error as a wrong one, so rank is not discoverable.',
    body: loginRequestSchema,
    response: z.object({ account: accountSummarySchema }),
    errors: [401, 429],
  },
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.auth.me,
    operationId: 'adminMe',
    summary: 'The signed-in admin account',
    response: z.object({ account: accountSummarySchema }),
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.auth.logout,
    operationId: 'adminLogout',
    summary: 'End the admin session',
    response: z.object({ loggedOut: z.boolean() }),
  },

  // ── Admin: dashboard ─────────────────────────────────────────────────────
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.stats.overview,
    operationId: 'adminOverview',
    summary: 'Dashboard counters and recent audit entries',
    response: adminOverviewSchema,
  },

  // ── Admin: content ───────────────────────────────────────────────────────
  {
    surface: 'admin',
    method: 'get',
    path: '/content',
    operationId: 'listContentTypes',
    summary: 'Live and draft counts for every content type',
    response: z.object({
      types: z.array(contentTypeCountSchema),
      draftCount: z.number().int(),
      rev: z.number().int(),
    }),
  },
  {
    surface: 'admin',
    method: 'get',
    path: '/content/:type',
    operationId: 'listContentEntries',
    summary: 'Every entity of one content type',
    response: z.object({
      contentType: z.enum(CONTENT_TYPES),
      items: z.array(contentEntrySchema),
    }),
    errors: [404],
  },
  {
    surface: 'admin',
    method: 'get',
    path: '/content/:type/:key',
    operationId: 'getContentEntry',
    summary: 'One entity, with its live version alongside the draft',
    response: z.object({
      key: z.string(),
      contentType: z.enum(CONTENT_TYPES),
      data: z.record(z.string(), z.unknown()),
      /** The published version, or null when the entity has never been published. */
      live: z.record(z.string(), z.unknown()).nullable(),
      hasDraft: z.boolean(),
      pendingDelete: z.boolean(),
    }),
    errors: [404],
  },
  {
    surface: 'admin',
    method: 'put',
    path: '/content/:type/:key',
    operationId: 'saveContentEntry',
    summary: 'Save an entity as a draft',
    description:
      'Writes never touch live content. The body is validated against the content ' +
      "type's schema, so field-level errors come back immediately rather than at publish.",
    body: z.object({ data: z.record(z.string(), z.unknown()) }),
    response: z.object({
      key: z.string(),
      contentType: z.enum(CONTENT_TYPES),
      saved: z.boolean(),
    }),
    errors: [400, 404],
  },
  {
    surface: 'admin',
    method: 'delete',
    path: '/content/:type/:key',
    operationId: 'deleteContentEntry',
    summary: 'Mark an entity for deletion at the next publish',
    description:
      'Live entities are tombstoned rather than removed, so the publish diff can show ' +
      'the removal and validation can catch anything still referencing them.',
    response: z.object({
      key: z.string(),
      contentType: z.enum(CONTENT_TYPES),
      pendingDelete: z.boolean(),
    }),
    errors: [404],
  },
  {
    surface: 'admin',
    method: 'post',
    path: '/content/:type/:key/revert-draft',
    operationId: 'discardContentDraft',
    summary: 'Drop one pending draft, restoring the live version in the editor',
    response: z.object({
      key: z.string(),
      contentType: z.enum(CONTENT_TYPES),
      discarded: z.boolean(),
    }),
    errors: [404],
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.content.validate,
    operationId: 'validateContent',
    summary: 'Validate the pending drafts without changing anything',
    response: contentValidationResultSchema,
  },
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.content.diff,
    operationId: 'diffContent',
    summary: 'Field-level differences between live content and the drafts',
    response: contentDiffSchema,
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.content.publish,
    operationId: 'publishContent',
    summary: 'Publish the drafts',
    description:
      'Validates first and refuses on any error. On success the whole content snapshot ' +
      'is swapped atomically and a revision is recorded, which is what makes revert possible.',
    body: z.object({ note: z.string().max(400).default('') }),
    response: publishResultSchema,
    errors: [400],
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.content.revert,
    operationId: 'revertContent',
    summary: 'Restore a previous revision',
    description:
      'Recorded as a new revision rather than by rewinding history, so the audit trail ' +
      'stays append-only.',
    body: z.object({ rev: z.number().int().min(1) }),
    response: z.object({ rev: z.number().int() }),
    errors: [400, 404],
  },
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.content.revisions,
    operationId: 'listContentRevisions',
    summary: 'Publish history',
    response: z.object({
      current: z.number().int(),
      revisions: z.array(contentRevisionSummarySchema),
    }),
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.content.discard,
    operationId: 'discardAllDrafts',
    summary: 'Discard every pending draft',
    response: z.object({ discarded: z.number().int() }),
  },

  // ── Admin: player management ─────────────────────────────────────────────
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.players.search,
    operationId: 'searchPlayers',
    summary: 'Find accounts by account or profile name',
    description:
      'Both names are searched, because a support request rarely says which one it is ' +
      'quoting. Bots are excluded unless `bots=true`. Query: `q`, `limit`, `offset`, `bots`.',
    response: adminPlayerSearchSchema,
  },
  {
    surface: 'admin',
    method: 'get',
    path: routePattern(ADMIN_ROUTES.players.detail),
    operationId: 'getPlayer',
    summary: 'Everything about one account',
    description:
      'Profile, wallet, live energy, holdings as counts, progress, live sessions and the ' +
      'tail of the economy ledger.',
    response: adminPlayerDetailSchema,
    errors: [404],
  },
  {
    surface: 'admin',
    method: 'post',
    path: routePattern(ADMIN_ROUTES.players.resetPassword),
    operationId: 'resetPlayerPassword',
    summary: 'Issue a temporary password',
    description:
      'There is no e-mail anywhere in Mistvale, so this is the only password-reset path ' +
      'that exists. The password is generated rather than chosen — the operator reads it ' +
      'out once, every session is signed out, and the account cannot do anything else ' +
      'until it has been replaced.',
    response: adminResetPasswordResultSchema,
    errors: [404],
  },
  {
    surface: 'admin',
    method: 'post',
    path: routePattern(ADMIN_ROUTES.players.rank),
    operationId: 'setPlayerRank',
    summary: 'Change an account rank',
    description: 'Refuses the caller’s own account — that is how a suite locks itself out.',
    body: adminSetRankRequestSchema,
    response: adminAccountStateSchema,
    errors: [400, 404],
  },
  {
    surface: 'admin',
    method: 'post',
    path: routePattern(ADMIN_ROUTES.players.ban),
    operationId: 'setPlayerBanned',
    summary: 'Ban or unban an account',
    description:
      'A ban needs a reason — the account is shown it at its next sign-in attempt — and ' +
      'signs every session out, so it takes effect now rather than when a token expires.',
    body: adminBanRequestSchema,
    response: adminAccountStateSchema,
    errors: [400, 404],
  },
  {
    surface: 'admin',
    method: 'post',
    path: routePattern(ADMIN_ROUTES.players.profileName),
    operationId: 'renamePlayer',
    summary: 'Rename a profile',
    description: 'The support path for a name that has to go. Uniqueness is case-insensitive.',
    body: adminRenameRequestSchema,
    response: adminAccountStateSchema,
    errors: [404, 409],
  },
  {
    surface: 'admin',
    method: 'post',
    path: routePattern(ADMIN_ROUTES.players.grant),
    operationId: 'grantToPlayer',
    summary: 'Grant or remove currencies, experience and items',
    description:
      'Routed through RewardService, so it lands in `economy_log` beside the battle ' +
      'payouts. Negative amounts take things away. The note is recorded in the audit entry.',
    body: adminGrantRequestSchema,
    response: adminGrantResultSchema,
    errors: [400, 404, 409],
  },
  {
    surface: 'admin',
    method: 'delete',
    path: routePattern(ADMIN_ROUTES.players.sessions),
    operationId: 'revokePlayerSessions',
    summary: 'Sign an account out everywhere',
    response: adminSessionsRevokedSchema,
    errors: [404],
  },

  {
    surface: 'admin',
    method: 'post',
    path: routePattern(ADMIN_ROUTES.players.reset),
    operationId: 'resetPlayerAccount',
    summary: 'Return an account to a fresh start',
    description:
      'Destroys everything the account has played — champions, relics, items, campaign ' +
      'and Depths progress, the Chronicle, shop stock, summon history, battles, its arena ' +
      'standing and its Hall of Valor — and puts it back at level 1 with the starter ' +
      'chooser waiting. The account keeps its name, password and rank: this is a reset, ' +
      'not a deletion. Settings survive (accessibility choices are not progress), and the ' +
      'wallet is emptied through RewardService so `economy_log` still balances. ' +
      'Irreversible, and every session is signed out.',
    response: adminResetAccountResultSchema,
    errors: [400, 404],
  },

  // ── Admin: the Arena's bot ladder ─────────────────────────────────────────
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.bots.census,
    operationId: 'getArenaBotCensus',
    summary: 'What each band of the bot ladder should hold, and what it does',
    description:
      'Counted by where each bot actually stands rather than by the window it was made ' +
      'in, so the numbers read as they look on the leaderboard.',
    response: arenaBotCensusSchema,
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.bots.seed,
    operationId: 'seedArenaBots',
    summary: 'Bring the bot ladder up to strength',
    description:
      'Idempotent: creates only the difference between what each band should hold and ' +
      'what it does, and sheds from the top of an over-full band so the entry-level ' +
      'opponents survive. What a band *is* comes from `arena.botBands` in the game config.',
    response: arenaLadderResultSchema,
  },
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.bots.refresh,
    operationId: 'refreshArenaBots',
    summary: 'Rebuild every bot now, as the nightly job would',
    description:
      'Re-synthesises each roster from live content and drifts each rating inside its ' +
      'band, then tops the ladder up. For use after a balance publish, so an operator ' +
      'does not have to wait until the reset hour to see the result.',
    response: arenaLadderResultSchema,
  },

  // ── Admin: the mail composer ──────────────────────────────────────────────
  {
    surface: 'admin',
    method: 'post',
    path: ADMIN_ROUTES.mail.send,
    operationId: 'sendMail',
    summary: 'Compose and send a message, to one player or to everybody',
    description:
      'Fans out to a row per recipient inside one transaction, so a send either reaches ' +
      'everybody or nobody. Bots are never recipients. Attachments are validated against ' +
      'the live item catalogue first: there is no publish step between an operator ' +
      'typing a key and a thousand players opening a message that pays nothing. Audited, ' +
      'and stamped with the operator’s own account name so a player can ask about it.',
    body: mailSendRequestSchema,
    response: mailSendResultSchema,
    errors: [400, 404],
  },
  {
    surface: 'admin',
    method: 'get',
    path: ADMIN_ROUTES.mail.log,
    operationId: 'getMailBatches',
    summary: 'What each send reached, and how much of it was collected',
    description:
      'One row per send rather than per message: after a compensation mail the question ' +
      'is whether players took it, which a thousand rows cannot answer. Messages the ' +
      'game itself raised carry no batch and are not listed.',
    response: z.object({ batches: z.array(mailBatchSchema) }),
  },
];

// ── Document generation ─────────────────────────────────────────────────────

/** `getContentBundle` → `GetContentBundle`. */
function pascal(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Shared payloads that become `#/components/schemas/*` and are referenced by `$ref`. */
const SHARED_SCHEMAS: Record<string, z.ZodType> = {
  ApiError: apiErrorSchema,
  AccountSummary: accountSummarySchema,
  ContentBundle: contentBundleSchema,
  ContentValidationResult: contentValidationResultSchema,
  ContentIssue: contentIssueSchema,
  ContentDiff: contentDiffSchema,
  ContentDiffEntry: contentDiffEntrySchema,
  ContentRevisionSummary: contentRevisionSummarySchema,
  ContentTotals: contentTotalsSchema,
  ContentEntry: contentEntrySchema,
  ContentTypeCount: contentTypeCountSchema,
  AuditEntry: auditEntrySchema,
  AdminOverview: adminOverviewSchema,
  PublishResult: publishResultSchema,
  LoginRequest: loginRequestSchema,
  AdminPlayerSummary: adminPlayerSummarySchema,
  AdminPlayerSearch: adminPlayerSearchSchema,
  AdminPlayerDetail: adminPlayerDetailSchema,
  AdminSession: adminSessionSchema,
  AdminEconomyEntry: adminEconomyEntrySchema,
  AdminAccountState: adminAccountStateSchema,
  AdminResetPasswordResult: adminResetPasswordResultSchema,
  AdminGrantResult: adminGrantResultSchema,
  AdminSetRankRequest: adminSetRankRequestSchema,
  AdminBanRequest: adminBanRequestSchema,
  AdminRenameRequest: adminRenameRequestSchema,
  AdminGrantRequest: adminGrantRequestSchema,
  ...Object.fromEntries(
    CONTENT_TYPES.map((type) => [`${pascal(type)}Def`, CONTENT_REGISTRY[type].schema]),
  ),
};

/**
 * Every payload the document names.
 *
 * Endpoint requests and responses that are not already a shared DTO get a name derived
 * from their operation, so the generated client has a named type for each one instead of
 * an anonymous inline object.
 */
function namedSchemas(): Map<z.ZodType, string> {
  const byName = new Map<string, z.ZodType>(Object.entries(SHARED_SCHEMAS));

  for (const endpoint of API_ENDPOINTS) {
    const id = pascal(endpoint.operationId);
    for (const [schema, suffix] of [
      [endpoint.response, 'Response'],
      [endpoint.body, 'Request'],
    ] as const) {
      if (!schema) continue;
      const alreadyNamed = [...byName.values()].includes(schema);
      if (!alreadyNamed) byName.set(`${id}${suffix}`, schema);
    }
  }

  // Inverted: schema → name, which is the direction lookups go.
  const byShape = new Map<z.ZodType, string>();
  for (const [name, schema] of byName) {
    if (!byShape.has(schema)) byShape.set(schema, name);
  }
  return byShape;
}

type JsonSchema = Record<string, unknown>;

/** `/content/:type/:key` → `/content/{type}/{key}`, plus the parameter names. */
function toTemplate(path: string): { template: string; params: string[] } {
  const params: string[] = [];
  const template = path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    params.push(name);
    return `{${name}}`;
  });
  return { template, params };
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  304: 'Content has not changed since the ETag you sent.',
  400: 'The request body failed validation.',
  401: 'No session, or the credentials were wrong.',
  403: 'The session is valid but the account lacks the admin rank.',
  404: 'No such content type, entity or revision.',
  429: 'Rate limited.',
  500: 'Unexpected server error.',
};

/**
 * Builds the OpenAPI 3.1 document.
 *
 * Pure and deterministic: the same inputs always produce byte-identical output, which is
 * what lets CI diff the committed artifact against a fresh generation.
 */
export function buildOpenApiDocument(options: { version: string }): JsonSchema {
  const names = namedSchemas();
  const registry = z.registry<{ id: string }>();
  for (const [schema, id] of names) {
    registry.add(schema, { id });
  }

  const generated = z.toJSONSchema(registry, {
    io: 'output',
    uri: (id: string) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, JsonSchema> };

  const schemas: Record<string, JsonSchema> = {};
  for (const id of Object.keys(generated.schemas).sort()) {
    // `$schema`/`$id` are meaningful for standalone JSON Schema documents but noise
    // inside an OpenAPI components block.
    const { $schema: _schema, $id: _id, ...rest } = generated.schemas[id] ?? {};
    schemas[id] = rest;
  }

  /** Every request and response payload is named, so this is always a `$ref`. */
  const ref = (schema: z.ZodType): JsonSchema => {
    const name = names.get(schema);
    if (!name) throw new Error('Every endpoint payload must be a named schema.');
    return { $ref: `#/components/schemas/${name}` };
  };

  const envelope = (dataSchema: z.ZodType): JsonSchema => ({
    type: 'object',
    properties: {
      ok: { const: true },
      data: ref(dataSchema),
      rev: { type: 'integer' },
    },
    required: ['ok', 'data', 'rev'],
    additionalProperties: false,
  });

  const failure: JsonSchema = {
    type: 'object',
    properties: {
      ok: { const: false },
      error: { $ref: '#/components/schemas/ApiError' },
      rev: { type: 'integer' },
    },
    required: ['ok', 'error', 'rev'],
    additionalProperties: false,
  };

  const paths: Record<string, Record<string, JsonSchema>> = {};

  for (const endpoint of API_ENDPOINTS) {
    const prefix = endpoint.surface === 'admin' ? ADMIN_API_PREFIX : API_PREFIX;
    const { template, params } = toTemplate(`${prefix}${endpoint.path}`);

    const responses: Record<string, JsonSchema> = {
      '200': {
        description: 'Success.',
        content: { 'application/json': { schema: envelope(endpoint.response) } },
      },
    };

    const errorCodes = new Set(endpoint.errors ?? []);
    if (endpoint.surface === 'admin' && endpoint.operationId !== 'adminLogin') {
      errorCodes.add(401);
      errorCodes.add(403);
    }
    errorCodes.add(500);

    for (const code of [...errorCodes].sort((a, b) => a - b)) {
      responses[String(code)] =
        code === 304
          ? { description: ERROR_DESCRIPTIONS[code] ?? 'Not modified.' }
          : {
              description: ERROR_DESCRIPTIONS[code] ?? 'Error.',
              content: { 'application/json': { schema: failure } },
            };
    }

    const operation: JsonSchema = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      tags: [endpoint.surface === 'admin' ? 'admin' : 'content'],
      responses,
    };

    if (endpoint.description) operation.description = endpoint.description;

    if (params.length > 0) {
      operation.parameters = params.map((name) => ({
        name,
        in: 'path',
        required: true,
        description:
          name === 'type'
            ? 'Content type path segment.'
            : name === 'key'
              ? 'Content key (lowercase snake_case).'
              : undefined,
        schema:
          name === 'type'
            ? { type: 'string', enum: CONTENT_TYPE_PARAM_VALUES }
            : { type: 'string' },
      }));
    }

    if (endpoint.operationId === 'getContentBundle') {
      operation.parameters = [
        {
          name: 'If-None-Match',
          in: 'header',
          required: false,
          description: 'ETag from a previous bundle response.',
          schema: { type: 'string' },
        },
      ];
    }

    if (endpoint.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: ref(endpoint.body) } },
      };
    }

    if (endpoint.surface === 'admin' && endpoint.operationId !== 'adminLogin') {
      operation.security = [{ sessionCookie: [] }, { bearerAuth: [] }];
    }

    paths[template] = { ...paths[template], [endpoint.method]: operation };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Mistvale Admin API',
      version: options.version,
      description:
        'The Admin API the Mistvale Admin Suite consumes, plus the public content ' +
        'bundle it previews. Generated from the Zod contracts in @mistvale/shared — ' +
        'edit those, then run `pnpm openapi`.',
    },
    servers: [{ url: 'https://play.pathlands.cc', description: 'Production' }],
    tags: [
      { name: 'admin', description: 'Admin Suite endpoints. Require the admin rank.' },
      { name: 'content', description: 'Public content delivery.' },
    ],
    components: {
      schemas,
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'mv_session',
          description: 'Session cookie set by the login endpoint.',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Session token, for clients that cannot use cookies.',
        },
      },
    },
    paths,
  };
}
