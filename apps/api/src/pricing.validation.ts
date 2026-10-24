import { z, money, id, month, fulfillment } from './validation.js';
const bps = z.number().int().min(0).max(10000);
const fee = z
  .object({
    rateBps: bps,
    fixedFen: money,
    minimumFen: money,
    capFen: money.nullable(),
  })
  .strict()
  .refine((v) => v.capFen === null || v.capFen >= v.minimumFen);
export const pricingRule = z
  .object({
    minimumProfitFen: money,
    minimumMarginBps: bps,
    targetProfitFen: money,
    targetMarginBps: bps,
    maximumDistanceMeters: z.number().int().min(0).max(100000),
    maximumSubsidyFen: money,
    allowTopup: z.boolean(),
    payment: fee,
    commission: fee,
  })
  .strict();
export const pricingRequest = z
  .object({
    month,
    fulfillment,
    items: z
      .array(
        z
          .object({
            variantId: id,
            quantity: z.number().int().min(1).max(1000),
            salePriceFen: money.optional(),
            modifierIds: z.array(id).max(50).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    packagingRevenueFen: money,
    orderPackaging: z
      .array(
        z
          .object({
            packagingItemId: id,
            quantity: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .max(50),
    customerDeliveryFeeFen: money,
    deliverySubsidyFen: money,
    merchantDiscountFen: money,
    platformDiscountFen: money,
    discountBps: bps,
    promotion: z
      .object({ thresholdFen: money, discountFen: money })
      .strict()
      .nullable(),
    quote: z
      .object({
        priceFen: money.max(100000),
        distanceMeters: z.number().int().min(0).max(1000000),
        quotedAt: z.string().datetime({ offset: true }),
        expiresAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .nullable(),
  })
  .strict();
