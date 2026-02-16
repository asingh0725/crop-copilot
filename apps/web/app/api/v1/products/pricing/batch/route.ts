/**
 * API v1: Batch Product Pricing Endpoint
 *
 * POST /api/v1/products/pricing/batch - Get pricing for multiple products
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { getBatchPricing } from '@/lib/services'
import { z } from 'zod'

const batchPricingSchema = z.object({
  productIds: z.array(z.string()).min(1).max(50),
})

/**
 * POST /api/v1/products/pricing/batch - Get pricing for multiple products
 */
export const POST = withAuth(async (request) => {
  try {
    const body = await request.json()
    const validated = batchPricingSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await getBatchPricing({
      productIds: validated.data.productIds,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Get batch pricing error:', error)

    if (error.message?.includes('provide at least one') || error.message?.includes('Maximum 50')) {
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
