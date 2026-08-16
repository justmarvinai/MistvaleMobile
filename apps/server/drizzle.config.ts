import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://mistvale:mistvale_dev@127.0.0.1:5432/mistvale',
  },
  strict: true,
  verbose: true,
});
