export interface Named {
  id: string;
  name: string;
}
export interface Store extends Named {
  address: string;
  contactPhone: string;
  businessHours: string;
  timezone: string;
  status: string;
}
export interface Variant extends Named {
  salePriceFen: number;
  stockQuantity: number;
  unlimitedStock: boolean;
  soldOut: boolean;
  status: string;
}
export interface Group extends Named {
  modifierRecords: (Named & { salePriceFen: number; status: string })[];
}
export interface Product extends Named {
  categoryId: string;
  description: string;
  imageUrl: string;
  status: string;
  variantRecords: Variant[];
  modifierGroupRecords: Group[];
}
export interface Ingredient extends Named {
  baseUnit: string;
  lossRateBps: number;
  status: string;
}
export interface Package extends Named {
  unitCostFen: number;
  scope: string;
  status: string;
}
export interface Purchase {
  id: string;
  ingredientId: string;
  quantity: string;
  unit: string;
  totalCostFen: number;
  purchasedAt: string;
  supplier: string;
}
export interface Recipe {
  id: string;
  version: number;
  active: boolean;
  yieldQuantity: number;
  laborSeconds: number;
  otherVariableCostFen: number;
  recipeItemRecords: Line[];
}
export interface Line {
  ingredientId: string;
  quantity: string;
  unit: string;
}
export interface PackLine {
  packagingItemId: string;
  quantity: number;
}
export interface Cost {
  ingredientCostFen: number;
  packagingCostFen: number;
  variableCostFen: number;
  allocatedFixedCostFen: number;
  fullUnitCostFen: number;
  completeness: string;
  missingInputs: string[];
  calculationVersion: string;
  calculatedAt: string;
  snapshotId: string;
}
export type Client = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
