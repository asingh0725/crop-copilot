/**
 * API v1: Inputs Endpoint
 *
 * Demonstrates the service layer pattern with JWT auth support.
 * Mobile clients can use Bearer tokens, web app uses cookie sessions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { createInput, listInputs } from '@/lib/services'
import { ValidationError } from '@/lib/validation/retry'
import { z } from 'zod'

const createInputSchema = z.object({
  type: z.enum(['PHOTO', 'LAB_REPORT']),
  imageUrl: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  labData: z.record(z.string(), z.any()).optional().nullable(),
  location: z.string().optional().nullable(),
  crop: z.string().optional().nullable(),
  season: z.string().optional().nullable(),
})

/**
 * POST /api/v1/inputs - Create a new input and generate recommendation
 */
export const POST = withAuth(async (request) => {
  try {
    const body = await request.json()
    const validated = createInputSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createInput({
      userId: request.user.id,
      ...validated.data,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Create input error:', error)

    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 422 }
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
 * GET /api/v1/inputs - List user's inputs
 */
export const GET = withAuth(async (request) => {
  try {
    const inputs = await listInputs({ userId: request.user.id })
    return NextResponse.json(inputs)
  } catch (error) {
    console.error('List inputs error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
