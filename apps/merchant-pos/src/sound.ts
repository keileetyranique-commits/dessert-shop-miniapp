export function newOrderIds(
  orders: { id: string; orderStatus: string }[],
  seen: Set<string>,
): string[] {
  return orders
    .filter(
      (o) =>
        ['AWAITING_ACCEPTANCE', 'PREPARING'].includes(o.orderStatus) &&
        !seen.has(o.id),
    )
    .map((o) => o.id);
}
export function validateSound(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (file.size <= 0 || file.size > 1024 * 1024)
    throw Error('铃声文件须在 1 MB 以内');
  if (
    !/\.(mp3|wav|ogg)$/i.test(file.name) ||
    ![
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
    ].includes(file.type)
  )
    throw Error('请选择 MP3、WAV 或 OGG 音频');
}
