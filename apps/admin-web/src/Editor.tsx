import { useState, type FormEvent } from 'react';
import {
  yuanToFen,
  fenToYuan,
  percentToBps,
  bpsToPercent,
} from './localization';
import { ImageUpload } from './ImageUpload';
export type Values = Record<string, string | number | boolean>;
export interface Field {
  name: string;
  label: string;
  type?:
    | 'number'
    | 'text'
    | 'checkbox'
    | 'password'
    | 'month'
    | 'money'
    | 'percent'
    | 'image'
    | 'datetime-local';
  options?: { value: string; label: string }[];
  value?: string | number | boolean;
  required?: boolean;
  min?: number;
  optional?: boolean;
}
export function Editor({
  title,
  fields,
  onSave,
  initial = {},
  automatic,
}: {
  title: string;
  fields: Field[];
  onSave: (data: Values) => Promise<void>;
  initial?: Values;
  automatic?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [uploading, setUploading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    const data = new FormData(e.currentTarget),
      result: Values = {};
    setError('');
    setDone(false);
    for (const field of fields) {
      const value = String(data.get(field.name) ?? '');
      if (field.type === 'checkbox') result[field.name] = data.has(field.name);
      else if (field.type === 'money' || field.type === 'percent') {
        try {
          result[field.name] =
            field.type === 'money' ? yuanToFen(value) : percentToBps(value);
        } catch (err) {
          setError(field.label + '：' + (err as Error).message);
          return;
        }
      } else if (field.type === 'datetime-local') {
        const date = new Date(value + '+08:00');
        if (!Number.isFinite(date.getTime())) {
          setError('请选择有效日期时间');
          return;
        }
        result[field.name] = date.toISOString();
      } else if (field.type === 'number') {
        const n = Number(value);
        if (!Number.isSafeInteger(n) || value === '') {
          setError(field.label + '必须是安全整数');
          return;
        }
        result[field.name] = n;
      } else result[field.name] = value;
    }
    setBusy(true);
    try {
      await onSave(result);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  function renderFields(items: Field[]) {
    return (
      <div className="form-grid">
        {items.map((f) => {
          const raw = initial[f.name] ?? f.value ?? '';
          const value =
            (f.type === 'money' || f.type === 'percent') &&
            typeof raw === 'number'
              ? f.type === 'money'
                ? fenToYuan(raw)
                : bpsToPercent(raw)
              : String(raw);
          return f.type === 'image' ? (
            <div key={f.name}>
              <p>{f.label}（推荐）</p>
              <ImageUpload
                name={f.name}
                initial={value}
                onBusy={setUploading}
              />
            </div>
          ) : (
            <label key={f.name}>
              {f.label}
              {f.options ? (
                <select
                  name={f.name}
                  defaultValue={String(raw || f.options[0]?.value || '')}
                  required
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  name={f.name}
                  defaultChecked={Boolean(initial[f.name] ?? f.value ?? false)}
                />
              ) : (
                <input
                  name={f.name}
                  type={
                    ['money', 'percent'].includes(f.type ?? '')
                      ? 'text'
                      : (f.type ?? 'text')
                  }
                  inputMode={
                    ['money', 'percent'].includes(f.type ?? '')
                      ? 'decimal'
                      : undefined
                  }
                  defaultValue={value}
                  required={f.required ?? true}
                  min={f.min ?? (f.type === 'number' ? 0 : undefined)}
                  step={f.type === 'number' ? 1 : undefined}
                  autoComplete={f.type === 'password' ? 'off' : undefined}
                />
              )}
            </label>
          );
        })}
      </div>
    );
  }
  const recommended = fields.filter((f) => f.type === 'image'),
    optional = fields.filter(
      (f) => !recommended.includes(f) && (f.optional || f.required === false),
    ),
    required = fields.filter(
      (f) => !optional.includes(f) && !recommended.includes(f),
    );
  return (
    <form onSubmit={submit}>
      <h3>{title}</h3>
      {required.length > 0 && (
        <fieldset>
          <legend>必填</legend>
          {renderFields(required)}
        </fieldset>
      )}
      {recommended.length > 0 && renderFields(recommended)}
      {optional.length > 0 && (
        <details>
          <summary>选填 · 更多设置</summary>
          {renderFields(optional)}
        </details>
      )}
      {automatic && <p className="automatic">系统自动：{automatic}</p>}
      <button disabled={busy || uploading}>
        {uploading ? '图片上传中…' : busy ? '保存中…' : '保存' + title}
      </button>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">已保存{title}</p>}
    </form>
  );
}
