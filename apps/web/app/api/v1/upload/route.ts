/**
 * API v1: Upload Endpoint
 *
 * POST /api/v1/upload - Upload an image file to storage
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'
import { uploadImage } from '@/lib/services'

/**
 * POST /api/v1/upload - Upload an image file
 */
export const POST = withAuth(async (request) => {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    const result = await uploadImage({
      userId: request.user.id,
      file,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Upload error:', error)

    if (error.message?.includes('Invalid file type')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    if (error.message?.includes('File too large')) {
      return NextResponse.json(
        { error: error.message },
        { status: 413 }
      )
    }

    if (error.message?.includes('Upload failed')) {
      return NextResponse.json(
        { error: 'Upload failed' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
