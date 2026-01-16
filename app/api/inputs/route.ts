import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const labDataSchema = z.record(
  z.string(),
  z.union([z.number(), z.string(), z.null()])
)

const createInputSchema = z.object({
  type: z.enum(['PHOTO', 'LAB_REPORT', 'HYBRID']),
  imageUrl: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
  labData: labDataSchema.optional().nullable(),
  location: z.string().optional().nullable(),
  crop: z.string().optional().nullable(),
  season: z.string().optional().nullable(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: unknown = await request.json()
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

    return NextResponse.json(input, { status: 201 })
  } catch (error: unknown) {
    console.error('Create input error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

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
  } catch (error: unknown) {
    console.error('Get inputs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
