/**
 * API v1: Retrieval Search Endpoint
 *
 * Search the knowledge base using vector similarity.
 * Supports text, image, and combined search modes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { searchKnowledgeBase } from '@/lib/services'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  type: z.enum(['text', 'image', 'both']).default('both'),
  limit: z.number().min(1).max(20).default(5),
})

/**
 * POST /api/v1/retrieval/search - Search knowledge base
 */
export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json()
    const validated = searchSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const results = await searchKnowledgeBase(validated.data)
    return NextResponse.json(results)
  } catch (error) {
    console.error('Retrieval search error:', error)
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    )
  }
})
