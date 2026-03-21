/**
 * Hypothetical Document Embedding (HyDE)
 *
 * Instead of embedding the user's raw symptom description, we ask Claude to
 * generate a short passage that an expert extension document *would* contain
 * if it answered this question. That hypothetical passage then becomes the
 * query vector.
 *
 * Why it works: symptom queries ("yellowing corn leaves") live in a different
 * embedding space than extension documents ("Nitrogen deficiency in corn
 * manifests as..."). HyDE bridges that gap by generating query-side text that
 * looks like document-side text.
 *
 * Cost: one claude-haiku call (~$0.0003) per request only when
 * ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set.
 * Falls back to the original query on any failure.
 */

export interface HyDEInput {
  query: string;
  crop?: string;
  location?: string;
  season?: string;
}

const DEFAULT_HYDE_TIMEOUT_MS = 12_000;

/**
 * Generate a hypothetical document passage for the given query context.
 * Returns null if Claude is unavailable or the call fails — caller uses
 * the original query as fallback.
 */
export async function generateHypotheticalPassage(input: HyDEInput): Promise<string | null> {
  if (process.env.DISABLE_HYDE === '1') {
    return null;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!apiKey && !authToken) return null;

  const contextParts = [
    input.crop && `Crop: ${input.crop}`,
    input.location && `Region: ${input.location}`,
    input.season && `Growth stage: ${input.season}`,
  ].filter(Boolean);

  const contextStr = contextParts.length > 0 ? ` Context: ${contextParts.join(', ')}.` : '';

  const userPrompt =
    `Write exactly 2-3 sentences from an agricultural extension publication that directly ` +
    `explains or diagnoses the following issue.${contextStr} Issue: ${input.query}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  else if (authToken) headers.authorization = `Bearer ${authToken}`;

  try {
    const timeoutMs = parsePositiveInt(
      process.env.ANTHROPIC_HYDE_TIMEOUT_MS,
      DEFAULT_HYDE_TIMEOUT_MS
    );
    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          // Use Haiku for low latency + cost — HyDE quality is robust to model size
          model: process.env.ANTHROPIC_HYDE_MODEL?.trim() ?? 'claude-haiku-4-5-20251001',
          max_tokens: 180,
          system:
            'You are an agricultural extension specialist. Write concise, factual, specific text. ' +
            'Do not include disclaimers or greetings. Output only the passage itself.',
          messages: [{ role: 'user', content: userPrompt }],
        }),
      },
      timeoutMs
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const text = payload.content?.find((b) => b.type === 'text')?.text?.trim() ?? '';
    return text.length >= 30 ? text : null;
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`HyDE request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
