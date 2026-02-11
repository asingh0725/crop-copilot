import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  searchTextChunks,
  searchImageChunks,
  fetchRequiredTextChunks,
} from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'
import { buildRetrievalPlan } from '@/lib/retrieval/query'
import { resolveSourceHints } from '@/lib/retrieval/source-hints'
import { generateWithRetry, ValidationError } from '@/lib/validation/retry'
import { CLAUDE_MODEL } from '@/lib/ai/claude'
import { logRetrievalAudit } from '@/lib/retrieval/audit'

const createInputSchema = z.object({
  type: z.enum(['PHOTO', 'LAB_REPORT']),
  imageUrl: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  labData: z.record(z.string(), z.any()).optional().nullable(),
  location: z.string().optional().nullable(),
  crop: z.string().optional().nullable(),
  season: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createInputSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid input', details: validated.error.flatten() }, { status: 400 })
    }

    const input = await prisma.input.create({
      data: {
        userId: user.id,
        type: validated.data.type,
        imageUrl: validated.data.imageUrl ?? undefined,
        description: validated.data.description ?? undefined,
        labData: validated.data.labData ?? undefined,
        location: validated.data.location ?? undefined,
        crop: validated.data.crop ?? undefined,
        season: validated.data.season ?? undefined,
      }
    })

    // Generate recommendation immediately after creating input
    const plan = buildRetrievalPlan({
      description: input.description,
      labData: input.labData as Record<string, unknown> | null,
      crop: input.crop,
      location: input.location,
      growthStage: input.season,
      type: input.type,
    })
    const sourceHints = await resolveSourceHints(plan.sourceTitleHints)
    const searchOptions = {
      crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
      region: input.location ?? undefined,
      topics: plan.topics,
      sourceBoosts: sourceHints.sourceBoosts,
    }
    const textResults = await searchTextChunks(plan.query, 5, searchOptions)
    const requiredText = await fetchRequiredTextChunks(
      plan.query,
      sourceHints.requiredSourceIds
    )
    const imageResults = await searchImageChunks(plan.query, 3, searchOptions)
    const context = await assembleContext(
      [...textResults, ...requiredText],
      imageResults,
      { requiredSourceIds: sourceHints.requiredSourceIds }
    )

    if (context.totalChunks === 0) {
      return NextResponse.json(
        {
          error: 'No relevant knowledge found',
          details: 'Unable to find context for this input',
          inputId: input.id
        },
        { status: 422 }
      )
    }

    // Normalize input for agent
    const normalizedInput = {
      type: input.type,
      description: input.description || undefined,
      labData: input.labData || undefined,
      imageUrl: input.imageUrl || undefined,
      crop: input.crop ?? (input.labData as Record<string, unknown>)?.crop as string ?? undefined,
      location: input.location || undefined,
    }

    // Generate recommendation with retry logic
    const recommendation = await generateWithRetry(normalizedInput, context)

    // Store recommendation in database
    const savedRecommendation = await prisma.recommendation.create({
      data: {
        userId: user.id,
        inputId: input.id,
        diagnosis: recommendation as object,
        confidence: recommendation.confidence,
        modelUsed: CLAUDE_MODEL,
      },
    })

    // Store source links
    await Promise.all(
      recommendation.sources.map(async (source) => {
        const [textChunk, imageChunk] = await Promise.all([
          prisma.textChunk.findUnique({
            where: { id: source.chunkId },
            select: { id: true },
          }),
          prisma.imageChunk.findUnique({
            where: { id: source.chunkId },
            select: { id: true },
          }),
        ])

        return prisma.recommendationSource.create({
          data: {
            recommendationId: savedRecommendation.id,
            textChunkId: textChunk ? source.chunkId : null,
            imageChunkId: imageChunk ? source.chunkId : null,
            relevanceScore: source.relevance,
          },
        })
      })
    )

    // Log retrieval audit (fire-and-forget)
    logRetrievalAudit({
      inputId: input.id,
      recommendationId: savedRecommendation.id,
      plan,
      requiredSourceIds: sourceHints.requiredSourceIds,
      textCandidates: [...textResults, ...requiredText].map((r) => ({
        id: r.id,
        similarity: r.similarity,
        sourceId: r.sourceId,
      })),
      imageCandidates: imageResults.map((r) => ({
        id: r.id,
        similarity: r.similarity,
        sourceId: r.sourceId,
      })),
      assembledChunkIds: context.chunks.map((c) => c.id),
      citedChunkIds: recommendation.sources.map((s) => s.chunkId),
    })

    return NextResponse.json({
      input,
      recommendationId: savedRecommendation.id,
    }, { status: 201 })
  } catch (error) {
    console.error('Create input error:', error)

    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          error: 'Recommendation validation failed',
          details: error.details,
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const inputs = await prisma.input.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        recommendations: {
          select: { id: true }
        }
      }
    })

    return NextResponse.json(inputs)
  } catch (error) {
    console.error('Get inputs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
