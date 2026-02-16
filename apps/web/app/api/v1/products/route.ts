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
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
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
      search,
      types,
      crop,
      limit,
      offset,
      sortBy,
      sortOrder,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Search products error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
