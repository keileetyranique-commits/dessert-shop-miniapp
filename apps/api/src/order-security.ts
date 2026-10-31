import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  ForbiddenException,
  type CanActivate,
} from '@nestjs/common';
import { CONFIG, type AppConfig } from './config.js';
import { z, id, fulfillment } from './validation.js';

/** Apply together with AdminGuard and the role policy, never in place of authentication. */
@Injectable()
export class TestModeGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(): boolean {
    if (!this.config.testMode || this.config.environment === 'production')
      throw new ForbiddenException('当前环境未开放模拟测试功能');
    return true;
  }
}

export const checkoutInput = z
  .object({
    fulfillment,
    quoteId: id.optional(),
    items: z
      .array(
        z
          .object({
            variantId: id,
            quantity: z.number().int().min(1).max(1000),
            modifierIds: z.array(id).max(50).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

/** Deterministic JSON fingerprint; array order is intentionally significant. */
export function requestFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, canonical(v)]),
      );
    return input;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
