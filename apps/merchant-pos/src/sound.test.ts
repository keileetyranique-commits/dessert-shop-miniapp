import { expect, test } from 'vitest';
import { newOrderIds, validateSound } from './sound';
test('重新连接仅提醒未通知的新单，待付款和已完成不提醒', () => {
  const seen = new Set(['old']);
  const rows = [
    { id: 'old', orderStatus: 'AWAITING_ACCEPTANCE' },
    { id: 'new', orderStatus: 'PREPARING' },
    { id: 'unpaid', orderStatus: 'PENDING_PAYMENT' },
    { id: 'done', orderStatus: 'COMPLETED' },
  ];
  expect(newOrderIds(rows, seen)).toEqual(['new']);
  seen.add('new');
  expect(newOrderIds(rows, seen)).toEqual([]);
});
test('自定义铃声限制类型和大小，不能上传网页或超大文件', () => {
  expect(() =>
    validateSound({ name: 'tone.wav', type: 'audio/wav', size: 100 }),
  ).not.toThrow();
  expect(() =>
    validateSound({ name: 'tone.html', type: 'text/html', size: 100 }),
  ).toThrow();
  expect(() =>
    validateSound({ name: 'tone.mp3', type: 'audio/mpeg', size: 1048577 }),
  ).toThrow();
});
