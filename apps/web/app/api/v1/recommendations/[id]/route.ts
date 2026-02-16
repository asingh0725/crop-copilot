/**
 * API v1: Single Recommendation Endpoint
 *
 * GET /api/v1/recommendations/:id - Get recommendation by ID
 * DELETE /api/v1/recommendations/:id - Delete recommendation
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { getRecommendation, deleteRecommendation } from '@/lib/services'

/**
 * GET /api/v1/recommendations/:id - Get a specific recommendation by ID
 */
export const GET = withAuth(async (request, { params }) => {
  try {
    const { id } = await params

    const recommendation = await getRecommendation({
      userId: request.user.id,
      id,
    })

    return NextResponse.json(recommendation)
  } catch (error: any) {
    console.error('Get recommendation error:', error)

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      )
    }

    if (error.message?.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

/**
 * DELETE /api/v1/recommendations/:id - Delete a recommendation
 */
export const DELETE = withAuth(async (request, { params }) => {
  try {
    const { id } = await params

    await deleteRecommendation({
      userId: request.user.id,
      id,
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error('Delete recommendation error:', error)

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      )
    }

    if (error.message?.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
