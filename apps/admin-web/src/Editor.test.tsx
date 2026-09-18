import { afterEach, test, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Editor } from './Editor';
afterEach(cleanup);
test('money rejects fractional values before sending and preserves integer fen', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <Editor
      title="规格"
      fields={[{ name: 'salePriceFen', label: '售价（分）', type: 'number' }]}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText('售价（分）'), {
    target: { value: '1.5' },
  });
  fireEvent.submit(container.querySelector('form')!);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('售价（分）'), {
    target: { value: '1234' },
  });
  fireEvent.submit(container.querySelector('form')!);
  expect(await screen.findByText('已保存规格')).toBeTruthy();
  expect(save).toHaveBeenCalledWith({ salePriceFen: 1234 });
});
