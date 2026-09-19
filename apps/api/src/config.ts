export const CONFIG = Symbol('CONFIG');
export interface AppConfig {
  adminIdentities: Identity[];
  environment: string;
  testMode: boolean;
  databaseUrl: string;
  redisUrl: string;
  port: number;
  host: string;
  corsOrigins: string[];
}
export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const environment = env.APP_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment))
    throw new Error('Invalid APP_ENV');
  const mode = env.TEST_MODE ?? 'false';
  if (!['true', 'false'].includes(mode))
    throw new Error('TEST_MODE must be true or false');
  if (
    (environment === 'production' || env.NODE_ENV === 'production') &&
    mode === 'true'
  )
    throw new Error('Production forbids TEST_MODE');
  function url(name: string, protocols: string[]): string {
    const value = env[name];
    if (!value) throw new Error(`Missing ${name}`);
    try {
      if (!protocols.includes(new URL(value).protocol)) throw new Error();
    } catch {
      throw new Error(`Invalid ${name}`);
    }
    return value;
  }
  const port = Number(env.API_PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid API_PORT');
  const corsOrigins = (
    env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174'
  )
    .split(',')
    .filter(Boolean);
  for (const origin of corsOrigins) {
    if (new URL(origin).origin !== origin)
      throw new Error('CORS_ORIGINS must contain exact origins');
  }
  return {
    adminIdentities: parseIdentities(env.ADMIN_IDENTITIES),
    environment,
    testMode: mode === 'true',
    databaseUrl: url('DATABASE_URL', ['postgresql:', 'postgres:']),
    redisUrl: url('REDIS_URL', ['redis:', 'rediss:']),
    port,
    host: env.API_HOST ?? '127.0.0.1',
    corsOrigins,
  };
}
import { parseIdentities, type Identity } from './identity.js';
