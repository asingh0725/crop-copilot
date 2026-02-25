/**
 * Thin HTTP client for calling the AWS API Gateway directly.
 *
 * All data endpoints (profile, recommendations, products, inputs, jobs,
 * upload, feedback, retrieval) live on the API Gateway Lambda stack.
 * This replaces the web app's internal /api/v1/* Next.js routes and the
 * aws-cutover-proxy middleware.
 *
 * Usage (server component):
 *   const supabase = await createClient();
 *   const { data: { session } } = await supabase.auth.getSession();
 *   const client = createApiClient(session?.access_token ?? '');
 *   const rec = await client.get<RecommendationDetail>('/api/v1/recommendations/123');
 *
 * Usage (client component):
 *   const { data: { session } } = await supabase.auth.getSession();
 *   const client = createApiClient(session?.access_token ?? '');
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export function getBrowserApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? '').replace(/\/+$/, '');
}

function getGatewayBaseUrl(): string {
  // Server-side: API_GATEWAY_URL (not exposed to browser)
  // Client-side: NEXT_PUBLIC_API_GATEWAY_URL
  const url =
    (typeof window === 'undefined'
      ? process.env.API_GATEWAY_URL
      : process.env.NEXT_PUBLIC_API_GATEWAY_URL) ?? '';
  return url.replace(/\/+$/, '');
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export function createApiClient(accessToken: string): ApiClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = getGatewayBaseUrl();
    if (!base) {
      throw new ApiClientError(
        503,
        'API Gateway URL is not configured. ' +
          'Set API_GATEWAY_URL (server) or NEXT_PUBLIC_API_GATEWAY_URL (browser) in your environment.'
      );
    }
    const url = `${base}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        throw new ApiClientError(408, `Request to ${path} timed out`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ApiClientError(response.status, `${response.status} ${response.statusText}`, body);
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}
