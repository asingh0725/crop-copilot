import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

type CutoverMode = 'legacy' | 'canary' | 'aws'

const CUTOVER_PATH_PREFIX = '/api/v1/'
const DEFAULT_PROXY_TIMEOUT_MS = 15000
const ALWAYS_ENABLED_CUTOVER_PREFIXES = ['/api/v1/upload/view', '/api/v1/feedback']
const DEFAULT_CUTOVER_PATHS = [
  '/api/v1/health',
  '/api/v1/upload',
  '/api/v1/inputs',
  '/api/v1/jobs',
  '/api/v1/sync/pull',
  '/api/v1/profile',
  '/api/v1/recommendations',
]

interface ResolvedBackend {
  backend: 'legacy' | 'aws'
  mode: CutoverMode
  reason: string
}

export async function maybeProxyToAwsApi(
  request: NextRequest
): Promise<NextResponse | null> {
  const awsApiBaseUrl = process.env.AWS_API_BASE_URL?.trim()
  if (!awsApiBaseUrl) {
    return null
  }

  if (!request.nextUrl.pathname.startsWith(CUTOVER_PATH_PREFIX)) {
    return null
  }

  if (!isCutoverPathEnabled(request.nextUrl.pathname)) {
    return null
  }

  const resolution = resolveBackend(request)
  if (resolution.backend === 'legacy') {
    return null
  }

  const targetUrl = buildTargetUrl(
    awsApiBaseUrl,
    request.nextUrl.pathname,
    request.nextUrl.search
  )
  const requestHeaders = buildForwardHeaders(request.headers, resolution.mode)
  const init: RequestInit = {
    method: request.method,
    headers: requestHeaders,
    redirect: 'manual',
    cache: 'no-store',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.clone().arrayBuffer()
  }

  const timeoutMs = parsePositiveInt(
    process.env.AWS_API_PROXY_TIMEOUT_MS,
    DEFAULT_PROXY_TIMEOUT_MS
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  init.signal = controller.signal

  try {
    const upstream = await fetch(targetUrl, init)
    clearTimeout(timeout)

    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('x-crop-copilot-api-backend', 'aws')
    responseHeaders.set('x-crop-copilot-cutover-mode', resolution.mode)
    responseHeaders.set('x-crop-copilot-cutover-reason', resolution.reason)

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    clearTimeout(timeout)
    console.error('AWS API cutover proxy failed, falling back to legacy handler', {
      path: request.nextUrl.pathname,
      mode: resolution.mode,
      reason: resolution.reason,
      error: (error as Error).message,
    })
    return null
  }
}

function resolveBackend(request: NextRequest): ResolvedBackend {
  const mode = parseCutoverMode(process.env.AWS_API_CUTOVER_MODE)
  if (mode === 'legacy') {
    return { backend: 'legacy', mode, reason: 'mode_legacy' }
  }

  const authHeader = request.headers.get('authorization')
  const includeCookieTraffic = process.env.AWS_API_PROXY_INCLUDE_COOKIE_TRAFFIC === 'true'

  if (!includeCookieTraffic && !authHeader?.startsWith('Bearer ')) {
    return { backend: 'legacy', mode, reason: 'missing_bearer_token' }
  }

  if (mode === 'aws') {
    return { backend: 'aws', mode, reason: 'mode_forced_aws' }
  }

  const canaryPercent = clampPercent(
    parseNonNegativeInt(process.env.AWS_API_CUTOVER_PERCENT, 10)
  )
  if (canaryPercent <= 0) {
    return { backend: 'legacy', mode, reason: 'canary_zero_percent' }
  }

  const cohortKey =
    authHeader ??
    request.headers.get('x-request-id') ??
    request.nextUrl.pathname
  const bucket = stableBucket(cohortKey)
  const inCanary = bucket < canaryPercent

  return {
    backend: inCanary ? 'aws' : 'legacy',
    mode,
    reason: `canary_${bucket}_lt_${canaryPercent}`,
  }
}

function parseCutoverMode(raw: string | undefined): CutoverMode {
  if (raw === 'aws' || raw === 'canary' || raw === 'legacy') {
    return raw
  }

  return 'legacy'
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function clampPercent(value: number): number {
  if (value < 0) {
    return 0
  }
  if (value > 100) {
    return 100
  }
  return value
}

function stableBucket(input: string): number {
  const digest = createHash('sha256').update(input).digest()
  const bucket = digest.readUInt32BE(0) % 100
  return bucket
}

function buildForwardHeaders(
  headers: Headers,
  mode: CutoverMode
): Record<string, string> {
  const forwarded: Record<string, string> = {}
  const passthrough = [
    'authorization',
    'content-type',
    'accept',
    'x-request-id',
    'x-correlation-id',
  ]
  if (process.env.AWS_API_PROXY_INCLUDE_COOKIE_TRAFFIC === 'true') {
    passthrough.push('cookie')
  }

  for (const key of passthrough) {
    const value = headers.get(key)
    if (value) {
      forwarded[key] = value
    }
  }

  forwarded['x-crop-copilot-cutover-mode'] = mode
  forwarded['x-crop-copilot-cutover-proxy'] = 'true'

  return forwarded
}

function buildTargetUrl(baseUrl: string, pathname: string, search: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const relativePath = pathname.replace(/^\/+/, '')
  return new URL(`${relativePath}${search}`, normalizedBase)
}

function isCutoverPathEnabled(pathname: string): boolean {
  if (
    ALWAYS_ENABLED_CUTOVER_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return true
  }

  const configured = process.env.AWS_API_CUTOVER_PATHS
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const activePrefixes = configured && configured.length > 0 ? configured : DEFAULT_CUTOVER_PATHS

  return activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
