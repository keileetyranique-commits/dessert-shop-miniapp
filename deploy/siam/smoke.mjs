import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:18081';
let token;
async function request(path, body = {}) {
  const response = await fetch(base + '/siam-server' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, json: await response.json() };
}
let page;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    page = await fetch(base);
    if (page.ok) break;
  } catch {
    // Compose may return before the isolated HTTP server is ready.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(page, '独立商家页面未在 30 秒内启动');
assert.equal(page.status, 200);
assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
const html = await page.text();
assert.match(html, /全部数据为本地演示/);
for (const [, src] of html.matchAll(/src=["']?([^"' >]+\.js)/g))
  assert.equal((await fetch(base + '/' + src.replace(/^\//, ''))).status, 200);
assert.equal((await request('/rest/merchant/goods/list')).response.status, 403);
assert.equal(
  (await request('/rest/merchant/login', { username: 'invalid', password: '' }))
    .json.success,
  false,
);
token = (
  await request('/rest/merchant/login', {
    username: 'demo',
    password: Buffer.from('demo123').toString('base64'),
  })
).json.data.token;
assert.ok(token);
for (const entity of [
  'goods',
  'menu',
  'order',
  'coupons',
  'fullReductionRule',
  'printer',
  'merchantBillingRecord',
  'merchantWithdrawRecord',
]) {
  const result = (await request(`/rest/merchant/${entity}/list`)).json;
  assert.equal(result.baseline, true);
  assert.ok(result.data.records.length, entity);
}
for (const path of [
  '/rest/merchant/getLoginMerchantInfo',
  '/rest/merchant/shop/getLoginMerchantShopInfo',
  '/rest/merchant/statistics/todayStatistic',
  '/rest/merchant/order/statistic',
  '/rest/merchant/order/afterSalesList',
  '/rest/merchant/order/todayOrderList',
])
  assert.equal((await request(path)).json.success, true);
assert.equal(
  (
    await request('/rest/merchant/merchantWithdrawRecord/insert', {
      withdrawAmount: 100,
    })
  ).json.success,
  false,
);
console.log('原版静态页面、演示登录、主要导航数据及真实业务阻断检查通过。');
