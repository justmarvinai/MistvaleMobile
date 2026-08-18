import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ADMIN_API_PREFIX, ADMIN_ROUTES, ROUTES, apiPath, type MailView } from '@mistvale/shared';
import {
  accounts,
  contentEntries,
  contentRevisions,
  economyLog,
  mailbox,
  players,
} from '../../db/schema/index';
import { buildSeedContent } from '../../db/seed/seeders';
import * as contentRepo from '../../content/repo';
import { validateAndNormalise, type ContentSet } from '../../content/validate';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';
import * as adminMail from '../../admin/mail';
import * as mail from './service';

/**
 * The mailbox, and the news feed beside it.
 *
 * Mail is the one surface where an operator hands a player currency directly, so what is
 * pinned here is mostly about *not paying twice*: a retried claim, a collect-all racing a
 * single claim, an expired message, and a send that reaches everybody exactly once. The
 * news half is smaller and is entirely about the window.
 */

const dbUp = await isDatabaseAvailable();

async function seedContent(app: FastifyInstance): Promise<void> {
  const seeds = buildSeedContent();
  const set: ContentSet = new Map();
  for (const seed of seeds) {
    set.set(seed.contentType, new Map(seed.entities.map((entity) => [entity.key, entity.data])));
  }
  const { result, normalised } = validateAndNormalise(set);
  expect(result.ok, JSON.stringify(result.errors.slice(0, 5))).toBe(true);

  const flattened = seeds.flatMap((seed) =>
    seed.entities.map((entity) => ({
      contentType: seed.contentType,
      key: entity.key,
      data: normalised.get(seed.contentType)?.get(entity.key) ?? entity.data,
    })),
  );

  await app.db.transaction(async (tx) => {
    await tx.delete(contentEntries);
    await tx.delete(contentRevisions);
    await contentRepo.replaceLiveContent(tx, flattened);
    await contentRepo.insertRevision(tx, {
      rev: 1,
      publishedBy: 'test',
      note: 'mail fixture',
      summary: { added: flattened.length, modified: 0, removed: 0 },
      snapshot: Object.fromEntries(
        seeds.map((seed) => [
          seed.contentType,
          Object.fromEntries(normalised.get(seed.contentType) ?? []),
        ]),
      ),
    });
  });

  await app.content.load();
  app.setContentRevision(app.content.rev);
}

describe.skipIf(!dbUp)('the mailbox', () => {
  let app: FastifyInstance;
  let cookie: string;
  let playerId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await seedContent(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('post'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const adminUrl = (route: string) => `${ADMIN_API_PREFIX}${route}`;
  const ctx = () => ({ db: app.db, content: app.content });
  const read = (now?: Date): Promise<MailView> => mail.overview(ctx(), playerId, now);

  /** Drops a message straight into the inbox — the shape every source produces. */
  async function deliver(
    overrides: Partial<typeof mailbox.$inferInsert> = {},
  ): Promise<typeof mailbox.$inferSelect> {
    const [row] = await app.db
      .insert(mailbox)
      .values({
        playerId,
        title: 'A word from the Vale',
        body: 'Something happened, and here is what we owe you for it.',
        attachments: { silver: 5_000 },
        ...overrides,
      })
      .returning();
    return row!;
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  it('caps a huge mailbox without lying about what is in it', async () => {
    // A mailbox has no natural ceiling — mail without an expiry is never pruned, and an
    // operator batch-send adds a row to every account at once — so reading "all of it" was
    // a query that grew for the life of the account. It is capped now; the counts are not,
    // because a pip that stopped at a hundred would be a pip that lies.
    const many = Array.from({ length: 130 }, (_, index) => ({
      playerId,
      title: `Message ${index}`,
      body: 'Words.',
      attachments: (index % 2 === 0 ? { silver: 10 } : {}) as Record<string, number>,
    }));
    await app.db.insert(mailbox).values(many);

    const view = await read();
    expect(view.messages).toHaveLength(100);
    expect(view.truncated).toBe(true);
    expect(view.unread).toBe(130);
    expect(view.claimable).toBe(65);
    // Newest first, so what is dropped is the oldest — the end nobody scrolls to.
    expect(view.messages[0]!.title).toBe('Message 129');

    // …and the pip counts the whole box, not the page.
    expect(await mail.waitingCount(ctx(), playerId)).toBe(130);
  });

  it('says nothing was truncated when nothing was', async () => {
    await deliver();
    const view = await read();
    expect(view.truncated).toBe(false);
    expect(view.messages).toHaveLength(1);
  });

  it('starts empty, and says so without inventing a message', async () => {
    const view = await read();
    expect(view.messages).toEqual([]);
    expect(view.unread).toBe(0);
    expect(view.claimable).toBe(0);
  });

  it('lists what has arrived, newest first, with the counts the pip needs', async () => {
    await deliver({ title: 'Older' });
    await deliver({ title: 'Newer', createdAt: new Date(Date.now() + 60_000) });
    await deliver({ title: 'Just words', attachments: {} });

    const view = await read();
    expect(view.messages[0]?.title).toBe('Newer');
    expect(view.unread).toBe(3);
    // Only the two carrying something count as claimable.
    expect(view.claimable).toBe(2);
    expect(await mail.waitingCount(ctx(), playerId)).toBe(3);
  });

  it('marks one read without touching the others', async () => {
    const first = await deliver({ title: 'One' });
    await deliver({ title: 'Two' });

    const view = await mail.markRead(ctx(), playerId, first.id);
    expect(view.unread).toBe(1);
    expect(view.messages.find((entry) => entry.id === first.id)?.read).toBe(true);
    // Still waiting: it carries something nobody has taken.
    expect(await mail.waitingCount(ctx(), playerId)).toBe(2);
  });

  it('hides a message whose moment has passed, without deleting anything', async () => {
    await deliver({ title: 'Gone', expiresAt: new Date(Date.now() - 60_000) });
    await deliver({ title: 'Here' });

    const view = await read();
    expect(view.messages.map((entry) => entry.title)).toEqual(['Here']);
    // The row is still there — sweeping it is the prune's job, not the reader's.
    const rows = await app.db.select().from(mailbox).where(eq(mailbox.playerId, playerId));
    expect(rows).toHaveLength(2);
  });

  // ── Claiming ──────────────────────────────────────────────────────────────

  it('pays what a message carries, once', async () => {
    const row = await deliver({ attachments: { silver: 5_000, sigil_faded: 2 } });
    const before = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));

    const result = await mail.claim(ctx(), playerId, row.id, 'claim-0001');
    expect(result.paid.silver).toBe(5_000);
    expect(result.paid.sigil_faded).toBe(2);
    expect(result.claimedCount).toBe(1);
    expect(result.mail.claimable).toBe(0);

    const after = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    expect(after[0]!.silver).toBe(before[0]!.silver + 5_000);

    // And it lands in the ledger like every other grant.
    const ledger = await app.db.select().from(economyLog).where(eq(economyLog.playerId, playerId));
    expect(ledger.some((entry) => entry.source === `mail:${row.id}`)).toBe(true);
  });

  it('replays a retried claim and refuses a second one', async () => {
    const row = await deliver();

    const first = await mail.claim(ctx(), playerId, row.id, 'claim-0002');
    const replay = await mail.claim(ctx(), playerId, row.id, 'claim-0002');
    expect(replay.paid).toEqual(first.paid);

    await expect(mail.claim(ctx(), playerId, row.id, 'claim-0003')).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });

    // Paid exactly once, whatever the client did.
    const ledger = await app.db.select().from(economyLog).where(eq(economyLog.playerId, playerId));
    expect(ledger.filter((entry) => entry.source === `mail:${row.id}`)).toHaveLength(1);
  });

  it('refuses to collect a message carrying nothing, and one that has expired', async () => {
    const words = await deliver({ attachments: {} });
    await expect(mail.claim(ctx(), playerId, words.id, 'claim-0004')).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    const stale = await deliver({ expiresAt: new Date(Date.now() - 1_000) });
    await expect(mail.claim(ctx(), playerId, stale.id, 'claim-0005')).rejects.toMatchObject({
      code: 'LOCKED_CONTENT',
    });
  });

  it('will not hand one player another player’s mail', async () => {
    const other = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('nosy'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    const otherId = other.json().data.player.id as string;
    const [theirs] = await app.db
      .insert(mailbox)
      .values({ playerId: otherId, title: 'Theirs', body: 'Private.', attachments: { silver: 1 } })
      .returning();

    await expect(mail.claim(ctx(), playerId, theirs!.id, 'claim-0006')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await read()).messages).toHaveLength(0);
  });

  it('collects everything in one act, and pays the sum once', async () => {
    await deliver({ attachments: { silver: 1_000 } });
    await deliver({ attachments: { silver: 2_500, sigil_faded: 1 } });
    await deliver({ attachments: {}, title: 'Words only' });

    const result = await mail.claimAll(ctx(), playerId, 'all-0001');
    expect(result.claimedCount).toBe(2);
    expect(result.paid.silver).toBe(3_500);
    expect(result.paid.sigil_faded).toBe(1);
    expect(result.mail.claimable).toBe(0);
    // The wordless message is untouched and still there to read.
    expect(result.mail.messages).toHaveLength(3);

    // A second collect-all is a no-op rather than an error.
    const again = await mail.claimAll(ctx(), playerId, 'all-0002');
    expect(again.claimedCount).toBe(0);
    expect(again.paid).toEqual({});
  });

  it('leaves an expired message out of collect-all', async () => {
    await deliver({ attachments: { silver: 1_000 } });
    await deliver({ attachments: { silver: 9_999 }, expiresAt: new Date(Date.now() - 1_000) });

    const result = await mail.claimAll(ctx(), playerId, 'all-0003');
    expect(result.claimedCount).toBe(1);
    expect(result.paid.silver).toBe(1_000);
  });

  it('throws away a spent message, and refuses to throw away a full one', async () => {
    const full = await deliver();
    await expect(mail.discard(ctx(), playerId, full.id)).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    await mail.claim(ctx(), playerId, full.id, 'claim-0007');
    const view = await mail.discard(ctx(), playerId, full.id);
    expect(view.messages).toHaveLength(0);
  });

  // ── Through the API ───────────────────────────────────────────────────────

  it('answers the screen and takes a claim over HTTP', async () => {
    const row = await deliver();

    const state = await as({ method: 'GET', url: apiPath(ROUTES.mail.state) });
    expect(state.statusCode).toBe(200);
    expect(state.json().data.mail.messages).toHaveLength(1);

    const claimed = await as({
      method: 'POST',
      url: apiPath(ROUTES.mail.claim(row.id)),
      payload: { actionId: 'http-mail-0001' },
    });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().data.mail.claimable).toBe(0);
  });

  it('turns an anonymous caller away from the inbox', async () => {
    const state = await app.inject({ method: 'GET', url: apiPath(ROUTES.mail.state) });
    const claimAll = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.mail.claimAll),
      payload: { actionId: 'anon-mail-0001' },
    });
    expect([state.statusCode, claimAll.statusCode]).toEqual([401, 401]);
  });

  // ── The composer ──────────────────────────────────────────────────────────

  describe('the composer', () => {
    const adminCtx = () => ({ db: app.db, content: app.content });

    it('reaches one player when told to', async () => {
      const result = await adminMail.send(
        adminCtx(),
        {
          target: 'player',
          playerId,
          title: 'Sorry about the downtime',
          body: 'Here is something for the trouble.',
          attachments: { crystals: 50 },
          expiresInDays: 30,
        },
        'admin:marvin',
      );

      expect(result.recipients).toBe(1);
      const view = await read();
      expect(view.messages[0]?.title).toBe('Sorry about the downtime');
      expect(view.messages[0]?.sentBy).toBe('admin:marvin');
      expect(view.messages[0]?.expiresAt).not.toBeNull();
    });

    it('reaches every human and no bot', async () => {
      const [bot] = await app.db
        .insert(accounts)
        .values({
          accountName: uniqueAccountName('bot'),
          passwordHash: 'x',
          rank: 'player',
        })
        .returning();
      await app.db
        .insert(players)
        .values({ accountId: bot!.id, profileName: uniqueProfileName(), isBot: true });

      const result = await adminMail.send(
        adminCtx(),
        {
          target: 'all',
          title: 'Maintenance tonight',
          body: 'Back in an hour.',
          attachments: {},
          expiresInDays: 7,
        },
        'admin:marvin',
      );

      const everyone = await app.db.select().from(players);
      const humans = everyone.filter((row) => !row.isBot);
      expect(result.recipients).toBe(humans.length);

      const delivered = await app.db.select().from(mailbox);
      expect(delivered).toHaveLength(humans.length);
      expect(delivered.some((row) => everyone.find((p) => p.id === row.playerId)?.isBot)).toBe(
        false,
      );
    });

    it('refuses attachments naming an item that does not exist', async () => {
      await expect(
        adminMail.send(
          adminCtx(),
          {
            target: 'player',
            playerId,
            title: 'Typo',
            body: 'This would have paid nothing.',
            attachments: { sigil_gleeming: 1 },
            expiresInDays: 30,
          },
          'admin:marvin',
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      expect((await read()).messages).toHaveLength(0);
    });

    it('refuses an amount that is not a positive number', async () => {
      await expect(
        adminMail.send(
          adminCtx(),
          {
            target: 'player',
            playerId,
            title: 'Nothing',
            body: 'Zero of something is not a gift.',
            attachments: { silver: 0 },
            expiresInDays: 30,
          },
          'admin:marvin',
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('reports what a batch reached, read and claimed', async () => {
      const sent = await adminMail.send(
        adminCtx(),
        {
          target: 'all',
          title: 'Compensation',
          body: 'For the outage.',
          attachments: { crystals: 25 },
          expiresInDays: 0,
        },
        'admin:marvin',
      );

      let [batch] = await adminMail.batches(adminCtx());
      expect(batch?.batchId).toBe(sent.batchId);
      expect(batch?.recipients).toBe(sent.recipients);
      expect(batch?.read).toBe(0);
      expect(batch?.claimed).toBe(0);
      // `expiresInDays: 0` means it keeps.
      expect(batch?.expiresAt).toBeNull();

      const mine = (await read()).messages[0]!;
      await mail.claim(ctx(), playerId, mine.id, 'claim-batch-0001');

      [batch] = await adminMail.batches(adminCtx());
      expect(batch?.read).toBe(1);
      expect(batch?.claimed).toBe(1);
    });

    it('sends and reads the log over the Admin API', async () => {
      const adminAccount = uniqueAccountName('ops');
      const registered = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName: adminAccount,
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
      });
      expect(registered.statusCode).toBe(201);
      await app.db
        .update(accounts)
        .set({ rank: 'admin' })
        .where(eq(accounts.accountName, adminAccount));

      const signedIn = await app.inject({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.auth.login),
        payload: { accountName: adminAccount, password: 'a-good-long-password' },
      });
      expect(signedIn.statusCode).toBe(200);
      const adminCookie = extractSessionCookie(signedIn.headers['set-cookie']) as string;

      const sent = await app.inject({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.mail.send),
        cookies: { mv_session: adminCookie },
        payload: {
          target: 'player',
          playerId,
          title: 'From the operator',
          body: 'Hello.',
          attachments: { silver: 100 },
          expiresInDays: 3,
        },
      });
      expect(sent.statusCode).toBe(200);
      expect(sent.json().data.recipients).toBe(1);

      const log = await app.inject({
        method: 'GET',
        url: adminUrl(ADMIN_ROUTES.mail.log),
        cookies: { mv_session: adminCookie },
      });
      expect(log.statusCode).toBe(200);
      expect(log.json().data.batches[0].title).toBe('From the operator');
      // The operator's own name rides along, so a player can ask about it afterwards.
      expect(log.json().data.batches[0].sentBy).toBe(`admin:${adminAccount}`);
    });

    it('turns a player away from the composer', async () => {
      const refused = await as({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.mail.send),
        payload: {
          target: 'all',
          title: 'Free crystals',
          body: 'For me.',
          attachments: { crystals: 100_000 },
          expiresInDays: 30,
        },
      });
      expect([401, 403]).toContain(refused.statusCode);
      expect(await app.db.select().from(mailbox)).toHaveLength(0);
    });
  });

  // ── News ──────────────────────────────────────────────────────────────────

  describe('the news feed', () => {
    it('shows the welcome post, pinned, and hides the template', () => {
      const view = mail.news(ctx());
      expect(view.posts[0]?.key).toBe('news_welcome');
      expect(view.posts[0]?.pinned).toBe(true);
      // The patch-note template ships inactive: it is scaffolding, not an announcement.
      expect(view.posts.some((post) => post.key === 'news_patch_template')).toBe(false);
    });

    it('answers over HTTP without a database read', async () => {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.news.state) });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.news.posts.length).toBeGreaterThan(0);
    });
  });
});
