import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AWS_BASE = (
  process.env.API_GATEWAY_URL ??
  process.env.NEXT_PUBLIC_API_GATEWAY_URL ??
  ''
).replace(/\/+$/, '');

function copyForwardHeaders(request: NextRequest): Headers {
  const forward = new Headers();

  // Forward safe request headers; host/content-length are managed by fetch.
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection') {
      return;
    }
    forward.set(key, value);
  });

  if (!forward.has('accept')) {
    forward.set('accept', 'application/json');
  }

  return forward;
}

async function resolveAuthHeader(request: NextRequest): Promise<string | null> {
  const existing = request.headers.get('authorization');
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ? `Bearer ${session.access_token}` : null;
}

async function forwardToAws(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  if (!AWS_BASE) {
    return NextResponse.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'API Gateway URL is not configured',
        },
      },
      { status: 503 }
    );
  }

  const targetPath = pathSegments.join('/');
  const target = `${AWS_BASE}/api/v1/${targetPath}${request.nextUrl.search}`;
  const headers = copyForwardHeaders(request);
  const authHeader = await resolveAuthHeader(request);
  if (authHeader) {
    headers.set('authorization', authHeader);
  }

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  return forwardToAws(request, path ?? []);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  return forwardToAws(request, path ?? []);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  return forwardToAws(request, path ?? []);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  return forwardToAws(request, path ?? []);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  return forwardToAws(request, path ?? []);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  return forwardToAws(request, path ?? []);
}
