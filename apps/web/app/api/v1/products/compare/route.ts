/**
 * API v1: Product Comparison Endpoint
 *
 * POST /api/v1/products/compare - Compare multiple products
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { compareProducts } from '@/lib/services'
import { z } from 'zod'

const compareProductsSchema = z.object({
  productIds: z.array(z.string()).min(2).max(6),
})

/**
 * POST /api/v1/products/compare - Compare multiple products side-by-side
 */
export const POST = withAuth(async (request) => {
  try {
    const body = await request.json()
    const validated = compareProductsSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await compareProducts({
      productIds: validated.data.productIds,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Compare products error:', error)

    if (error.message?.includes('not found') || error.message?.includes('between 2 and 6')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
