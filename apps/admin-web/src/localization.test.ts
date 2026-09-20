import { expect, test } from 'vitest';
import {
  yuanToFen,
  fenToYuan,
  percentToBps,
  bpsToPercent,
  labels,
} from './localization';
test('人民币以字符串精确转换，拒绝小数溢出和不合法输入', () => {
  for (const [value, expected] of [
    ['18', 1800],
    ['18.8', 1880],
    ['18.80', 1880],
    ['0.01', 1],
    ['0', 0],
    ['21474836.47', 2147483647],
  ] as const) {
    expect(yuanToFen(value)).toBe(expected);
    expect(yuanToFen(fenToYuan(expected))).toBe(expected);
  }
  for (const value of [
    '',
    ' ',
    '-1',
    '1e2',
    '1.001',
    'NaN',
    'Infinity',
    '21474836.48',
    '999999999999999999999999',
    '.5',
    '1.',
  ])
    expect(() => yuanToFen(value)).toThrow();
});
test('百分比、单位及状态采用中文业务文案', () => {
  expect(percentToBps('20')).toBe(2000);
  expect(percentToBps('15.5')).toBe(1550);
  expect(bpsToPercent(2000)).toBe('20');
  expect(() => percentToBps('100.01')).toThrow();
  expect(labels.g).toBe('克');
  expect(labels.kg).toBe('公斤');
  expect(labels.ml).toBe('毫升');
  expect(labels.L).toBe('升');
  expect(labels.each).toBe('个');
  expect(labels.ACTIVE).toBe('已启用');
  expect(labels.DELIVERY).toBe('配送');
});

import { number, cash } from './admin-fields';
test('包含计费单位的人工成本字段同样用元', () => {
  expect(number('laborFenPerMinute', '可变人工每分钟成本（分）')).toMatchObject(
    { type: 'money', label: '可变人工每分钟成本（元）' },
  );
  expect(cash(1880)).toBe('¥18.80');
});
