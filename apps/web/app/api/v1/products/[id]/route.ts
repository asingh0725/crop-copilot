/**
 * API v1: Single Product Endpoint
 *
 * GET /api/v1/products/:id - Get product by ID with related products
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { getProduct } from '@/lib/services'

/**
 * GET /api/v1/products/:id - Get a specific product by ID
 */
export const GET = withAuth(async (request, { params }) => {
  try {
    const { id } = await params

    const product = await getProduct({
      id,
      userId: request.user.id,
    })

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('Get product error:', error)

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
