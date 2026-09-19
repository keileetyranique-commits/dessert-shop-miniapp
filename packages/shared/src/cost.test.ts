import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantity, ingredientCost, calculateCost, batchCost } from './cost.js';
test('exact quantities convert kg/g and L/ml without mixing dimensions', () => {
  assert.equal(quantity('1.25', 'kg', 'g'), 1250000000n);
  assert.equal(quantity('0.5', 'L', 'ml'), 500000000n);
  assert.throws(() => quantity('1', 'kg', 'ml'));
  for (const q of ['0', '-1', '1e3', '0.0000001'])
    assert.throws(() => quantity(q, 'g', 'g'));
});
test('ingredient loss and rational money round half up once per BOM line', () => {
  assert.equal(
    ingredientCost({
      quantity: '100',
      unit: 'g',
      baseUnit: 'g',
      lossRateBps: 2000,
      purchase: { quantity: '1', unit: 'kg', totalCostFen: 1000 },
    }),
    125,
  );
  assert.equal(
    ingredientCost({
      quantity: '1',
      unit: 'g',
      baseUnit: 'g',
      lossRateBps: 0,
      purchase: { quantity: '2', unit: 'g', totalCostFen: 1 },
    }),
    1,
  );
  for (const lossRateBps of [-1, 10000, 0.2])
    assert.throws(() =>
      ingredientCost({
        quantity: '1',
        unit: 'g',
        baseUnit: 'g',
        lossRateBps,
        purchase: { quantity: '1', unit: 'kg', totalCostFen: 100 },
      }),
    );
});
test('complete BOM, packaging, variable labour and monthly allocations', () => {
  const input = {
    lines: [
      {
        quantity: '100',
        unit: 'g',
        baseUnit: 'g',
        lossRateBps: 2000,
        purchase: { quantity: '1', unit: 'kg', totalCostFen: 1000 },
      },
    ],
    packaging: [{ quantity: 2, unitCostFen: 25 }],
    recipePresent: true,
    packagingPresent: true,
    variable: { laborSeconds: 30, laborFenPerMinute: 100, otherFen: 10 },
    fixed: {
      totalFen: 300000,
      method: 'ITEM',
      expectedMonthlyItems: 3000,
      expectedMonthlyOrders: 1000,
      itemsPerOrder: 3,
    },
  };
  const result = calculateCost(input);
  assert.equal(result.ingredientCostFen, 125);
  assert.equal(result.packagingCostFen, 50);
  assert.equal(result.variableCostFen, 60);
  assert.equal(result.allocatedFixedCostFen, 100);
  assert.equal(result.fullUnitCostFen, 335);
  assert.equal(result.completeness, 'COMPLETE');
  assert.equal(
    calculateCost({ ...input, fixed: { ...input.fixed, method: 'ORDER' } })
      .allocatedFixedCostFen,
    100,
  );
  assert.throws(() =>
    calculateCost({
      ...input,
      fixed: { ...input.fixed, expectedMonthlyItems: 0 },
    }),
  );
});
test('missing data is explicitly partial, never silently complete', () => {
  const result = calculateCost({
    recipePresent: false,
    packagingPresent: false,
    lines: [],
    packaging: [],
  });
  assert.equal(result.completeness, 'PARTIAL');
  for (const missing of ['BOM', 'PACKAGING', 'VARIABLE_COST', 'FIXED_COST'])
    assert.ok(result.missingInputs.includes(missing));
  const noPrice = calculateCost({
    recipePresent: true,
    packagingPresent: true,
    lines: [{ quantity: '1', unit: 'g', baseUnit: 'g', lossRateBps: 0 }],
    packaging: [],
  });
  assert.ok(noPrice.missingInputs.includes('PURCHASE_PRICE:0'));
});
test('reject fractional money and overflow, and validate batch yield', () => {
  for (const totalCostFen of [0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      ingredientCost({
        quantity: '1',
        unit: 'g',
        baseUnit: 'g',
        lossRateBps: 0,
        purchase: { quantity: '1', unit: 'g', totalCostFen },
      }),
    );
  assert.throws(() =>
    ingredientCost({
      quantity: '999999999999',
      unit: 'g',
      baseUnit: 'g',
      lossRateBps: 9999,
      purchase: {
        quantity: '0.000001',
        unit: 'g',
        totalCostFen: Number.MAX_SAFE_INTEGER,
      },
    }),
  );
  assert.equal(batchCost(1000, 12, 10, 2), 125);
  assert.throws(() => batchCost(100, 10, 10, 10));
});
