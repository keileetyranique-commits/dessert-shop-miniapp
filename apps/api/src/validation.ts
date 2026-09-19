import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export { z };
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((x) => x.path.join('.') + ': ' + x.message)
        .join('; '),
    );
  return result.data;
}
export const id = z.string().uuid();
export const name = z.string().trim().min(1).max(160);
export const money = z.number().int().min(0).max(2147483647);
export const count = z.number().int().min(0).max(2147483647);
export const positive = count.min(1);
export const status = z.enum(['ACTIVE', 'INACTIVE']);
export const unit = z.enum(['g', 'kg', 'ml', 'L', 'each']);
export const decimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/)
  .refine((v) => /[1-9]/.test(v), 'Quantity must be positive');
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const fulfillment = z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']);
export const storeInput = z
  .object({
    name,
    address: z.string().max(500).default(''),
    contactPhone: z.string().max(80).default(''),
    businessHours: z.string().max(1000).default(''),
    timezone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      })
      .default('Asia/Shanghai'),
    status: status.default('ACTIVE'),
  })
  .strict();
export const categoryInput = z
  .object({ name, status: status.default('ACTIVE') })
  .strict();
export const productInput = z
  .object({
    name,
    categoryId: id,
    description: z.string().max(4000).default(''),
    imageUrl: z
      .union([
        z.literal(''),
        z
          .string()
          .url()
          .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol)),
      ])
      .default(''),
    status: status.default('ACTIVE'),
  })
  .strict();
export const variantInput = z
  .object({
    name,
    salePriceFen: money,
    status: status.default('ACTIVE'),
    stockQuantity: count.default(0),
    unlimitedStock: z.boolean().default(false),
    soldOut: z.boolean().default(false),
  })
  .strict();
export const variantEdit = variantInput
  .omit({ stockQuantity: true })
  .partial()
  .strict();
export const groupInput = z
  .object({
    name,
    minSelections: count.default(0),
    maxSelections: positive.default(1),
    status: status.default('ACTIVE'),
  })
  .strict()
  .refine(
    (v) => v.minSelections <= v.maxSelections,
    'minSelections must not exceed maxSelections',
  );
export const modifierInput = z
  .object({ name, salePriceFen: money, status: status.default('ACTIVE') })
  .strict();
export const ingredientInput = z
  .object({
    name,
    baseUnit: z.enum(['g', 'ml', 'each']),
    lossRateBps: count.max(9999).default(0),
    status: status.default('ACTIVE'),
  })
  .strict();
export const purchaseInput = z
  .object({
    ingredientId: id,
    supplier: name,
    quantity: decimal,
    unit,
    totalCostFen: money,
    purchasedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const recipeInput = z
  .object({
    yieldQuantity: positive.default(1),
    laborSeconds: count.default(0),
    otherVariableCostFen: money.default(0),
    items: z
      .array(z.object({ ingredientId: id, quantity: decimal, unit }).strict())
      .max(200),
  })
  .strict();
export const packagingInput = z
  .object({
    name,
    unitCostFen: money,
    scope: z.enum(['SKU', 'ORDER']).default('SKU'),
    status: status.default('ACTIVE'),
  })
  .strict();
export const packagingMapping = z
  .object({
    fulfillment,
    items: z
      .array(z.object({ packagingItemId: id, quantity: positive }).strict())
      .max(100),
  })
  .strict();
export const fixedInput = z
  .object({
    rentFen: money,
    utilitiesFen: money,
    payrollFen: money,
    propertyFeeFen: money,
    depreciationFen: money,
    softwareFen: money,
    otherFen: money,
  })
  .strict();
export const allocationInput = z
  .object({
    method: z.enum(['ITEM', 'ORDER']),
    expectedMonthlyOrders: positive,
    expectedMonthlyItems: positive,
    laborFenPerMinute: money,
  })
  .strict();
