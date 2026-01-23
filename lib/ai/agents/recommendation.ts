import { anthropic, CLAUDE_MODEL } from "../claude";
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

const SYSTEM_PROMPT = `You are an expert agricultural advisor AI agent. Your role is to generate structured crop recommendations based on user inputs and retrieved knowledge base context.

**Your Constraints:**
- You MUST cite sources for all factual claims using chunk IDs from the provided context
- You CANNOT recommend products not mentioned in the context or knowledge base
- You MUST express uncertainty when confidence is low (< 0.7)
- Your output MUST match the exact JSON schema provided
- Confidence scores must be between 0.5 and 0.95 (never claim 100% certainty)

**Output Format:**
You must respond with a valid JSON object matching this structure:
{
  "diagnosis": {
    "condition": "Primary condition identified",
    "conditionType": "deficiency|disease|pest|environmental|unknown",
    "confidence": 0.0-1.0,
    "reasoning": "Explanation of diagnosis"
  },
  "recommendations": [
    {
      "action": "Specific action to take",
      "priority": "immediate|soon|when_convenient",
      "timing": "When to apply (optional)",
      "details": "Detailed instructions",
      "citations": ["chunk_id_1", "chunk_id_2"]
    }
  ],
  "products": [
    {
      "productId": "product_id_from_context",
      "reason": "Why this product is recommended",
      "applicationRate": "Rate (optional)",
      "alternatives": ["alt_product_id_1"]
    }
  ],
  "sources": [
    {
      "chunkId": "chunk_id",
      "relevance": 0.0-1.0,
      "excerpt": "Relevant text excerpt (max 500 chars)"
    }
  ],
  "confidence": 0.0-1.0
}`;

export async function generateRecommendation(
  input: NormalizedInput,
  context: AssembledContext,
  retryFeedback?: string
): Promise<RecommendationOutput> {
  const startTime = Date.now();

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
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
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
  let message = `Generate a crop recommendation based on the following input and context.

**USER INPUT:**
- Input Type: ${input.type}
- Crop: ${input.crop || "Not specified"}
- Location: ${input.location || "Not specified"}
`;

  if (input.description) {
    message += `- Description: ${input.description}\n`;
  }

  if (input.labData) {
    message += `- Lab Data: ${JSON.stringify(input.labData, null, 2)}\n`;
  }

  message += `\n**RETRIEVED CONTEXT (${context.totalChunks} chunks, ${context.totalTokens} tokens):**\n\n`;

  context.chunks.forEach((chunk, index) => {
    message += `[Chunk ID: ${chunk.id}] (Relevance: ${chunk.similarity.toFixed(2)})\n`;
    message += `Source: ${chunk.source.title} (${chunk.source.sourceType})\n`;
    message += `${chunk.content}\n\n`;
  });

  if (retryFeedback) {
    message += `\n**RETRY FEEDBACK:**\n${retryFeedback}\n\nPlease fix the issues and try again.\n`;
  }

  return message;
}
