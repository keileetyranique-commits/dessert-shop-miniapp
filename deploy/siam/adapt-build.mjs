// Only the disposable Docker build copy is changed; vendor remains byte-identical.
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const edit = (name, transform) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, transform(fs.readFileSync(file, 'utf8')));
};
edit('package-lock.json', (text) => {
  const lock = JSON.parse(text);
  function migrate(dependencies) {
    for (const [name, entry] of Object.entries(dependencies || {})) {
      if (entry.resolved?.includes('taobao.org'))
        entry.resolved = `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${entry.version}.tgz`;
      migrate(entry.dependencies);
    }
  }
  migrate(lock.dependencies);
  return JSON.stringify(lock, null, 2);
});
edit('package.json', (text) => {
  const pkg = JSON.parse(text);
  delete pkg.devDependencies['node-sass'];
  pkg.devDependencies.sass = '1.32.13';
  pkg.devDependencies['sass-loader'] = '7.3.1';
  pkg.dependencies.qs = '6.14.0';
  return JSON.stringify(pkg, null, 2);
});
edit('webpack.config.js', (text) =>
  text.replace(
    "'sass-loader'",
    "{ loader: 'sass-loader', options: { implementation: require('sass') } }",
  ),
);
edit('config/index.js', (text) =>
  text
    .replaceAll('http://localhost:9200/siam-server', '/siam-server')
    .replace('http://127.0.0.1:5174', '/baseline-info')
    .replace(
      'https://siam-hangzhou.oss-cn-hangzhou.aliyuncs.com/',
      '/fixture-media/',
    ),
);
// Upstream import casing fails on Linux; no route/interaction changes.
edit('src/routes.js', (text) =>
  text.replace('./pages/login/login.vue', './pages/login/Login.vue'),
);
// Keep the original avatar element, replacing only its external asset address.
edit('src/pages/Home.vue', (text) =>
  text
    .replace(
      'https://siam-hangzhou.oss-cn-hangzhou.aliyuncs.com/data/images/system/logo.png',
      '/static/user.png',
    )
    .replace(
      '"https://siam.oss-cn-hangzhou.aliyuncs.com/" + user.shopLogoImg',
      '"/static/user.png"',
    ),
);
// Isolate the original printer/WebSocket integration, not the printer pages.
fs.writeFileSync(
  path.join(root, 'src/components/internal/orderPrint.js'),
  `export default { install(Vue) {
  Vue.prototype.$orderPrint = { init() {}, print() {}, close() {} };
} };`,
);
edit('index.html', (text) =>
  text.replace(
    '<body>',
    '<body><div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff2cc;color:#604500;text-align:center;font:12px sans-serif;padding:5px;pointer-events:none">独立视觉验收 · 全部数据为本地演示 · 不连接真实支付、打印或生产服务</div>',
  ),
);
