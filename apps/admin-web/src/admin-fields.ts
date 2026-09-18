import { fen, formatFen } from '@platform/shared';
import type { Field } from './Editor';
import type { Named } from './admin-types';
export const named = (items: Named[]) =>
  items.map((i) => ({ value: i.id, label: i.name }));
export const options = (items: string[]) =>
  items.map((value) => ({ value, label: value }));
export const text = (name: string, label: string, value = ''): Field => ({
  name,
  label,
  value,
});
export const number = (name: string, label: string, value = 0): Field => ({
  name,
  label,
  type: 'number',
  value,
});
export const status: Field = {
  name: 'status',
  label: '状态',
  options: options(['ACTIVE', 'INACTIVE']),
};
export const unitOptions = options(['g', 'kg', 'ml', 'L', 'each']);
export const cash = (value: number) => '¥' + formatFen(fen(value));
export const storeFields = [
  text('name', '门店名称'),
  text('address', '地址'),
  text('contactPhone', '联系电话'),
  text('businessHours', '营业时间说明'),
  text('timezone', '时区', 'Asia/Shanghai'),
  status,
].map((f) => ({ ...f, required: ['name', 'timezone'].includes(f.name) }));
