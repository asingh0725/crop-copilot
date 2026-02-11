/**
 * LLM-as-judge for faithfulness evaluation.
 *
 * Uses Claude Haiku to check whether recommendation claims
 * are grounded in the cited source chunks.
 *
 * Rate limit aware: Haiku Tier 1 = 50K input TPM, 10K output TPM.
 */

import { getAnthropicClient } from "@/lib/ai/claude";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 800;

export interface FaithfulnessVerdict {
  action: string;
  supported: boolean;
  reasoning: string;
}

export interface FaithfulnessResult {
  faithfulness: number; // 1-5
  perAction: FaithfulnessVerdict[];
  rawOutput?: string;
}

interface ChunkInfo {
  id: string;
  content: string;
  sourceTitle: string;
}

interface RecommendationForJudge {
  diagnosis: {
    condition: string;
    conditionType: string;
    reasoning: string;
  };
  recommendations: Array<{
    action: string;
    details: string;
    citations: string[];
  }>;
  sources: Array<{
    chunkId: string;
    excerpt: string;
  }>;
}

const SYSTEM_PROMPT = `You are an agricultural recommendation auditor. Your job is to check whether each recommendation action is factually supported by the cited source chunks.

For each action, determine:
1. Does the cited chunk(s) contain information that supports this specific action?
2. Are there any claims in the action that go beyond what the sources say?

Score faithfulness 1-5:
- 5: Every action is directly supported by cited chunks
- 4: Most actions supported, minor extrapolations
- 3: Some actions supported but notable gaps
- 2: Weak evidence connection, significant unsupported claims
- 1: Claims are not grounded in cited sources

Return ONLY valid JSON matching this schema:
{
  "faithfulness": <1-5>,
  "perAction": [
    {
      "action": "<action text>",
      "supported": <true|false>,
      "reasoning": "<brief explanation>"
    }
  ]
}`;

function buildUserPrompt(
  recommendation: RecommendationForJudge,
  chunks: ChunkInfo[]
): string {
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));

  let prompt = `DIAGNOSIS: ${recommendation.diagnosis.condition} (${recommendation.diagnosis.conditionType})\n\n`;
  prompt += `ACTIONS TO EVALUATE:\n`;

  for (const rec of recommendation.recommendations) {
    prompt += `\n- Action: ${rec.action}\n  Details: ${rec.details}\n  Cited chunks: ${rec.citations.join(", ")}\n`;
  }

  prompt += `\nSOURCE CHUNKS:\n`;

  for (const source of recommendation.sources) {
    const chunk = chunkMap.get(source.chunkId);
    const content = chunk?.content || source.excerpt;
    // Cap each chunk to 800 chars to stay within token budget
    const truncated =
      content.length > 800 ? content.slice(0, 800) + "..." : content;
    const title = chunk?.sourceTitle || "Unknown source";
    prompt += `\n[${source.chunkId}] (${title})\n${truncated}\n`;
  }

  return prompt;
}

export async function judgeFaithfulness(params: {
  recommendation: RecommendationForJudge;
  chunks: ChunkInfo[];
}): Promise<FaithfulnessResult> {
  const { recommendation, chunks } = params;

  // Skip if no actions or no sources to judge against
  if (
    recommendation.recommendations.length === 0 ||
    recommendation.sources.length === 0
  ) {
    return {
      faithfulness: 1,
      perAction: recommendation.recommendations.map((r) => ({
        action: r.action,
        supported: false,
        reasoning: "No source chunks available to verify claims",
      })),
    };
  }

  const anthropic = getAnthropicClient();
  const userPrompt = buildUserPrompt(recommendation, chunks);

  try {
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = response.content.find(
      (block) => block.type === "text"
    );
    const rawOutput =
      textContent?.type === "text" ? textContent.text : "";

    // Parse JSON response
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Faithfulness judge returned non-JSON:", rawOutput);
      return {
        faithfulness: 3,
        perAction: [],
        rawOutput,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      faithfulness: number;
      perAction: FaithfulnessVerdict[];
    };

    return {
      faithfulness: Math.max(1, Math.min(5, Math.round(parsed.faithfulness))),
      perAction: parsed.perAction || [],
      rawOutput,
    };
  } catch (error) {
    console.error("Faithfulness judge failed:", error);
    // Return neutral score on failure — don't block eval
    return {
      faithfulness: 3,
      perAction: [],
      rawOutput: String(error),
    };
  }
}
