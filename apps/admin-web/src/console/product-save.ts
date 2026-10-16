import { AdminRequestError } from '../admin-client';
import type { Client, Product } from '../admin-types';
export interface ProductDraft {
  title: string;
  category_id: string;
  description: string;
  image: string;
  available: boolean;
  price: string;
}
// Reused from PR #17 localization.ts: decimal strings + BigInt, never floating-point multiplication.
export function yuanToFen(value: string): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) || value.length > 24)
    throw new Error('请输入最多两位小数的非负售价');
  const [whole, part = ''] = value.split('.');
  const amount = BigInt(whole!) * 100n + BigInt(part.padEnd(2, '0'));
  if (amount > 2147483647n) throw new Error('售价超出允许范围');
  return Number(amount);
}
export function productError(error: unknown): string {
  if (error instanceof AdminRequestError) {
    if (error.status === 401) return '登录已失效，请重新登录';
    if (error.status === 403) return '没有保存权限，或图片不属于当前门店';
    if (error.status === 404)
      return '商品、分类或图片不存在，或不属于当前门店，请刷新后重试';
    if (error.status === 0) return '网络连接失败，请检查网络后重试';
    if (error.status === 400)
      return '商品资料不符合要求，请检查名称、分类、售价和图片';
    if (error.status === 409)
      return '商品规格已变化，请刷新后确认售价；多规格商品需到规格管理中修改价格';
  }
  return '商品保存失败，请稍后重试';
}
export async function saveProduct(
  api: Client,
  draft: ProductDraft,
  id?: string,
  original?: ProductDraft,
): Promise<Product> {
  const name = draft.title.trim();
  if (!name || name.length > 160)
    throw new Error('请输入商品名称（最多 160 字）');
  if (!draft.category_id) throw new Error('请选择商品分类');
  if (draft.description.length > 4000)
    throw new Error('商品描述不能超过 4000 字');
  const fields = {
    name,
    categoryId: draft.category_id,
    description: draft.description,
    imageUrl: draft.image,
    status: draft.available ? 'ACTIVE' : 'INACTIVE',
  };
  // Validate outside the request error handler so merchants retain useful input errors.
  const price =
    (draft.price === '' && id) || (original && draft.price === original.price)
      ? undefined
      : yuanToFen(draft.price);
  let partial = false;
  try {
    if (!id)
      return await api<Product>('/products/simple', 'POST', {
        ...fields,
        salePriceFen: price,
      });
    let current = await api<Product>('/products/' + encodeURIComponent(id));
    const variants = current.variantRecords.filter(
      (v) =>
        v.status === 'ACTIVE' &&
        !(v as typeof v & { deletedAt?: string }).deletedAt,
    );
    if (price !== undefined && variants.length !== 1)
      throw new AdminRequestError(409, '商品规格已变化');
    const baseline = original
      ? {
          name: original.title,
          categoryId: original.category_id,
          description: original.description,
          imageUrl: original.image,
          status: original.available ? 'ACTIVE' : 'INACTIVE',
        }
      : current;
    const changes = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) => baseline[key as keyof typeof fields] !== value,
      ),
    );
    if (Object.keys(changes).length) {
      const updated = await api<Product>(
        '/products/' + encodeURIComponent(id),
        'PATCH',
        changes,
      );
      current = {
        ...current,
        ...updated,
        variantRecords: current.variantRecords,
      };
      partial = true;
    }
    if (
      variants.length === 1 &&
      price !== undefined &&
      price !== variants[0]!.salePriceFen
    ) {
      const variant = await api<Product['variantRecords'][number]>(
        '/variants/' + encodeURIComponent(variants[0]!.id),
        'PATCH',
        { salePriceFen: price },
      );
      current = {
        ...current,
        variantRecords: current.variantRecords.map((v) =>
          v.id === variant.id ? variant : v,
        ),
      };
    }
    return current;
  } catch (error) {
    if (error instanceof AdminRequestError && error.status === 401) throw error;
    throw new Error(
      partial
        ? '商品资料已保存，但售价未保存，请重试或刷新确认'
        : productError(error),
    );
  }
}
