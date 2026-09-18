import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([size, label, data, checksum]);
}
for (const size of [192, 512]) {
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = x / size,
        b = y / size;
      const white =
        a > 0.22 &&
        a < 0.78 &&
        b > 0.25 &&
        b < 0.78 &&
        !(a > 0.38 && a < 0.62 && b > 0.55);
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      rows.set(white ? [255, 255, 255] : [15, 118, 110], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  writeFileSync(
    'apps/merchant-pos/public/icon-' + size + '.png',
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
