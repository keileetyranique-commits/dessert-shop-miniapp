import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
function run(args) {
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.error)
    throw new Error(
      'Docker Compose is required. Install and start Docker Desktop, then retry pnpm dev.',
    );
  if (result.status !== 0)
    throw new Error('Docker command failed; see output above.');
}
try {
  run(['compose', 'version']);
  if (!existsSync('.env')) {
    const password = randomBytes(24).toString('hex'),
      redis = randomBytes(24).toString('hex');
    writeFileSync(
      '.env',
      [
        'APP_ENV=development',
        'NODE_ENV=development',
        'TEST_MODE=true',
        'POSTGRES_USER=platform',
        'POSTGRES_DB=platform_development',
        'POSTGRES_PASSWORD=' + password,
        'REDIS_PASSWORD=' + redis,
        'DATABASE_URL=postgresql://platform:' +
          password +
          '@postgres:5432/platform_development',
        'REDIS_URL=redis://:' + redis + '@redis:6379/0',
        'API_PORT=3000',
        'CORS_ORIGINS=http://localhost:5173,http://localhost:5174',
        '',
      ].join('\n'),
      { flag: 'wx', mode: 0o600 },
    );
  }
  const env = readFileSync('.env', 'utf8');
  if (
    !/^APP_ENV=development\r?$/m.test(env) ||
    !/^POSTGRES_DB=platform_development\r?$/m.test(env)
  )
    throw new Error(
      'pnpm dev only accepts the development environment. Use a separate production deployment.',
    );
  run(['compose', 'up', '--build', '--wait', '--wait-timeout', '180']);
  console.log(
    'API: http://localhost:3000/api/v1/health/ready\nAdmin: http://localhost:5173\nPOS: http://localhost:5174\nStop: docker compose down (data retained)',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
