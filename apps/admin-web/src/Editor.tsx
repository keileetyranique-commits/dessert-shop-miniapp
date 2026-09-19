import { useState, type FormEvent } from 'react';
export type Values = Record<string, string | number | boolean>;
export interface Field {
  name: string;
  label: string;
  type?: 'number' | 'text' | 'checkbox' | 'password' | 'month';
  options?: { value: string; label: string }[];
  value?: string | number | boolean;
  required?: boolean;
  min?: number;
}
export function Editor({
  title,
  fields,
  onSave,
  initial = {},
}: {
  title: string;
  fields: Field[];
  onSave: (data: Values) => Promise<void>;
  initial?: Values;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const result: Values = {};
    setError('');
    setDone(false);
    for (const field of fields) {
      const value = String(data.get(field.name) ?? '');
      if (field.type === 'checkbox') result[field.name] = data.has(field.name);
      else if (field.type === 'number') {
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
  return (
    <form onSubmit={submit}>
      <h3>{title}</h3>
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select
                name={f.name}
                defaultValue={String(
                  initial[f.name] ?? f.value ?? f.options[0]?.value ?? '',
                )}
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
                type={f.type ?? 'text'}
                defaultValue={String(initial[f.name] ?? f.value ?? '')}
                required={f.required ?? true}
                min={f.min ?? (f.type === 'number' ? 0 : undefined)}
                step={f.type === 'number' ? 1 : undefined}
                autoComplete={f.type === 'password' ? 'off' : undefined}
              />
            )}
          </label>
        ))}
      </div>
      <button disabled={busy}>{busy ? '保存中…' : '保存' + title}</button>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">已保存{title}</p>}
    </form>
  );
}
