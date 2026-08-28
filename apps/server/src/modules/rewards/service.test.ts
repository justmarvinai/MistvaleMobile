import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath } from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { ENERGY_REGEN_SECONDS, energyCapForLevel, xpForNextLevel } from '../../lib/progression';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';
import { grant } from './service';

/**
 * What a level-up is worth.
 *
 * ECONOMY_BALANCE.md has said since P0 that a level-up refills the energy bar and allows
 * overfill — it is listed in the currency table as one of the three sources of energy, and
 * it is what paces a new account's first evening: level, and keep playing. The reward path
 * wrote the new level and left the energy column untouched, so until P10d the only energy
 * anybody ever received was the twenty they registered with and the clock. It went
 * unnoticed because nothing asked.
 */

const dbUp = await isDatabaseAvailable();

describe.skipIf(!dbUp)('granting rewards', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  /** A fresh account, and the id of the player behind it. */
  async function freshPlayer(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName(),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(extractSessionCookie(response.headers['set-cookie'])).toBeTypeOf('string');
    return response.json().data.player.id as string;
  }

  const readPlayer = async (id: string) => {
    const [row] = await app.db.select().from(players).where(eq(players.id, id));
    if (!row) throw new Error('player vanished');
    return row;
  };

  /** Spends energy the way a battle does, without fighting one. */
  const drainTo = async (id: string, value: number): Promise<void> => {
    await app.db
      .update(players)
      .set({ energy: value, energyUpdatedAt: new Date() })
      .where(eq(players.id, id));
  };

  /**
   * Energy that is *paid* rather than waited for (C24).
   *
   * The owner's rule, and Raid's: the cap governs regeneration and nothing else, so a
   * reward goes into the bar and straight past it. That overflow is what makes the first
   * few days of an account playable — a newcomer banks thousands and spends them at their
   * own pace instead of watching a twenty-point bar refill for a week.
   */
  describe('energy as a reward', () => {
    it('pays into the bar and past the cap', async () => {
      const id = await freshPlayer();
      await drainTo(id, 5);

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { energy: 2_000 }, 'test:energy');
      });

      const after = await readPlayer(id);
      expect(after.energy).toBe(2_005);
      expect(after.energy, 'far past the cap, on purpose').toBeGreaterThan(
        energyCapForLevel(after.level),
      );
    });

    it('adds to an overfilled bar rather than replacing it', async () => {
      const id = await freshPlayer();
      await drainTo(id, 1_000);

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { energy: 500 }, 'test:energy');
      });

      expect((await readPlayer(id)).energy).toBe(1_500);
    });

    it('adds on top of a level-up refill rather than instead of it', async () => {
      // The two used to be one block that returned early, so a reward carrying both a
      // level and energy could only ever do one of them.
      const id = await freshPlayer();
      await drainTo(id, 0);

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { playerXp: xpForNextLevel(1), energy: 300 }, 'test:both');
      });

      const after = await readPlayer(id);
      expect(after.level).toBe(2);
      expect(after.energy).toBe(energyCapForLevel(2) + 300);
    });

    it('does not steal the tick a player was part-way through', async () => {
      // Energy *is* the stored value plus elapsed time, so anything that writes it has to
      // stamp when the value was reached. Stamping `now` would throw away however far into
      // the current three minutes the bar had got — a small theft, on every reward.
      const id = await freshPlayer();
      const startedAt = new Date(Date.now() - (ENERGY_REGEN_SECONDS - 20) * 1000);
      await app.db
        .update(players)
        .set({ energy: 3, energyUpdatedAt: startedAt })
        .where(eq(players.id, id));

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { energy: 100 }, 'test:energy');
      });

      const after = await readPlayer(id);
      expect(after.energy, 'no tick had completed, so the bar is 3 + 100').toBe(103);
      const carried = Date.now() - after.energyUpdatedAt.getTime();
      expect(carried / 1000, 'the unfinished tick is carried, not rounded away').toBeGreaterThan(
        ENERGY_REGEN_SECONDS - 40,
      );
    });

    it('records the grant in the economy log', async () => {
      const id = await freshPlayer();
      await app.db.transaction(async (tx) => {
        const result = await grant(tx, id, { energy: 250 }, 'test:energy');
        expect(result.applied.energy).toBe(250);
      });
    });

    it('ignores a reward that would take energy away', async () => {
      // A reward is a gift. A content typo that turned one into a charge pays nothing
      // rather than draining a bar.
      const id = await freshPlayer();
      await drainTo(id, 40);

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { energy: -30 }, 'test:energy');
      });

      expect((await readPlayer(id)).energy).toBe(40);
    });
  });

  /**
   * The champion-XP boost: a timer on the account that any reward map can extend.
   */
  describe('the XP boost', () => {
    it('starts a boost that was not running', async () => {
      const id = await freshPlayer();
      const before = Date.now();

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { xpBoostHours: 24 }, 'test:boost');
      });

      const until = (await readPlayer(id)).xpBoostUntil;
      expect(until).not.toBeNull();
      const hours = ((until as Date).getTime() - before) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThan(24.1);
    });

    it('extends one that is already running rather than replacing it', async () => {
      // The rule a player notices: claiming a second boost on a Tuesday must not throw
      // away the rest of Monday's.
      const id = await freshPlayer();
      const running = new Date(Date.now() + 6 * 3_600_000);
      await app.db.update(players).set({ xpBoostUntil: running }).where(eq(players.id, id));

      await app.db.transaction(async (tx) => {
        await grant(tx, id, { xpBoostHours: 12 }, 'test:boost');
      });

      const until = (await readPlayer(id)).xpBoostUntil as Date;
      const added = (until.getTime() - running.getTime()) / 3_600_000;
      expect(added).toBeGreaterThan(11.9);
      expect(added).toBeLessThan(12.1);
    });

    it('starts from now when the old one has already run out', async () => {
      const id = await freshPlayer();
      await app.db
        .update(players)
        .set({ xpBoostUntil: new Date(Date.now() - 3_600_000) })
        .where(eq(players.id, id));

      const before = Date.now();
      await app.db.transaction(async (tx) => {
        await grant(tx, id, { xpBoostHours: 3 }, 'test:boost');
      });

      const until = (await readPlayer(id)).xpBoostUntil as Date;
      expect((until.getTime() - before) / 3_600_000).toBeGreaterThan(2.9);
    });

    it('leaves the timer alone when a reward carries no boost', async () => {
      const id = await freshPlayer();
      await app.db.transaction(async (tx) => {
        await grant(tx, id, { silver: 100 }, 'test:silver');
      });
      expect((await readPlayer(id)).xpBoostUntil).toBeNull();
    });
  });

  it('fills the bar when the grant carries a level', async () => {
    const id = await freshPlayer();
    await drainTo(id, 2);

    await app.db.transaction(async (tx) => {
      await grant(tx, id, { playerXp: xpForNextLevel(1) }, 'test:level');
    });

    const after = await readPlayer(id);
    expect(after.level, 'the grant should have carried a level').toBe(2);
    expect(after.energy).toBe(energyCapForLevel(2));
  });

  it('fills it to the *new* cap, which is bigger than the old one', async () => {
    const id = await freshPlayer();
    await drainTo(id, 0);

    await app.db.transaction(async (tx) => {
      await grant(tx, id, { playerXp: xpForNextLevel(1) }, 'test:level');
    });

    const after = await readPlayer(id);
    expect(after.energy).toBeGreaterThan(energyCapForLevel(1));
  });

  it('leaves an overfilled bar alone, because a level is good news', async () => {
    // Refill items and event payouts can push a bar past its cap; a level-up must not be
    // the thing that trims it back.
    const id = await freshPlayer();
    const overfilled = energyCapForLevel(2) + 40;
    await drainTo(id, overfilled);

    await app.db.transaction(async (tx) => {
      await grant(tx, id, { playerXp: xpForNextLevel(1) }, 'test:level');
    });

    expect((await readPlayer(id)).energy).toBe(overfilled);
  });

  it('restarts the regeneration clock, so the refill does not decay backwards', async () => {
    // Energy is the stored value plus the time since it was written. Filling the bar
    // without stamping the clock would leave a full bar that the next read treats as
    // hours old.
    const id = await freshPlayer();
    await drainTo(id, 1);
    const before = (await readPlayer(id)).energyUpdatedAt;

    await app.db.transaction(async (tx) => {
      await grant(tx, id, { playerXp: xpForNextLevel(1) }, 'test:level');
    });

    const after = await readPlayer(id);
    expect(after.energyUpdatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('leaves energy alone when the grant carries no level', async () => {
    // The common case by far — silver from a cleared stage. A grant must not be a refill.
    const id = await freshPlayer();
    await drainTo(id, 3);

    await app.db.transaction(async (tx) => {
      await grant(tx, id, { silver: 500 }, 'test:silver');
    });

    const after = await readPlayer(id);
    expect(after.energy).toBe(3);
    expect(after.silver).toBeGreaterThan(0);
  });

  it('fills once for a grant that carries several levels at a time', async () => {
    // A mission milestone can pay four levels in one bundle.
    const id = await freshPlayer();
    await drainTo(id, 0);
    const bigXp = xpForNextLevel(1) + xpForNextLevel(2) + xpForNextLevel(3);

    await app.db.transaction(async (tx) => {
      await grant(tx, id, { playerXp: bigXp }, 'test:levels');
    });

    const after = await readPlayer(id);
    expect(after.level).toBeGreaterThanOrEqual(4);
    expect(after.energy).toBe(energyCapForLevel(after.level));
  });
});
