import type { Fen, TenantScope } from '@platform/shared';
// One deterministic engine shared by merchant simulation and future checkout adapters.
export { simulatePricing, feeFen, PRICING_VERSION } from '@platform/shared';
export type {
  PricingRule,
  FeeRule,
  PricingInput as PricingScenarioInput,
} from '@platform/shared';
// Phase 0 adapter contract retained for compatibility; do not bypass the full risk input.
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
