import type { Fen, TenantScope } from '@platform/shared';
export interface PaymentInput {
  scope: TenantScope;
  orderId: string;
  amountFen: Fen;
  idempotencyKey: string;
}
export interface PaymentProvider {
  createPayment(input: PaymentInput): Promise<{ paymentId: string }>;
  queryPayment(
    scope: TenantScope,
    paymentId: string,
  ): Promise<{ status: string }>;
  refund(
    input: PaymentInput & { paymentId: string },
  ): Promise<{ refundId: string }>;
  verifyCallback(
    payload: Uint8Array,
    headers: Readonly<Record<string, string>>,
  ): boolean;
}
