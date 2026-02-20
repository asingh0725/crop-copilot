import { ProductType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

interface ExtractedDiagnosisProduct {
  productId: string | null
  name: string
  brand: string | null
  type: ProductType
  reason: string
  applicationRate: string | null
  priority: number
}

export interface RecommendationProductWithCatalog {
  id: string
  productId: string
  reason: string
  applicationRate: string | null
  priority: number
  createdAt: Date
  product: {
    id: string
    name: string
    brand: string | null
    type: ProductType
    analysis: unknown
    applicationRate: string | null
    crops: string[]
    description: string | null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(
  record: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!record) {
    return null
  }

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return null
}

function readNumber(
  record: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!record) {
    return null
  }

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function normalizeSpacing(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLookupKey(value: string): string {
  return normalizeSpacing(value).toLowerCase()
}

function buildNameVariants(name: string): string[] {
  const spaced = normalizeSpacing(name)
  const underscored = spaced.replace(/\s+/g, '_')
  const dashed = spaced.replace(/\s+/g, '-')

  return Array.from(new Set([name.trim(), spaced, underscored, dashed])).filter(
    (entry) => entry.length > 0
  )
}

function isGenericLabel(value: string): boolean {
  const normalized = normalizeLookupKey(value)
  return (
    normalized === 'suggested product' ||
    normalized === 'unspecified' ||
    normalized === 'unknown product' ||
    normalized === 'product'
  )
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferNameFromContext(
  applicationRate: string | null,
  reason: string | null
): string | null {
  const candidates = [applicationRate, reason]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())

  const normalizeCandidate = (value: string): string | null => {
    const cleaned = normalizeSpacing(
      value
        .replace(/^[^a-zA-Z0-9]+/, '')
        .replace(/[\s,:;.!?]+$/, '')
    )
    if (!cleaned) {
      return null
    }
    if (isGenericLabel(cleaned)) {
      return null
    }
    if (cleaned.split(' ').length > 8) {
      return null
    }
    return toTitleCase(cleaned)
  }

  const tryPatterns = (text: string): string | null => {
    const quantityPattern =
      /(?:\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:lbs?|lb|kg|g|oz|ml|l)\s+)([a-z][a-z0-9\s/-]{2,70}?)(?:\s+per\b|\s+in\b|,|;|\.|$)/i
    const applyPattern =
      /(?:apply|use|consider|recommend|suggest)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s/-]{2,70}?)(?:\s+(?:for|to|at|on|in)\b|,|;|\.|$)/i
    const withPattern =
      /\bwith\s+([a-z][a-z0-9\s/-]{2,70}?)(?:\s+(?:for|to|at|on|in)\b|,|;|\.|$)/i

    const raw =
      text.match(quantityPattern)?.[1] ??
      text.match(applyPattern)?.[1] ??
      text.match(withPattern)?.[1] ??
      null

    return raw ? normalizeCandidate(raw) : null
  }

  for (const value of candidates) {
    const inferred = tryPatterns(value)
    if (inferred) {
      return inferred
    }
  }

  return null
}

function normalizeProductType(raw: string | null): ProductType {
  if (!raw) return ProductType.OTHER

  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')

  if (normalized in ProductType) {
    return ProductType[normalized as keyof typeof ProductType]
  }

  if (normalized.includes('FERTIL')) return ProductType.FERTILIZER
  if (normalized.includes('AMEND')) return ProductType.AMENDMENT
  if (normalized.includes('HERB')) return ProductType.HERBICIDE
  if (normalized.includes('FUNG')) return ProductType.FUNGICIDE
  if (normalized.includes('INSECT')) return ProductType.INSECTICIDE
  if (normalized.includes('PEST')) return ProductType.PESTICIDE
  if (normalized.includes('SEED')) return ProductType.SEED_TREATMENT
  if (normalized.includes('BIO')) return ProductType.BIOLOGICAL

  return ProductType.OTHER
}

export function extractDiagnosisProductCandidates(
  diagnosis: unknown
): ExtractedDiagnosisProduct[] {
  const root = asRecord(diagnosis)
  if (!root) {
    return []
  }

  const rootsToInspect: Array<Record<string, unknown> | null> = [
    root,
    asRecord(root.diagnosis),
    asRecord(root.primaryCondition),
    asRecord(root.result),
    asRecord(asRecord(root.result)?.diagnosis),
  ]

  const arrayCandidates: unknown[] = []
  for (const record of rootsToInspect) {
    if (!record) continue
    arrayCandidates.push(
      ...asArray(record.products),
      ...asArray(record.recommendedProducts),
      ...asArray(record.productRecommendations)
    )
  }

  if (arrayCandidates.length === 0) {
    return []
  }

  const extracted: ExtractedDiagnosisProduct[] = []
  const seen = new Set<string>()

  arrayCandidates.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const rawName = normalizeSpacing(entry)
      if (!rawName || isGenericLabel(rawName)) {
        return
      }

      const dedupeKey = normalizeLookupKey(rawName)
      if (seen.has(dedupeKey)) {
        return
      }
      seen.add(dedupeKey)

      extracted.push({
        productId: null,
        name: rawName,
        brand: null,
        type: ProductType.OTHER,
        reason: 'Recommended product candidate from diagnosis output.',
        applicationRate: null,
        priority: index + 1,
      })
      return
    }

    const record = asRecord(entry)
    if (!record) return

    const nestedProduct = asRecord(record.product)
    const nestedProductName = typeof record.product === 'string' ? record.product : null

    const rawType =
      readString(record, ['productType', 'product_type', 'type']) ??
      readString(nestedProduct, ['type'])

    const applicationRate =
      readString(record, ['applicationRate', 'application_rate']) ??
      readString(nestedProduct, ['applicationRate', 'application_rate'])

    const rawReason =
      readString(record, ['reason', 'reasoning', 'details']) ??
      `Recommended for ${normalizeProductType(rawType)
        .toLowerCase()
        .replace(/_/g, ' ')} management.`

    const rawName =
      readString(record, ['productName', 'product_name', 'name', 'product']) ??
      nestedProductName ??
      readString(nestedProduct, ['name'])

    const normalizedName = normalizeSpacing(
      rawName && !isGenericLabel(rawName)
        ? rawName
        : inferNameFromContext(applicationRate, rawReason) ?? ''
    )
    if (!normalizedName) {
      return
    }

    const dedupeKey = normalizeLookupKey(normalizedName)
    if (seen.has(dedupeKey)) {
      return
    }
    seen.add(dedupeKey)

    const priority =
      readNumber(record, ['priority', 'rank', 'order']) ?? index + 1

    const productIdRaw =
      readString(record, [
        'catalogProductId',
        'catalog_product_id',
        'productId',
        'product_id',
        'id',
      ]) ?? readString(nestedProduct, ['id'])

    extracted.push({
      productId: productIdRaw,
      name: normalizedName,
      brand:
        readString(record, ['brand']) ??
        readString(nestedProduct, ['brand']),
      type: normalizeProductType(rawType),
      reason: rawReason,
      applicationRate,
      priority,
    })
  })

  return extracted
}

async function findExistingProductByName(
  name: string,
  brand: string | null
) {
  const variants = buildNameVariants(name)
  const exactNameWhere = variants.map((variant) => ({
    name: { equals: variant, mode: 'insensitive' as const },
  }))

  if (brand) {
    const byBrand = await prisma.product.findFirst({
      where: {
        OR: exactNameWhere.map((where) => ({
          ...where,
          brand: { equals: brand, mode: 'insensitive' as const },
        })),
      },
    })
    if (byBrand) {
      return byBrand
    }
  }

  const byName = await prisma.product.findFirst({
    where: {
      OR: exactNameWhere,
    },
  })
  if (byName) {
    return byName
  }

  return null
}

export async function upsertRecommendationProductsFromDiagnosis(params: {
  recommendationId: string
  diagnosis: unknown
  crop?: string | null
}): Promise<RecommendationProductWithCatalog[]> {
  const { recommendationId, diagnosis, crop } = params

  const candidates = extractDiagnosisProductCandidates(diagnosis)
  if (candidates.length === 0) {
    return []
  }

  const normalizedCrop = crop?.trim()
  const rows: RecommendationProductWithCatalog[] = []

  for (const candidate of candidates) {
    let product =
      candidate.productId
        ? await prisma.product.findUnique({ where: { id: candidate.productId } })
        : null

    if (!product) {
      product = await findExistingProductByName(candidate.name, candidate.brand)
    }

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: candidate.name,
          brand: candidate.brand,
          type: candidate.type,
          applicationRate: candidate.applicationRate,
          crops: normalizedCrop ? [normalizedCrop] : [],
        },
      })
    }

    const relation = await prisma.productRecommendation.upsert({
      where: {
        recommendationId_productId: {
          recommendationId,
          productId: product.id,
        },
      },
      create: {
        recommendationId,
        productId: product.id,
        reason: candidate.reason,
        applicationRate: candidate.applicationRate,
        priority: candidate.priority,
      },
      update: {
        reason: candidate.reason,
        applicationRate: candidate.applicationRate,
        priority: candidate.priority,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            type: true,
            analysis: true,
            applicationRate: true,
            crops: true,
            description: true,
          },
        },
      },
    })

    rows.push({
      id: relation.id,
      productId: relation.productId,
      reason: relation.reason,
      applicationRate: relation.applicationRate,
      priority: relation.priority,
      createdAt: relation.createdAt,
      product: relation.product,
    })
  }

  rows.sort((a, b) => a.priority - b.priority)
  return rows
}
