// Quantities are decimal strings (six fractional digits). Money is always integer fen.
export const CALCULATION_VERSION = 'unit-cost-v1-half-up';
export function integer(value: number, min = 0): number {
  if (!Number.isSafeInteger(value) || value < min)
    throw new RangeError('Expected safe integer');
  return value;
}
function rounded(n: bigint, d: bigint): number {
  if (d <= 0n || n < 0n) throw new RangeError('Invalid cost ratio');
  return integer(Number((n + d / 2n) / d));
}
const units: Record<string, { dimension: string; factor: bigint }> = {
  g: { dimension: 'mass', factor: 1n },
  kg: { dimension: 'mass', factor: 1000n },
  ml: { dimension: 'volume', factor: 1n },
  L: { dimension: 'volume', factor: 1000n },
  each: { dimension: 'count', factor: 1n },
};
export function quantity(
  value: string,
  unit: string,
  baseUnit: string,
): bigint {
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value))
    throw new RangeError(
      'Quantity requires positive decimal string with at most six fractional digits',
    );
  const from = units[unit],
    to = units[baseUnit];
  if (
    !from ||
    !to ||
    from.dimension !== to.dimension ||
    !['g', 'ml', 'each'].includes(baseUnit)
  )
    throw new RangeError('Incompatible units');
  const [whole, fraction = ''] = value.split('.');
  const amount =
    (BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, '0'))) * from.factor;
  if (amount <= 0n) throw new RangeError('Quantity must be positive');
  return amount;
}
export interface IngredientLine {
  quantity: string;
  unit: string;
  baseUnit: string;
  lossRateBps: number;
  purchase?: { quantity: string; unit: string; totalCostFen: number };
}
export function ingredientCost(line: IngredientLine): number {
  const used = quantity(line.quantity, line.unit, line.baseUnit);
  const loss = integer(line.lossRateBps);
  if (loss >= 10000) throw new RangeError('Loss must be below 10000 bps');
  if (!line.purchase) throw new Error('Missing purchase price');
  const purchased = quantity(
    line.purchase.quantity,
    line.purchase.unit,
    line.baseUnit,
  );
  return rounded(
    BigInt(integer(line.purchase.totalCostFen)) * used * 10000n,
    purchased * BigInt(10000 - loss),
  );
}
export interface CostInput {
  yieldQuantity?: number;
  recipePresent: boolean;
  packagingPresent: boolean;
  lines: IngredientLine[];
  packaging: { quantity: number; unitCostFen: number }[];
  variable?: {
    laborSeconds: number;
    laborFenPerMinute: number;
    otherFen: number;
  };
  fixed?: {
    totalFen: number;
    method: string;
    expectedMonthlyItems: number;
    expectedMonthlyOrders: number;
    itemsPerOrder?: number;
  };
}
export function calculateCost(input: CostInput) {
  const missingInputs: string[] = [];
  if (!input.recipePresent) missingInputs.push('BOM');
  if (!input.packagingPresent) missingInputs.push('PACKAGING');
  const ingredients = input.lines.map((line, index) => {
    quantity(line.quantity, line.unit, line.baseUnit);
    if (!line.purchase) {
      missingInputs.push('PURCHASE_PRICE:' + index);
      return 0;
    }
    return ingredientCost(line);
  });
  const sum = (values: number[]) => values.reduce((a, b) => integer(a + b), 0);
  const yieldQuantity = BigInt(integer(input.yieldQuantity ?? 1, 1));
  const ingredientCostFen = rounded(BigInt(sum(ingredients)), yieldQuantity);
  const packagingCostFen = sum(
    input.packaging.map((p) =>
      integer(integer(p.quantity, 1) * integer(p.unitCostFen)),
    ),
  );
  let variableCostFen = 0,
    allocatedFixedCostFen = 0;
  if (input.variable)
    variableCostFen = rounded(
      BigInt(
        sum([
          rounded(
            BigInt(integer(input.variable.laborSeconds)) *
              BigInt(integer(input.variable.laborFenPerMinute)),
            60n,
          ),
          integer(input.variable.otherFen),
        ]),
      ),
      yieldQuantity,
    );
  else missingInputs.push('VARIABLE_COST');
  if (input.fixed) {
    const f = input.fixed;
    const total = BigInt(integer(f.totalFen));
    if (f.method === 'ITEM')
      allocatedFixedCostFen = rounded(
        total,
        BigInt(integer(f.expectedMonthlyItems, 1)),
      );
    else if (f.method === 'ORDER') {
      if (f.itemsPerOrder === undefined) missingInputs.push('ITEMS_PER_ORDER');
      else
        allocatedFixedCostFen = rounded(
          total,
          BigInt(integer(f.expectedMonthlyOrders, 1)) *
            BigInt(integer(f.itemsPerOrder, 1)),
        );
    } else throw new RangeError('Unsupported allocation method');
  } else missingInputs.push('FIXED_COST');
  return {
    ingredientCostFen,
    packagingCostFen,
    variableCostFen,
    allocatedFixedCostFen,
    fullUnitCostFen: sum([
      ingredientCostFen,
      packagingCostFen,
      variableCostFen,
      allocatedFixedCostFen,
    ]),
    completeness: missingInputs.length
      ? ('PARTIAL' as const)
      : ('COMPLETE' as const),
    missingInputs,
    calculationVersion: CALCULATION_VERSION,
  };
}
export function batchCost(
  totalFen: number,
  theoreticalYield: number,
  actualYield: number,
  waste: number,
): number {
  integer(theoreticalYield, 1);
  integer(actualYield, 1);
  integer(waste);
  if (waste >= actualYield)
    throw new RangeError('Batch must have saleable output');
  return rounded(BigInt(integer(totalFen)), BigInt(actualYield - waste));
}
