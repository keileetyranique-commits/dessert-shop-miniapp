import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const manifest = JSON.parse(
  readFileSync(new URL('./upstream-files.json', import.meta.url)),
);
const root = new URL('../../vendor/siam-server/', import.meta.url);
let count = 0;
function walk(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      walk(new URL(entry.name + '/', directory), name + '/');
    else {
      const hash = createHash('sha256')
        .update(readFileSync(new URL(entry.name, directory)))
        .digest('hex');
      assert.equal(hash, manifest.files[name], `上游文件发生变化：${name}`);
      count++;
    }
  }
}
walk(root);
assert.equal(count, Object.keys(manifest.files).length);
assert.match(
  readFileSync(new URL('LICENSE', root), 'utf8'),
  /Apache License[\s\S]*Version 2.0/,
);
console.log(`siam 固定版本 ${manifest.commit}：${count} 个文件全部保持原样。`);
