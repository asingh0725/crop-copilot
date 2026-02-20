/**
 * API v1: Products Endpoint
 *
 * GET /api/v1/products - Search products with filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { searchProducts } from '@/lib/services'
import { ProductType } from '@prisma/client'

/**
 * GET /api/v1/products - Search products with filters, sorting, and pagination
 */
export const GET = withAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const crop = searchParams.get('crop') || ''
    const ids = (searchParams.get('ids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 100)
    const parsedPage = parseInt(searchParams.get('page') || '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const parsedPageSize = parseInt(
      searchParams.get('pageSize') || searchParams.get('limit') || '20',
      10
    )
    const pageSize =
      Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 20
    const explicitOffset = searchParams.get('offset')
    const parsedOffset = explicitOffset ? parseInt(explicitOffset, 10) : NaN
    const offset =
      Number.isFinite(parsedOffset) && parsedOffset >= 0
        ? parsedOffset
        : (page - 1) * pageSize
    const limit = pageSize
    const sortBy = searchParams.get('sortBy') as 'name' | 'brand' | 'type' | 'createdAt' | undefined
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' | undefined

    // Parse types filter
    const typesParam = searchParams.get('types')
    let types: ProductType[] = []
    if (typesParam) {
      types = typesParam.split(',').filter((t) =>
        Object.values(ProductType).includes(t as ProductType)
      ) as ProductType[]
    }

    const result = await searchProducts({
      ids,
      search,
      types,
      crop,
      limit,
      offset,
      sortBy,
      sortOrder,
    })

    return NextResponse.json({
      ...result,
      pagination: {
        page,
        pageSize: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    })
  } catch (error) {
    console.error('Search products error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
