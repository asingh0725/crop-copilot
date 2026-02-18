/**
 * API v1: Feedback Endpoint
 *
 * POST /api/v1/feedback - Submit feedback for a recommendation
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { submitFeedback, feedbackSchema, getFeedback } from '@/lib/services'

/**
 * POST /api/v1/feedback - Submit or update feedback for a recommendation
 */
export const POST = withAuth(async (request) => {
  try {
    const body = await request.json()
    const validated = feedbackSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await submitFeedback({
      userId: request.user.id,
      feedbackData: validated.data,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Submit feedback error:', error)

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      )
    }

    if (error.message?.includes('only provide feedback on your own')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    if (error.message?.includes('validation')) {
      return NextResponse.json(
        { error: 'Invalid feedback data', details: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

/**
 * GET /api/v1/feedback - Get feedback for a recommendation
 */
export const GET = withAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const recommendationId = searchParams.get('recommendationId')

    if (!recommendationId) {
      return NextResponse.json(
        { error: 'recommendationId is required' },
        { status: 400 }
      )
    }

    const feedback = await getFeedback({
      userId: request.user.id,
      recommendationId,
    })

    return NextResponse.json({ feedback }, { status: 200 })
  } catch (error: any) {
    console.error('Get feedback error:', error)

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      )
    }

    if (error.message?.includes('only provide feedback on your own')) {
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
