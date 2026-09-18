export type Fen = number & { readonly __unit: 'fen' };
export function fen(value: number): Fen {
  if (!Number.isSafeInteger(value))
    throw new RangeError('Money must be safe integer fen');
  return value as Fen;
}
export function addFen(...values: Fen[]): Fen {
  return values.reduce<Fen>((sum, value) => fen(sum + fen(value)), fen(0));
}
export function formatFen(value: Fen): string {
  const amount = BigInt(fen(value));
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export interface TenantScope {
  merchantId: string;
  brandId: string;
  storeId: string;
}
export function tenantScope(
  merchantId: string,
  brandId: string,
  storeId: string,
): TenantScope {
  if (![merchantId, brandId, storeId].every((id) => id.trim().length > 0))
    throw new Error('Tenant scope is required');
  return { merchantId, brandId, storeId };
}
export interface RuntimeInfo {
  service: string;
  testMode: boolean;
  environment: string;
  schemaVersion: 1;
}
export type Fulfillment = 'DELIVERY' | 'PICKUP' | 'DINE_IN' | 'SCHEDULED';
