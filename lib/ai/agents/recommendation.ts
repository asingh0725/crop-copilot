import { CLAUDE_MODEL, getAnthropicClient } from "../claude";
import type { AssembledContext } from "@/lib/retrieval/context-assembly";

export interface NormalizedInput {
  type: string;
  description?: string;
  labData?: any;
  imageUrl?: string;
  crop?: string;
  location?: string;
}

export interface RecommendationOutput {
  diagnosis: {
    condition: string;
    conditionType: string;
    confidence: number;
    reasoning: string;
  };
  recommendations: Array<{
    action: string;
    priority: string;
    timing?: string;
    details: string;
    citations: string[];
  }>;
  products: Array<{
    productId: string;
    reason: string;
    applicationRate?: string;
    alternatives?: string[];
  }>;
  sources: Array<{
    chunkId: string;
    relevance: number;
    excerpt: string;
  }>;
  confidence: number;
}

const SYSTEM_PROMPT = `You are an expert agricultural advisor. Use ONLY the provided context.

Rules:
- Output ONLY valid JSON matching the schema.
- Cite chunk IDs for every factual claim and each action.
- Prefer extension/government/research chunks when available.
- Only recommend products mentioned in context.
- The primary diagnosis MUST be explicitly supported by at least one cited chunk (condition name or defining symptom).
- conditionType MUST match the primary diagnosis category; if uncertain, set conditionType to "unknown".
- Include differential diagnosis in diagnosis.reasoning.
- Include at least one timing window tied to growth stage.
- Include a validation step before high-cost actions.
- If confidence < 0.75 or evidence is mixed, state uncertainty and escalation.
- If evidence is insufficient/conflicting, set conditionType to "unknown" and focus on diagnostics.
- Confidence must be 0.5–0.95.
- Keep output compact when possible (≈2 recommendations, ≤2 sources).
- Every recommendation action MUST cite at least one chunk. Actions without citations will be rejected.
- If chunks from required/priority sources are in the context, at least one MUST appear in your citations.

Schema (compact):
{"diagnosis":{"condition":"","conditionType":"deficiency|disease|pest|environmental|unknown","confidence":0.0,"reasoning":""},"recommendations":[{"action":"","priority":"immediate|soon|when_convenient","timing":"","details":"","citations":["chunkId"]}],"products":[{"productId":"","reason":"","applicationRate":"","alternatives":["id"]}],"sources":[{"chunkId":"","relevance":0.0,"excerpt":""}],"confidence":0.0}`;

export async function generateRecommendation(
  input: NormalizedInput,
  context: AssembledContext,
  retryFeedback?: string
): Promise<RecommendationOutput> {
  const startTime = Date.now();
  const anthropic = getAnthropicClient();

  const userMessage = formatUserMessage(input, context, retryFeedback);

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const latency = Date.now() - startTime;
    const usage = response.usage;

    console.log("Claude API usage:", {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      latencyMs: latency,
      stopReason: response.stop_reason,
    });

    // Check if response has content
    if (!response.content || response.content.length === 0) {
      console.error("Claude returned empty content:", {
        stopReason: response.stop_reason,
        content: response.content,
      });
      throw new Error(
        `Claude returned empty response. Stop reason: ${response.stop_reason}`
      );
    }

    const content = response.content[0];
    if (!content || content.type !== "text") {
      console.error("Unexpected content type:", content);
      throw new Error(
        `Unexpected response type from Claude: ${content?.type || "undefined"}`
      );
    }

    // Check if text is empty
    if (!content.text || content.text.trim().length === 0) {
      throw new Error("Claude returned empty text response");
    }

    // Parse JSON response - strip markdown code blocks if present
    let jsonText = content.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      // Remove opening ```json or ```
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "");
      // Remove closing ```
      jsonText = jsonText.replace(/\n?```$/, "");
      jsonText = jsonText.trim();
    }

    // Sometimes Claude adds explanatory text after the JSON
    // Try to extract just the JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    const recommendation = JSON.parse(jsonText);
    return recommendation;
  } catch (error) {
    console.error("Error generating recommendation:", error);
    throw error;
  }
}

function formatUserMessage(
  input: NormalizedInput,
  context: AssembledContext,
  retryFeedback?: string
): string {
  const inputPayload: Record<string, unknown> = {
    type: input.type,
  };

  if (input.crop) inputPayload.crop = input.crop;
  if (input.location) inputPayload.location = input.location;
  if (input.description) inputPayload.description = input.description;
  if (input.labData) inputPayload.labData = input.labData;

  let message = `INPUT:${JSON.stringify(inputPayload)}\nCONTEXT:\n`;

  context.chunks.forEach((chunk) => {
    message += `[${chunk.id}|rel=${chunk.similarity.toFixed(
      2
    )}|${chunk.source.sourceType}] ${chunk.source.title}\n`;
    message += `${chunk.content}\n\n`;
  });

  if (retryFeedback) {
    message += `RETRY:${retryFeedback}\n`;
  }

  return message;
}
