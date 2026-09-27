import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function normalizeImage(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}) {
  const name = file.originalname;
  if (
    !name ||
    name.length > 180 ||
    /[\\/:]/.test(name) ||
    Array.from(name).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    name.includes('..') ||
    !/^[^.]+\.(jpe?g|png|webp)$/i.test(name)
  )
    throw new BadRequestException('图片文件名不合法');
  if (
    file.size < 1 ||
    file.size > MAX_IMAGE_BYTES ||
    file.buffer.length !== file.size
  )
    throw new BadRequestException('图片大小必须在五兆以内');
  const b = file.buffer;
  const kind = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? 'jpeg'
      : b.toString('ascii', 0, 4) === 'RIFF' &&
          b.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : '';
  const extension = name.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg');
  if (!kind || file.mimetype !== 'image/' + kind || extension !== kind)
    throw new BadRequestException('图片格式与文件内容不一致');
  try {
    const decoder = sharp(b, {
      limitInputPixels: 20000000,
      failOn: 'warning',
      animated: false,
    });
    const info = await decoder.metadata();
    if (info.format !== kind || (info.pages ?? 1) !== 1) throw Error();
    // Decode and re-encode: strip metadata/trailing payload, never serve the original bytes.
    const output = await decoder
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    if (output.length > MAX_IMAGE_BYTES) throw Error();
    return output;
  } catch {
    throw new BadRequestException('图片无法读取，请更换完整的静态图片');
  }
}
