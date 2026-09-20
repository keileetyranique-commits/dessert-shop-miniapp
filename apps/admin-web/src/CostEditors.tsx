import { useEffect, useState } from 'react';
import { Editor } from './Editor';
import type {
  Cost,
  Client,
  Variant,
  Ingredient,
  Recipe,
  Line,
  Package,
  PackLine,
} from './admin-types';
import { labels } from './localization';
import { cash, number, unitOptions } from './admin-fields';
export function CostResult({ cost }: { cost: Cost }) {
  const labels: Record<string, string> = {
    BOM: '配方用料',
    PACKAGING: '当前履约包装配置',
    VARIABLE_COST: '可变人工配置或配方',
    FIXED_COST: '当月固定成本或分摊规则',
    ITEMS_PER_ORDER: '每单份数',
  };
  return (
    <article className="cost-result">
      <h3>
        {cost.completeness === 'COMPLETE'
          ? '资料齐全 · 当前估算单份成本'
          : '资料不完整 · 仅计算已录入成本'}
      </h3>
      {cost.missingInputs.length > 0 && (
        <p role="alert">
          缺少：
          {cost.missingInputs
            .map(
              (m) =>
                labels[m] ??
                (m.startsWith('PURCHASE_PRICE:')
                  ? '配方第 ' + (Number(m.split(':')[1]) + 1) + ' 项采购价'
                  : m),
            )
            .join('、')}
        </p>
      )}
      <dl>
        {[
          ['食材成本', cost.ingredientCostFen],
          ['包装成本', cost.packagingCostFen],
          ['可变成本', cost.variableCostFen],
          ['固定成本分摊', cost.allocatedFixedCostFen],
          ['单份成本合计', cost.fullUnitCostFen],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{cash(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <p>当前采购价格与预计销量形成的估算，不代表已发生订单的实际成本。</p>
      <details>
        <summary>高级计算信息</summary>
        <small>
          {cost.calculationVersion} · {cost.calculatedAt} ·{' '}
          {cost.snapshotId
            ? '已保存快照 ' + cost.snapshotId
            : '预览（未保存快照）'}
        </small>
      </details>
    </article>
  );
}
export function RecipeEditor({
  api,
  sku,
  ingredients,
  changed,
}: {
  api: Client;
  sku: Variant;
  ingredients: Ingredient[];
  changed: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<Recipe[]>('/costs/variants/' + sku.id + '/recipes')
      .then((r) => {
        if (active) {
          setRecipes(r);
          setLines(r.find((v) => v.active)?.recipeItemRecords ?? []);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [sku.id, revision]); // api is scoped by the parent mount.
  const active = recipes.find((r) => r.active);
  return (
    <div>
      <h3>配方明细（输入每批用量）</h3>
      {error && <p role="alert">{error}</p>}
      {lines.map((line, index) => (
        <div className="line" key={index}>
          <label>
            食材
            <select
              value={line.ingredientId}
              onChange={(e) =>
                setLines((v) =>
                  v.map((l, i) =>
                    i === index ? { ...l, ingredientId: e.target.value } : l,
                  ),
                )
              }
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            用量
            <input
              value={line.quantity}
              onChange={(e) =>
                setLines((v) =>
                  v.map((l, i) =>
                    i === index ? { ...l, quantity: e.target.value } : l,
                  ),
                )
              }
            />
          </label>
          <label>
            单位
            <select
              value={line.unit}
              onChange={(e) =>
                setLines((v) =>
                  v.map((l, i) =>
                    i === index ? { ...l, unit: e.target.value } : l,
                  ),
                )
              }
            >
              {unitOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setLines((v) => v.filter((_, i) => i !== index))}
          >
            移除此项
          </button>
        </div>
      ))}
      <button
        disabled={!ingredients.length}
        onClick={() =>
          setLines((v) => [
            ...v,
            {
              ingredientId: ingredients[0]!.id,
              quantity: '1',
              unit: ingredients[0]!.baseUnit,
            },
          ])
        }
      >
        添加配方食材
      </button>
      <p>空配方表示明确无食材成本；每批出品份数用于将批次用量分摊到一份。</p>
      <Editor
        key={sku.id + (active?.id ?? 'empty') + revision}
        title="新配方版本"
        initial={
          active
            ? {
                yieldQuantity: active.yieldQuantity,
                laborSeconds: active.laborSeconds,
                otherVariableCostFen: active.otherVariableCostFen,
              }
            : {}
        }
        fields={[
          number('yieldQuantity', '每批出品份数', 1),
          number('laborSeconds', '每批可变人工秒数'),
          number('otherVariableCostFen', '每批其他可变成本（分）'),
        ]}
        onSave={async (d) => {
          await api('/costs/variants/' + sku.id + '/recipe', 'PUT', {
            ...d,
            items: lines.map(({ ingredientId, quantity, unit }) => ({
              ingredientId,
              quantity,
              unit,
            })),
          });
          setRevision((v) => v + 1);
          changed();
        }}
      />
      <h3>配方版本</h3>
      {recipes.map((r) => (
        <p key={r.id}>
          v{r.version}{' '}
          {r.active ? (
            '使用中'
          ) : (
            <button
              onClick={async () => {
                try {
                  await api(
                    '/costs/variants/' +
                      sku.id +
                      '/recipes/' +
                      r.id +
                      '/activate',
                    'POST',
                    {},
                  );
                  setRevision((v) => v + 1);
                  changed();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              切换到此版本
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
export function PackagingEditor({
  api,
  sku,
  packs,
  changed,
}: {
  api: Client;
  sku: Variant;
  packs: Package[];
  changed: () => void;
}) {
  const [fulfillment, setFulfillment] = useState('PICKUP'),
    [lines, setLines] = useState<PackLine[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<{ fulfillment: string; skuPackagingRecords: PackLine[] }[]>(
      '/costs/variants/' + sku.id + '/packaging',
    )
      .then((list) => {
        if (active)
          setLines(
            list.find((x) => x.fulfillment === fulfillment)
              ?.skuPackagingRecords ?? [],
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [sku.id, fulfillment]);
  return (
    <div>
      <h3>规格 履约包装</h3>
      {error && <p role="alert">{error}</p>}
      <label>
        履约方式
        <select
          value={fulfillment}
          onChange={(e) => setFulfillment(e.target.value)}
        >
          {['PICKUP', 'DELIVERY', 'DINE_IN'].map((v) => (
            <option key={v} value={v}>
              {labels[v]}
            </option>
          ))}
        </select>
      </label>
      {lines.map((line, index) => (
        <div className="line" key={index}>
          <label>
            包装
            <select
              value={line.packagingItemId}
              onChange={(e) =>
                setLines((v) =>
                  v.map((l, i) =>
                    i === index ? { ...l, packagingItemId: e.target.value } : l,
                  ),
                )
              }
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            件数
            <input
              type="number"
              min="1"
              step="1"
              value={line.quantity}
              onChange={(e) =>
                setLines((v) =>
                  v.map((l, i) =>
                    i === index
                      ? { ...l, quantity: Number(e.target.value) }
                      : l,
                  ),
                )
              }
            />
          </label>
          <button
            onClick={() => setLines((v) => v.filter((_, i) => i !== index))}
          >
            移除此项
          </button>
        </div>
      ))}
      <button
        disabled={!packs.length}
        onClick={() =>
          setLines((v) => [
            ...v,
            { packagingItemId: packs[0]!.id, quantity: 1 },
          ])
        }
      >
        添加包装
      </button>
      <Editor
        title="包装配置"
        fields={[]}
        onSave={async () => {
          await api('/costs/variants/' + sku.id + '/packaging', 'PUT', {
            fulfillment,
            items: lines.map(({ packagingItemId, quantity }) => ({
              packagingItemId,
              quantity,
            })),
          });
          changed();
        }}
      />
      <p>
        保存空列表表示此履约方式明确无需 规格 包装。整单公共包装在订单阶段实现。
      </p>
    </div>
  );
}
