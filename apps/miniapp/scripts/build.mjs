import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { publicConfig } from './config.mjs';
const require = createRequire(import.meta.url);
const config = publicConfig(process.env);
const result = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync('src', 'dist', {
  recursive: true,
  filter: (path) => !path.endsWith('.ts'),
});
mkdirSync('dist', { recursive: true });
writeFileSync(
  'dist/runtime.js',
  'exports.API_BASE_URL = ' + JSON.stringify(config.apiBase) + ';\n',
);
writeFileSync(
  'dist/project.config.json',
  JSON.stringify(
    {
      appid: config.appid,
      projectname: 'store-platform',
      compileType: 'miniprogram',
      miniprogramRoot: './',
      setting: { urlCheck: true, es6: true, minified: true },
    },
    null,
    2,
  ) + '\n',
);
