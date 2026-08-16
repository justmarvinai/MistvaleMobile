import closeWithGrace from 'close-with-grace';
import { buildApp } from './app';
import { loadConfig } from './lib/config';
import { startMaintenanceJobs } from './jobs/maintenance';

/**
 * Process entrypoint.
 *
 * Boots the server, starts the scheduled jobs, and shuts both down cleanly so systemd
 * restarts never drop an in-flight request or leak a database connection.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  const stopJobs = startMaintenanceJobs(app);

  closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
    if (err) {
      app.log.error({ err }, 'shutting down after fatal error');
    } else {
      app.log.info({ signal }, 'shutting down');
    }
    stopJobs();
    await app.close();
  });

  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(
    { port: config.PORT, host: config.HOST, env: config.NODE_ENV },
    'mistvale server listening',
  );
}

main().catch((error: unknown) => {
  // Nothing is initialised yet at this point, so fall back to the console.
  console.error('Fatal: server failed to start');
  console.error(error);
  process.exit(1);
});
