import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const manifest = JSON.parse(
  readFileSync(new URL('./upstream-files.json', import.meta.url)),
);
const root = new URL('../../vendor/litemall/', import.meta.url);
const changes = JSON.parse(
  readFileSync(new URL('./local-changes.json', import.meta.url)),
);
let count = 0;
function walk(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      walk(new URL(entry.name + '/', directory), name + '/');
    else {
      assert.ok(manifest.files[name], `未记录的上游文件：${name}`);
      const hash = createHash('sha256')
        .update(readFileSync(new URL(entry.name, directory)))
        .digest('hex');
      assert.equal(
        hash,
        changes[name]?.sha256 ?? manifest.files[name],
        `来源文件变化：${name}`,
      );
      count++;
    }
  }
}
walk(root);
assert.equal(count, Object.keys(manifest.files).length, '迁入目录缺失文件');
assert.match(readFileSync(new URL('LICENSE', root), 'utf8'), /MIT License/);
console.log(
  `固定上游 ${manifest.commit}：${count} 个文件校验通过，${Object.keys(changes).length} 个已记录的配置调整。`,
);
