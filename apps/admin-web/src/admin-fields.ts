import type { Field } from './Editor';
import { labels, fenToYuan } from './localization';
import type { Named } from './admin-types';
export const named = (items: Named[]) =>
  items.map((i) => ({ value: i.id, label: i.name }));
export const options = (items: string[]) =>
  items.map((value) => ({ value, label: labels[value] ?? value }));
export const text = (name: string, label: string, value = ''): Field => ({
  name,
  label,
  value,
});
export const number = (name: string, label: string, value = 0): Field => ({
  name,
  label: name.includes('Fen')
    ? label.replace('（分）', '（元）')
    : name.endsWith('Bps')
      ? '损耗率（%）'
      : label,
  type: name.includes('Fen')
    ? 'money'
    : name.endsWith('Bps')
      ? 'percent'
      : 'number',
  value,
});
export const status: Field = {
  name: 'status',
  label: '状态',
  optional: true,
  options: options(['ACTIVE', 'INACTIVE']),
};
export const unitOptions = options(['g', 'kg', 'ml', 'L', 'each']);
export const cash = (value: number) => '¥' + fenToYuan(value);
export const storeFields = [
  text('name', '门店名称'),
  text('address', '地址'),
  text('contactPhone', '联系电话'),
  text('businessHours', '营业时间说明'),
].map((f) => ({ ...f, required: f.name === 'name' }));
