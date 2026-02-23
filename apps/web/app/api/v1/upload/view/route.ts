/**
 * GET /api/v1/upload/view?objectUrl=<s3-url>
 *
 * Proxy to the AWS Lambda GetUploadViewUrlHandler.
 * The browser-side SecureImage component fetches this as a relative URL,
 * so we add the server-side Supabase Bearer token before forwarding.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AWS_BASE = (process.env.API_GATEWAY_URL ?? '').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  if (!AWS_BASE) {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'API Gateway URL is not configured' } },
      { status: 503 }
    );
  }

  const objectUrl = request.nextUrl.searchParams.get('objectUrl');
  if (!objectUrl) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'objectUrl query parameter is required' } },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const target = `${AWS_BASE}/api/v1/upload/view?objectUrl=${encodeURIComponent(objectUrl)}`;

  const headers: HeadersInit = { Accept: 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const upstream = await fetch(target, { headers });
  const body = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
