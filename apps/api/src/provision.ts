import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { parseConfig } from './config.js';
loadEnv({
  path:
    process.env.ENV_FILE ??
    fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
// Administrative CLI only: requires direct database credentials. No bootstrap HTTP route.
const config = parseConfig(process.env);
const owners = config.adminIdentities.filter(
  (i) => i.role === 'OWNER' && i.storeIds === '*',
);
if (!owners.length)
  throw new Error(
    'Configure a brand-scoped OWNER in ADMIN_IDENTITIES before provisioning',
  );
const db = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});
try {
  for (const owner of owners) {
    await db.$transaction(async (tx) => {
      await tx.merchant.upsert({
        where: { id: owner.merchantId },
        create: {
          id: owner.merchantId,
          name: process.env.MERCHANT_NAME?.trim() || '我的商户',
        },
        update: {},
      });
      const existing = await tx.brand.findUnique({
        where: { id: owner.brandId },
      });
      if (existing && existing.merchantId !== owner.merchantId)
        throw new Error('Brand ownership mismatch');
      await tx.brand.upsert({
        where: { id: owner.brandId },
        create: {
          id: owner.brandId,
          merchantId: owner.merchantId,
          name: process.env.BRAND_NAME?.trim() || '我的品牌',
        },
        update: {},
      });
    });
  }
  console.log(
    'Merchant/brand provisioning complete. Create stores in the authenticated admin UI.',
  );
} finally {
  await db.$disconnect();
}
