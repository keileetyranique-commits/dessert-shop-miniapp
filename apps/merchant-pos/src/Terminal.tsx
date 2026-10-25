import { useEffect, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Slider, Space, Switch } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  SessionProvider,
  StoreSwitch,
  useSession,
} from '../../admin-web/src/console/Session';
import {
  OrderOnlyProvider,
  useCatalog,
} from '../../admin-web/src/console/Data';
import { Orders, type OrderView } from '../../admin-web/src/console/Orders';
import { newOrderIds, validateSound } from './sound';
import '../../admin-web/src/console/console.css';

export function Terminal() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: { colorPrimary: '#147d92', borderRadius: 12, controlHeight: 44 },
      }}
    >
      <SessionProvider>
        <TerminalStore />
      </SessionProvider>
    </ConfigProvider>
  );
}
function TerminalStore() {
  const session = useSession();
  return (
    <>
      <div className="panel">
        <Space wrap>
          <StoreSwitch />
          <Button onClick={() => session.logout()}>退出接单终端</Button>
        </Space>
      </div>
      {session.storeId ? (
        <OrderOnlyProvider key={session.storeId}>
          <SoundPanel />
          <Orders />
        </OrderOnlyProvider>
      ) : (
        <Alert title="请选择授权门店；没有可用门店时请联系老板" />
      )}
    </>
  );
}
export function SoundPanel() {
  const { api, canEdit } = useCatalog(),
    session = useSession();
  const [enabled, setEnabled] = useState(false),
    [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(60),
    [offline, setOffline] = useState(false),
    [message, setMessage] = useState('先点击开启声音，允许浏览器播放接单提醒'),
    [toneName, setToneName] = useState('默认提示音');
  const context = useRef<AudioContext | null>(null),
    buffer = useRef<AudioBuffer | null>(null),
    seen = useRef(new Set<string>());
  const storageKey = `pos-seen:${session.identity.id}:${session.storeId}`;
  useEffect(() => {
    try {
      seen.current = new Set(
        JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as string[],
      );
    } catch {
      seen.current = new Set();
    }
    return () => {
      void context.current?.close();
      context.current = null;
    };
  }, [storageKey]);
  async function audio() {
    const ctx = context.current ?? new AudioContext();
    context.current = ctx;
    await ctx.resume();
    return ctx;
  }
  async function play() {
    const ctx = await audio();
    const gain = ctx.createGain();
    gain.gain.value = volume / 100;
    gain.connect(ctx.destination);
    if (buffer.current) {
      const source = ctx.createBufferSource();
      source.buffer = buffer.current;
      source.connect(gain);
      source.start();
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    } else {
      const oscillator = ctx.createOscillator();
      oscillator.frequency.value = 880;
      oscillator.connect(gain);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }
  async function enable() {
    try {
      const ctx = await audio();
      const saved = localStorage.getItem('pos-custom-sound');
      if (saved) {
        const value = JSON.parse(saved) as { data: string; name: string };
        const bytes = Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0));
        buffer.current = await ctx.decodeAudioData(bytes.buffer);
        setToneName(value.name);
      }
      await play();
      setEnabled(true);
      setMessage('声音已开启；保持此页面在前台，每 5 秒检查新订单');
    } catch {
      setMessage('浏览器暂未允许播放，请再次点击开启声音，或检查设备音量');
    }
  }
  useEffect(() => {
    if (!canEdit) return;
    let active = true,
      running = false;
    async function poll() {
      if (running) return;
      running = true;
      try {
        const data = await api<{ items: OrderView[] }>('/orders?page=1');
        if (!active) return;
        setOffline(false);
        const fresh = newOrderIds(data.items, seen.current);
        if (fresh.length) {
          setMessage(`有 ${fresh.length} 笔新订单待处理`);
          if (enabled && !muted) {
            try {
              await play();
            } catch {
              setMessage('有新订单；声音播放失败，请重新开启声音');
            }
          }
          fresh.forEach((id) => seen.current.add(id));
          seen.current = new Set([...seen.current].slice(-500));
          try {
            sessionStorage.setItem(
              storageKey,
              JSON.stringify([...seen.current]),
            );
          } catch {
            /* In-memory deduplication remains available. */
          }
        }
      } catch {
        if (active) setOffline(true);
      } finally {
        running = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    const online = () => void poll();
    window.addEventListener('online', online);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', online);
    };
    // Audio preferences intentionally restart the bounded poll; the deduplication set survives.
  }, [api, canEdit, enabled, muted, volume, storageKey]);
  if (!canEdit) return null;
  return (
    <section className="panel">
      <h2>新订单提醒</h2>
      <Alert
        type={offline ? 'error' : 'info'}
        title={
          offline
            ? '连接中断，暂不能可靠接单；每 5 秒自动重试，恢复后核对订单'
            : message
        }
      />
      <Space wrap>
        <Button onClick={() => void enable()}>
          {enabled ? '试听 / 重新开启声音' : '开启接单声音'}
        </Button>
        <span>
          静音 <Switch checked={muted} onChange={setMuted} />
        </span>
        <span>音量</span>
        <Slider
          aria-label="接单提醒音量"
          style={{ width: 140 }}
          min={0}
          max={100}
          value={volume}
          onChange={setVolume}
        />
        <span>{toneName}</span>
      </Space>
      <p>
        <label>
          自定义铃声（仅保存在此设备，MP3 / WAV / OGG，1 MB 内、30 秒内）
          <input
            aria-label="自定义铃声"
            type="file"
            accept=".mp3,.wav,.ogg"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                validateSound(file);
                const bytes = await file.arrayBuffer();
                const ctx = await audio();
                const decoded = await ctx.decodeAudioData(bytes.slice(0));
                if (decoded.duration > 30)
                  throw Error('铃声请控制在 30 秒以内');
                const data = Array.from(new Uint8Array(bytes), (n) =>
                  String.fromCharCode(n),
                ).join('');
                localStorage.setItem(
                  'pos-custom-sound',
                  JSON.stringify({ name: file.name, data: btoa(data) }),
                );
                buffer.current = decoded;
                setToneName(file.name);
                setMessage('自定义铃声已保存，请点击试听');
              } catch (e) {
                setMessage(
                  e instanceof Error && /[\u4e00-\u9fff]/.test(e.message)
                    ? e.message
                    : '音频无法读取或设备空间不足，请换一个文件',
                );
              }
            }}
          />
        </label>
        <Button
          onClick={() => {
            localStorage.removeItem('pos-custom-sound');
            buffer.current = null;
            setToneName('默认提示音');
          }}
        >
          恢复默认铃声
        </Button>
      </p>
    </section>
  );
}
