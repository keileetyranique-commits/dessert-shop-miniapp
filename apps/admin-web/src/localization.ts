const MAX_FEN = 2147483647n;
function decimalToInteger(value: string, max: bigint): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) || value.length > 24)
    throw Error('请输入最多两位小数的非负数');
  const [whole, part = ''] = value.split('.');
  const amount = BigInt(whole!) * 100n + BigInt(part.padEnd(2, '0'));
  if (amount > max) throw Error('输入金额或比例超出允许范围');
  return Number(amount);
}
export const yuanToFen = (value: string) => decimalToInteger(value, MAX_FEN);
export const percentToBps = (value: string) => decimalToInteger(value, 10000n);
export function fenToYuan(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('金额不合法');
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
export const bpsToPercent = (value: number) =>
  fenToYuan(value)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
export const labels: Record<string, string> = {
  ACTIVE: '已启用',
  INACTIVE: '已停用',
  OWNER: '老板',
  MANAGER: '商品管理员',
  COST_MANAGER: '经营分析管理员',
  g: '克',
  kg: '公斤',
  ml: '毫升',
  L: '升',
  each: '个',
  PICKUP: '到店自取',
  DELIVERY: '配送',
  DINE_IN: '堂食',
  SKU: '单件商品包装',
  ORDER: '整单',
  ITEM: '按商品数量',
};
