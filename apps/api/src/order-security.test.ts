import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppConfig } from './config.js';
import {
  TestModeGuard,
  requestFingerprint,
  checkoutInput,
} from './order-security.js';

test('模拟入口必须同时满足非生产和服务端测试总开关', () => {
  for (const environment of ['development', 'test', 'production']) {
    for (const testMode of [false, true]) {
      const guard = new TestModeGuard({ environment, testMode } as AppConfig);
      if (environment !== 'production' && testMode)
        assert.equal(guard.canActivate(), true);
      else assert.throws(() => guard.canActivate());
    }
  }
});
test('请求指纹不受对象键序影响，但数量与选项变化产生不同指纹', () => {
  assert.equal(
    requestFingerprint({ a: 1, b: { x: 2, y: 3 } }),
    requestFingerprint({ b: { y: 3, x: 2 }, a: 1 }),
  );
  assert.notEqual(
    requestFingerprint({ quantity: 1 }),
    requestFingerprint({ quantity: 2 }),
  );
  assert.notEqual(
    requestFingerprint({ modifiers: ['a'] }),
    requestFingerprint({ modifiers: ['b'] }),
  );
});
test('顾客结算请求不能传入价格、成本、权限或订单状态', () => {
  const input = {
    fulfillment: 'PICKUP',
    items: [
      {
        variantId: 'f48b03b6-dc31-4e80-9327-b898187f14c4',
        quantity: 1,
        modifierIds: [],
      },
    ],
  };
  assert.equal(checkoutInput.safeParse(input).success, true);
  for (const field of [
    'salePriceFen',
    'variableCostFen',
    'status',
    'role',
    'merchantId',
    'storeId',
  ])
    assert.equal(
      checkoutInput.safeParse({ ...input, [field]: 0 }).success,
      false,
    );
  assert.equal(
    checkoutInput.safeParse({
      ...input,
      items: [{ ...input.items[0], salePriceFen: 1 }],
    }).success,
    false,
  );
  assert.equal(
    checkoutInput.safeParse({
      ...input,
      items: [{ ...input.items[0], quantity: 0 }],
    }).success,
    false,
  );
  assert.equal(
    checkoutInput.safeParse({
      ...input,
      items: [{ ...input.items[0], quantity: 1.5 }],
    }).success,
    false,
  );
});
