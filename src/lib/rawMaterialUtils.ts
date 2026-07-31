/**
 * Utility functions for raw materials and recipes.
 */

export interface BaseDetails {
  baseUnit: string;
  baseUnitEn: string;
  ratio: number;
  baseCost: number;
}

export function getRawMaterialBaseDetails(unit: string, unitCost: number): BaseDetails {
  const u = (unit || '').trim().toLowerCase();
  
  if (
    u === 'كيلوجرام' ||
    u === 'كجم' ||
    u === 'kg' ||
    u === 'kilogram' ||
    u === 'كيلو' ||
    u === 'كيلو جرام'
  ) {
    return {
      baseUnit: 'جرام',
      baseUnitEn: 'g',
      ratio: 1000,
      baseCost: unitCost / 1000
    };
  }
  
  if (
    u === 'لتر' ||
    u === 'l' ||
    u === 'liter'
  ) {
    return {
      baseUnit: 'مليلتر',
      baseUnitEn: 'ml',
      ratio: 1000,
      baseCost: unitCost / 1000
    };
  }
  
  return {
    baseUnit: unit || 'وحدة',
    baseUnitEn: u || 'unit',
    ratio: 1,
    baseCost: unitCost
  };
}
