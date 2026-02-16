/**
 * API v1: Single Input Endpoint
 *
 * GET /api/v1/inputs/:id - Get input by ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { getInputById } from '@/lib/services'

/**
 * GET /api/v1/inputs/:id - Get a specific input by ID
 */
export const GET = withAuth(async (request, { params }) => {
  try {
    const { id } = await params

    const input = await getInputById({
      userId: request.user.id,
      inputId: id,
    })

    return NextResponse.json(input)
  } catch (error: any) {
    console.error('Get input error:', error)

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

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
