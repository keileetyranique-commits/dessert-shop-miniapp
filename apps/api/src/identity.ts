import { createHash, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
export const identitySchema = z
  .object({
    id: z.string().min(1),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    merchantId: z.string().uuid(),
    brandId: z.string().uuid(),
    storeIds: z.union([z.literal('*'), z.array(z.string().uuid()).min(1)]),
    role: z.enum(['OWNER', 'COST_MANAGER', 'MANAGER']),
  })
  .strict()
  .refine(
    (v) => v.storeIds !== '*' || v.role === 'OWNER',
    'Only OWNER can have brand-wide access',
  );
export type Identity = z.infer<typeof identitySchema>;
export function parseIdentities(value: string | undefined): Identity[] {
  const identities = z
    .array(identitySchema)
    .max(100)
    .parse(JSON.parse(value ?? '[]'));
  if (new Set(identities.map((i) => i.token)).size !== identities.length)
    throw new Error('Duplicate admin credentials');
  return identities;
}
export function authenticate(
  authorization: string | undefined,
  identities: Identity[],
): Identity {
  if (!authorization?.startsWith('Bearer ') || authorization.length > 200)
    throw new UnauthorizedException('请提供有效的后台访问凭据');
  const digest = (s: string) => createHash('sha256').update(s).digest();
  const token = digest(authorization.slice(7));
  const found = identities.find((i) => timingSafeEqual(token, digest(i.token)));
  if (!found) throw new UnauthorizedException('后台访问凭据无效');
  return found;
}
export function authorizeStore(identity: Identity, storeId: string) {
  if (identity.storeIds !== '*' && !identity.storeIds.includes(storeId))
    throw new ForbiddenException('无此门店权限');
}
export function requireCostRole(identity: Identity) {
  if (!['OWNER', 'COST_MANAGER'].includes(identity.role))
    throw new ForbiddenException('成本数据仅向授权高级角色开放');
}
