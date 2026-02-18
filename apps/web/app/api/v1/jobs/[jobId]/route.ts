import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'

/**
 * GET /api/v1/jobs/:jobId
 *
 * In AWS cutover mode this request is proxied by `withAuth` to the
 * Lambda runtime endpoint. This fallback response is returned only when
 * cutover proxying is not enabled.
 */
export const GET = withAuth(async () => {
  return NextResponse.json(
    {
      error: 'Job status is only available via AWS API cutover runtime',
    },
    { status: 501 }
  )
})
