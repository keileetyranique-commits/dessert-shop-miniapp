import type { Fen, TenantScope } from '@platform/shared';
// Business calculations are implemented in Phase 2, never as floating-point currency.
export interface PricingInput {
  scope: TenantScope;
  subtotalFen: Fen;
  costFen: Fen;
}
export interface PricingStrategy {
  calculate(
    input: PricingInput,
  ): Promise<{ payableFen: Fen; contributionProfitFen: Fen }>;
}
