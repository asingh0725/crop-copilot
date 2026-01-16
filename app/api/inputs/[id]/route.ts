import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

type InputRouteContext = {
  params: {
    id: string
  }
}

export async function GET(
  request: NextRequest,
  { params }: InputRouteContext
): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const input = await prisma.input.findUnique({
      where: { id: params.id },
      include: {
        recommendations: true
      }
    })

    if (!input) {
      return NextResponse.json({ error: 'Input not found' }, { status: 404 })
    }

    if (input.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(input)
  } catch (error: unknown) {
    console.error('Get input error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
