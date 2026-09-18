import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { parseConfig } from './config.js';
import { createApp } from './app.js';
loadEnv({
  path:
    process.env.ENV_FILE ??
    fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
let app: INestApplication | undefined;
try {
  const config = parseConfig(process.env);
  app = await createApp(config);
  await app.listen(config.port, config.host);
} catch {
  await app?.close();
  console.error(
    'API startup failed. Check environment configuration and database/Redis availability.',
  );
  process.exitCode = 1;
}
