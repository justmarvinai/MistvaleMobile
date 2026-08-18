import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath } from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { energyCapForLevel, xpForNextLevel } from '../../lib/progression';
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
