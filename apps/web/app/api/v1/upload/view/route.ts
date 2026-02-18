import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'

/**
 * GET /api/v1/upload/view
 *
 * This route is expected to proxy to the AWS runtime in cutover mode.
 * Fallback response is returned when cutover proxying is not enabled.
 */
export const GET = withAuth(async () => {
  return NextResponse.json(
    {
      error: 'Image view URL is only available via AWS API cutover runtime',
    },
    { status: 501 }
  )
})
