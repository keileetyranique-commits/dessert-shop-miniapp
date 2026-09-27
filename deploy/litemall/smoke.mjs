import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const env = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
const base = `http://127.0.0.1:${env.BASELINE_PORT}`;
let token;
async function api(path, body) {
  const response = await fetch(base + '/admin' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Litemall-Admin-Token': token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, `接口状态：${path}`);
  const result = await response.json();
  assert.equal(result.errno, 0, `接口失败：${path}（${result.errno}）`);
  return result.data;
}
let ready = false;
for (let i = 0; i < 120; i++) {
  try {
    const response = await fetch(base + '/', {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok && (await response.text()).includes('<html')) {
      ready = true;
      break;
    }
  } catch {
    /* Wait for MySQL initialization and the original Spring application. */
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
assert.ok(ready, '原版后台未就绪');
token = (
  await api('/auth/login', {
    username: env.BASELINE_ADMIN_USER,
    password: env.BASELINE_ADMIN_PASSWORD,
  })
).token;
assert.ok(token);
await api('/auth/info');
console.log('原版后台页面与登录通过');
const name = '基座验收-' + randomUUID();
let category, goods;
try {
  category = await api('/category/create', {
    name,
    level: 'L1',
    pid: 0,
    iconUrl: '',
    picUrl: '',
    keywords: '',
    desc: '验收分类',
  });
  assert.ok(category.id);
  await api('/category/update', { ...category, name: name + '-已编辑' });
  assert.equal(
    (await api('/category/read?id=' + category.id)).name,
    name + '-已编辑',
  );
  const product = {
    goods: {
      goodsSn: name,
      name,
      categoryId: category.id,
      brandId: 0,
      brief: '原版商品验收',
      detail: '<p>原版表单对应数据</p>',
      isOnSale: true,
      isNew: true,
      isHot: false,
      gallery: [],
      picUrl: '',
      unit: '件',
      counterPrice: 20,
    },
    specifications: [{ specification: '规格', value: '标准', picUrl: '' }],
    products: [{ specifications: ['标准'], price: 18.8, number: 10, url: '' }],
    attributes: [{ attribute: '测试属性', value: '标准' }],
  };
  await api('/goods/create', product);
  goods = (await api('/goods/list?name=' + encodeURIComponent(name))).list.find(
    (row) => row.name === name,
  );
  assert.ok(goods?.id);
  const detail = await api('/goods/detail?id=' + goods.id);
  await api('/goods/update', {
    goods: { ...detail.goods, name: name + '-已编辑' },
    specifications: detail.specifications,
    products: detail.products,
    attributes: detail.attributes,
  });
  assert.equal(
    (await api('/goods/detail?id=' + goods.id)).goods.name,
    name + '-已编辑',
  );
  await api('/goods/delete', { id: goods.id });
  assert.equal(
    (await api('/goods/list?name=' + encodeURIComponent(name))).list.length,
    0,
  );
  goods = undefined;
  await api('/category/delete', { id: category.id });
  assert.ok(
    !(await api('/category/list')).list.some((row) => row.id === category.id),
    '删除的分类不应继续出现在列表中',
  );
  category = undefined;
  console.log('原版商品新增/编辑/删除、分类新增/读取/编辑/删除通过');
  for (const path of [
    '/order/list',
    '/aftersale/list',
    '/user/list',
    '/ad/list',
    '/coupon/list',
    '/admin/list',
    '/role/list',
    '/config/mall',
    '/config/express',
    '/stat/user',
    '/stat/order',
    '/stat/goods',
  ])
    await api(path);
  console.log('订单、售后、会员、推广、系统、配置和统计原有接口通过');
} finally {
  if (goods) await api('/goods/delete', { id: goods.id });
  if (category) await api('/category/delete', { id: category.id });
  if (token) await api('/auth/logout', {});
}
