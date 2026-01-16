import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { profileSchema, type ProfileInput } from '@/lib/validations/profile'
import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id }
    })

    return NextResponse.json({ profile })
  } catch (error: unknown) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
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
    const validatedData: ProfileInput = profileSchema.parse(body)

    // Ensure cropsOfInterest is an array
    const profileData: ProfileInput = {
      ...validatedData,
      cropsOfInterest: validatedData.cropsOfInterest || []
    }

    // Ensure user exists in database
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email || '',
      }
    })

    // Update or create profile
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: profileData,
      create: {
        userId: user.id,
        ...profileData
      }
    })

    return NextResponse.json({ profile })
  } catch (error: unknown) {
    console.error('Error updating profile:', error)

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid profile data' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
