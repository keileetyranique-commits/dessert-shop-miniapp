import { useState } from 'react';
import { Modal, Button, Input } from 'antd';
import type { Client, Store } from './admin-types';
export function ArchiveStore({
  store,
  api,
  onArchived,
}: {
  store: Store;
  api: Client;
  onArchived: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <Button
        danger
        onClick={() => {
          setOpen(true);
          setName('');
          setError('');
        }}
      >
        归档门店
      </Button>
      <Modal
        title="确认归档门店"
        open={open}
        okText="确认归档"
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{ danger: true, disabled: name !== store.name }}
        onCancel={() => !busy && setOpen(false)}
        onOk={async () => {
          if (name !== store.name) return;
          setBusy(true);
          setError('');
          try {
            await api('/store', 'DELETE', { confirmationName: name });
            setOpen(false);
            await onArchived();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>归档后门店不再出现在日常操作中，历史经营资料会保留。</p>
        <label>
          请输入门店名称“{store.name}”确认
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
      </Modal>
    </>
  );
}
