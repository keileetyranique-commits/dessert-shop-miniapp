import { useEffect, useState } from 'react';
import type { RuntimeInfo } from '@platform/shared';
export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setRuntime(null);
    fetch('/api/v1/runtime', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        const data: unknown = await response.json();
        if (
          typeof data !== 'object' ||
          data === null ||
          !('testMode' in data) ||
          typeof data.testMode !== 'boolean' ||
          !('environment' in data) ||
          typeof data.environment !== 'string' ||
          !('schemaVersion' in data) ||
          data.schemaVersion !== 1
        )
          throw new Error('Invalid runtime');
        if (!controller.signal.aborted) setRuntime(data as RuntimeInfo);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <main>
      <header>
        <span className="eyebrow">STORE PLATFORM</span>
        <h1>商家管理后台</h1>
        <p role="status">
          {error
            ? '服务连接失败，请检查网络或联系管理员。'
            : runtime
              ? runtime.testMode
                ? '测试模式 · 不产生真实交易'
                : '正式模式'
              : '正在连接服务…'}
        </p>
        {error && (
          <button onClick={() => setAttempt((value) => value + 1)}>
            重新连接
          </button>
        )}
      </header>
      <section>
        <h2>智能经营建议</h2>
        <p>
          暂无经营数据。接入门店与商品后，将在这里显示经营趋势和待确认计划。
        </p>
        <p>计划执行、优惠发布与改价功能将在后续阶段开放。</p>
      </section>
      <section>
        <h2>门店管理</h2>
        <p>尚未配置商户、品牌和门店。</p>
      </section>
      <footer>工程初始化 · Phase 0</footer>
    </main>
  );
}
