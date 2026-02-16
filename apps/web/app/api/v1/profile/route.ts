/**
 * API v1: Profile Endpoint
 *
 * GET /api/v1/profile - Get user profile
 * PUT /api/v1/profile - Update user profile
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { getProfile, updateProfile } from '@/lib/services'
import { profileSchema } from '@/lib/validations/profile'

/**
 * GET /api/v1/profile - Get user's profile
 */
export const GET = withAuth(async (request) => {
  try {
    const profile = await getProfile({ userId: request.user.id })

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

/**
 * PUT /api/v1/profile - Update user's profile
 */
export const PUT = withAuth(async (request) => {
  try {
    const body = await request.json()
    const validated = profileSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const profile = await updateProfile({
      userId: request.user.id,
      email: request.user.email || '',
      profileData: validated.data,
    })

    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error('Update profile error:', error)

    if (error.message?.includes('validation')) {
      return NextResponse.json(
        { error: 'Invalid profile data', details: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
