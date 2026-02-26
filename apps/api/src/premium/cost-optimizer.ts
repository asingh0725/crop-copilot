import type {
  CostAnalysisItem,
  CostAnalysisResult,
  CostSwapOption,
  PremiumProcessingInput,
} from './types';

export interface ProductPriceLookup {
  productId: string;
  retailPriceUsd: number | null;
}

function parseRatePerAcre(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/[-+]?\d*\.?\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function roundCurrency(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

export function buildCostAnalysis(
  input: PremiumProcessingInput,
  pricing: ProductPriceLookup[]
): CostAnalysisResult | null {
  if (input.products.length === 0) {
    return null;
  }

  const acreage = input.input.fieldAcreage ?? null;
  const priceMap = new Map<string, number | null>();
  for (const entry of pricing) {
    priceMap.set(entry.productId, entry.retailPriceUsd);
  }

  const items: CostAnalysisItem[] = input.products.map((product) => {
    const parsedRatePerAcre = parseRatePerAcre(product.applicationRate);
    const unitPriceUsd = priceMap.get(product.productId) ?? null;

    const estimatedCostPerAcreUsd =
      parsedRatePerAcre !== null && unitPriceUsd !== null
        ? roundCurrency(parsedRatePerAcre * unitPriceUsd)
        : null;

    const estimatedFieldCostUsd =
      acreage !== null && estimatedCostPerAcreUsd !== null
        ? roundCurrency(estimatedCostPerAcreUsd * acreage)
        : null;

    return {
      productId: product.productId,
      productName: product.productName,
      productType: product.productType,
      applicationRate: product.applicationRate,
      parsedRatePerAcre,
      unitPriceUsd,
      estimatedCostPerAcreUsd,
      estimatedFieldCostUsd,
    };
  });

  const perAcreTotalUsd = roundCurrency(
    items.reduce((sum, item) => sum + (item.estimatedCostPerAcreUsd ?? 0), 0)
  );

  const wholeFieldTotalUsd =
    acreage !== null ? roundCurrency(perAcreTotalUsd !== null ? perAcreTotalUsd * acreage : null) : null;

  const swapOptions: CostSwapOption[] = [];
  const itemsByType = new Map<string, CostAnalysisItem[]>();
  for (const item of items) {
    const bucket = itemsByType.get(item.productType) ?? [];
    bucket.push(item);
    itemsByType.set(item.productType, bucket);
  }

  for (const bucket of itemsByType.values()) {
    const priced = bucket.filter((item) => item.unitPriceUsd !== null);
    if (priced.length < 2) {
      continue;
    }

    const sortedByPrice = [...priced].sort(
      (a, b) => (a.unitPriceUsd ?? Number.MAX_VALUE) - (b.unitPriceUsd ?? Number.MAX_VALUE)
    );
    const cheapest = sortedByPrice[0];

    for (const candidate of sortedByPrice.slice(1)) {
      if (candidate.unitPriceUsd === null || cheapest.unitPriceUsd === null) {
        continue;
      }

      const rate = candidate.parsedRatePerAcre ?? 1;
      const estimatedSavingsPerAcreUsd = roundCurrency(
        (candidate.unitPriceUsd - cheapest.unitPriceUsd) * rate
      );

      if (estimatedSavingsPerAcreUsd === null || estimatedSavingsPerAcreUsd <= 0) {
        continue;
      }

      swapOptions.push({
        fromProductId: candidate.productId,
        fromProductName: candidate.productName,
        toProductId: cheapest.productId,
        toProductName: cheapest.productName,
        estimatedSavingsPerAcreUsd,
        estimatedSavingsWholeFieldUsd:
          acreage !== null
            ? roundCurrency(estimatedSavingsPerAcreUsd * acreage) ?? 0
            : estimatedSavingsPerAcreUsd,
      });
    }
  }

  return {
    currency: 'USD',
    acreage,
    perAcreTotalUsd,
    wholeFieldTotalUsd,
    items,
    swapOptions,
  };
}
