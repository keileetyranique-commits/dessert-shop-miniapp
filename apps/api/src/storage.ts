import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
export const STORAGE = Symbol('STORAGE');
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class LocalStorage implements StorageAdapter {
  private root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    if (
      !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(
        key,
      )
    )
      throw Error('非法文件标识');
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw Error('非法文件路径');
    return path;
  }
  async put(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
    await writeFile(path, data, { flag: 'wx', mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    await unlink(this.path(key));
  }
}
