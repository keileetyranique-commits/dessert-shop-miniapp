import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createFixtures } from './fixtures.mjs';

test('验收导航对应数据不为空，财务与订单均为虚构数据', () => {
  const { handle } = createFixtures();
  for (const entity of [
    'menu',
    'goods',
    'order',
    'coupons',
    'fullReductionRule',
    'printer',
    'merchantBillingRecord',
    'merchantWithdrawRecord',
    'rider',
    'appraise',
  ]) {
    assert.ok(
      handle(`/rest/merchant/${entity}/list`).records.length > 0,
      entity,
    );
  }
  assert.ok(
    handle('/rest/merchant/statistics/todayStatistic').dayCountPaid > 0,
  );
  assert.equal(handle('/rest/merchant/order/statistic').resultList.length, 7);
  assert.equal(handle('/rest/merchant/getLoginMerchantInfo').auditStatus, 2);
  assert.ok(handle('/rest/merchant/order/todayOrderList').records.length);
  assert.ok(handle('/rest/merchant/order/afterSalesList').records.length);
});
test('分类和商品演示增删改仅作用于当前 fixture 实例', () => {
  const a = createFixtures(),
    b = createFixtures();
  for (const entity of ['menu', 'goods']) {
    const path = `/rest/merchant/${entity}`;
    const id = a.handle(path + '/insert', { name: '验收新增', price: 18.8 });
    a.handle(path + '/update', { id, name: '验收修改' });
    assert.equal(a.handle(path + '/getById', { id }).name, '验收修改');
    assert.equal(b.handle(path + '/getById', { id }), null);
    a.handle(path + '/delete', { id });
    assert.equal(a.handle(path + '/getById', { id }), null);
  }
});
test('原版自取/外卖标签过滤有数据，未知操作与真实执行操作不伪报成功', () => {
  const { handle } = createFixtures();
  for (const shoppingWay of [1, 2])
    for (const status of [2, 3, 4]) {
      const page = handle('/rest/merchant/order/list', { shoppingWay, status });
      assert.equal(page.total, 1);
      assert.equal(page.records[0].shoppingWay, shoppingWay);
    }
  for (const path of [
    '/rest/merchant/merchantWithdrawRecord/insert',
    '/rest/merchant/order/updateStatus',
    '/rest/merchant/order/auditAfterSalesOrder',
    '/rest/merchant/printer/insert',
    '/rest/merchant/unknown/list',
  ])
    assert.equal(handle(path), undefined);
});
test('缺少显式开关或生产模式必须拒绝启动 mock', () => {
  for (const env of [
    { SIAM_BASELINE_FIXTURES: '', NODE_ENV: 'development' },
    { SIAM_BASELINE_FIXTURES: '1', NODE_ENV: 'production' },
  ]) {
    const result = spawnSync(process.execPath, ['deploy/siam/server.mjs'], {
      env: { ...process.env, ...env },
      timeout: 3000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr.toString(), /仅允许显式启用/);
  }
});
