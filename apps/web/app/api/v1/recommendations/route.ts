/**
 * API v1: Recommendations Endpoint
 *
 * GET /api/v1/recommendations - List recommendations with filters
 * POST /api/v1/recommendations - Create/regenerate recommendation for an input
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { listRecommendations, generateRecommendation } from '@/lib/services'
import { z } from 'zod'

const generateRecommendationSchema = z.object({
  inputId: z.string(),
})

/**
 * GET /api/v1/recommendations - List user's recommendations with filters
 */
export const GET = withAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const sort = searchParams.get('sort') as 'date_asc' | 'date_desc' | 'confidence_high' | 'confidence_low' | undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

    const result = await listRecommendations({
      userId: request.user.id,
      search,
      sort,
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('List recommendations error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

/**
 * POST /api/v1/recommendations - Generate recommendation for an input
 */
export const POST = withAuth(async (request) => {
  try {
    const body = await request.json()
    const validated = generateRecommendationSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await generateRecommendation({
      userId: request.user.id,
      inputId: validated.data.inputId,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Generate recommendation error:', error)

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Input not found' },
        { status: 404 }
      )
    }

    if (error.message?.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    if (error.message?.includes('No relevant knowledge found')) {
      return NextResponse.json(
        { error: 'No relevant knowledge found', details: error.message },
        { status: 422 }
      )
    }

    if (error.message?.includes('validation failed')) {
      return NextResponse.json(
        { error: 'Recommendation validation failed', details: error.message },
        { status: 422 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
