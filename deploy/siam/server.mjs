import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFixtures } from './fixtures.mjs';

if (
  process.env.SIAM_BASELINE_FIXTURES !== '1' ||
  process.env.NODE_ENV === 'production'
)
  throw new Error('仅允许显式启用的独立 baseline 演示环境');
const { handle } = createFixtures();
const tokens = new Set();
const root = resolve('public');
const json = (res, data, success = true) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      success,
      code: success ? 200 : 400,
      message: success
        ? '本地演示操作成功（非真实业务）'
        : '此操作未接入演示环境，不会执行真实业务',
      data,
      baseline: true,
    }),
  );
};
createServer(async (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://baseline.local');
    const path = url.pathname;
    if (path.startsWith('/siam-server/')) {
      const api = path.slice('/siam-server'.length);
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          res.statusCode = 413;
          return json(res, null, false);
        }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString();
      if (api === '/rest/merchant/uploadSingleImage') {
        if (!tokens.has(req.headers.authorization)) {
          res.statusCode = 403;
          return json(res, null, false);
        }
        // Do not store or serve uploaded bytes in this visual fixture.
        return json(res, 'drink.svg');
      }
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return json(res, null, false);
      }
      if (api === '/rest/merchant/login') {
        // Public fake credentials, deliberately unrelated to any real account.
        if (
          body.username !== 'demo' ||
          body.password !== Buffer.from('demo123').toString('base64')
        )
          return json(res, null, false);
        const token = randomUUID();
        tokens.add(token);
        return json(res, { token });
      }
      if (!tokens.has(req.headers.authorization)) {
        res.statusCode = 403;
        return json(res, null, false);
      }
      if (api === '/rest/merchant/logout') {
        tokens.delete(req.headers.authorization);
        return json(res, {});
      }
      const data = handle(api, body);
      return json(res, data ?? null, data !== undefined);
    }
    if (path.startsWith('/fixture-media/')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" rx="20" fill="#fff1d6"/><rect x="115" y="50" width="90" height="130" rx="20" fill="#d5a759"/><text x="160" y="215" text-anchor="middle" font-size="20" fill="#684b29">演示商品</text></svg>',
      );
    }
    if (path === '/baseline-info') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('独立演示环境，不接真实收银、支付、打印或生产服务。');
    }
    const file = resolve(
      root,
      '.' + decodeURIComponent(path === '/' ? '/index.html' : path),
    );
    if (!file.startsWith(root + '/')) {
      res.statusCode = 403;
      return res.end();
    }
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
      '.ico': 'image/x-icon',
    };
    res.setHeader(
      'Content-Type',
      (types[extname(file)] || 'application/octet-stream') +
        (['.html', '.js', '.css'].includes(extname(file))
          ? '; charset=utf-8'
          : ''),
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('演示资源不存在');
  }
}).listen(8080, '0.0.0.0', () =>
  console.log('siam 原版商家端：独立演示 fixture，端口 8080'),
);
