import type { Fen, TenantScope } from '@platform/shared';
export interface DeliveryInput {
  scope: TenantScope;
  orderId: string;
  idempotencyKey: string;
}
export interface DeliveryQuote {
  provider: string;
  quoteId: string;
  priceFen: Fen;
  expiresAt: string;
}
export interface DeliveryProvider {
  quote(input: DeliveryInput): Promise<DeliveryQuote>;
  createDelivery(
    input: DeliveryInput & { quoteId: string },
  ): Promise<{ deliveryId: string }>;
  cancelDelivery(input: DeliveryInput & { deliveryId: string }): Promise<void>;
  queryDelivery(
    scope: TenantScope,
    deliveryId: string,
  ): Promise<{ status: string }>;
  verifyCallback(
    payload: Uint8Array,
    headers: Readonly<Record<string, string>>,
  ): boolean;
}
