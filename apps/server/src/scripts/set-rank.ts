import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { ACCOUNT_RANKS, type AccountRank } from '@mistvale/shared';
import { loadConfig } from '../lib/config';
import * as schema from '../db/schema/index';
import { accounts, auditLog } from '../db/schema/index';

/**
 * Sets an account's rank from the command line.
 *
 * This is how the first admin is created on a fresh VPS (called by DEPLOY.sh) and the
 * recovery path if every admin somehow loses access. Wrapped by scripts/SET_RANK.sh.
 *
 * Usage: pnpm --filter @mistvale/server set-rank <accountName> <player|gamemaster|admin>
 */
async function main(): Promise<void> {
  const [accountName, rankArg] = process.argv.slice(2);

  if (!accountName || !rankArg) {
    console.error('Usage: set-rank <accountName> <player|gamemaster|admin>');
    process.exit(2);
  }

  if (!ACCOUNT_RANKS.includes(rankArg as AccountRank)) {
    console.error(`Invalid rank "${rankArg}". Expected one of: ${ACCOUNT_RANKS.join(', ')}`);
    process.exit(2);
  }
  const rank = rankArg as AccountRank;

  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    const existing = await db
      .select({ id: accounts.id, accountName: accounts.accountName, rank: accounts.rank })
      .from(accounts)
      .where(eq(accounts.accountName, accountName))
      .limit(1);

    const account = existing[0];
    if (!account) {
      console.error(`No account named "${accountName}".`);
      process.exit(1);
    }

    if (account.rank === rank) {
      console.log(`${account.accountName} is already ${rank}. Nothing to do.`);
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ rank, updatedAt: new Date() })
        .where(eq(accounts.id, account.id));

      // Rank changes are privileged: they always leave a trail, CLI included.
      await tx.insert(auditLog).values({
        accountId: account.id,
        actor: 'admin:cli',
        action: 'rank_change',
        entity: 'account',
        entityId: account.id,
        before: { rank: account.rank },
        after: { rank },
      });
    });

    console.log(`${account.accountName}: ${account.rank} → ${rank}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('set-rank failed:');
  console.error(error);
  process.exit(1);
});
