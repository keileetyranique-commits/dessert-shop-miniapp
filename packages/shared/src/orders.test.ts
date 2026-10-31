import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { transitionOrder, initialOrderState } from './orders.js';

describe('订单、支付和履约状态', () => {
  it('履约异常可明确终止并退款，但不能撤销已交付订单', () => {
    let state = initialOrderState('DELIVERY');
    for (const action of [
      'PAY',
      'ACCEPT',
      'READY',
      'DISPATCH',
      'DRIVER_FAIL',
    ] as const)
      state = transitionOrder(state, action);
    const cancelled = transitionOrder(state, 'RECOVER_CANCEL');
    assert.equal(cancelled.payment, 'REFUNDED');
    assert.equal(cancelled.reservation, 'RELEASED');
    assert.deepEqual(transitionOrder(cancelled, 'RECOVER_CANCEL'), cancelled);
    for (const action of ['DISPATCH', 'DRIVER_ACCEPT', 'DELIVERED'] as const)
      state = transitionOrder(state, action);
    assert.throws(() => transitionOrder(state, 'RECOVER_CANCEL'));
  });
  it('自取完成只消耗一次预占库存', () => {
    let state = initialOrderState('PICKUP');
    for (const action of ['PAY', 'ACCEPT', 'READY', 'PICKUP'] as const)
      state = transitionOrder(state, action);
    assert.equal(state.order, 'COMPLETED');
    assert.equal(state.payment, 'PAID');
    assert.equal(state.reservation, 'CONSUMED');
    assert.deepEqual(transitionOrder(state, 'PICKUP'), state);
  });
  it('配送必须经过发单和骑手接单，失败可重试', () => {
    let state = initialOrderState('DELIVERY');
    for (const action of [
      'PAY',
      'ACCEPT',
      'READY',
      'DISPATCH',
      'DRIVER_FAIL',
    ] as const)
      state = transitionOrder(state, action);
    assert.equal(state.fulfillment, 'FAILED');
    assert.throws(() => transitionOrder(state, 'DELIVERED'));
    for (const action of ['DISPATCH', 'DRIVER_ACCEPT', 'DELIVERED'] as const)
      state = transitionOrder(state, action);
    assert.equal(state.reservation, 'CONSUMED');
  });
  it('付款后拒单退款释放库存，重复回调不能复活订单', () => {
    const paid = transitionOrder(initialOrderState('DINE_IN'), 'PAY');
    const cancelled = transitionOrder(paid, 'REJECT');
    assert.equal(cancelled.payment, 'REFUNDED');
    assert.equal(cancelled.reservation, 'RELEASED');
    assert.deepEqual(transitionOrder(cancelled, 'PAY'), cancelled);
    assert.deepEqual(transitionOrder(cancelled, 'REJECT'), cancelled);
  });
  it('支付失败或超时释放库存，不能再次扣款', () => {
    for (const action of ['PAY_FAIL', 'EXPIRE'] as const) {
      const state = transitionOrder(initialOrderState('PICKUP'), action);
      assert.equal(state.order, 'CANCELLED');
      assert.equal(state.reservation, 'RELEASED');
      assert.deepEqual(transitionOrder(state, 'PAY'), state);
    }
  });
  it('乱序、错误履约和制作中取消均拒绝', () => {
    const initial = initialOrderState('PICKUP');
    assert.throws(() => transitionOrder(initial, 'ACCEPT'));
    assert.throws(() => transitionOrder(initial, 'READY'));
    const preparing = transitionOrder(
      transitionOrder(initial, 'PAY'),
      'ACCEPT',
    );
    assert.throws(() => transitionOrder(preparing, 'CANCEL'));
    const ready = transitionOrder(preparing, 'READY');
    assert.throws(() => transitionOrder(ready, 'DISPATCH'));
  });
  it('已成功支付后迟到的失败回调不能回退状态', () => {
    const paid = transitionOrder(initialOrderState('PICKUP'), 'PAY');
    assert.deepEqual(transitionOrder(paid, 'PAY_FAIL'), paid);
  });
});
