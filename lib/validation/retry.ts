import { ZodError } from "zod";
import { RecommendationSchema, type RecommendationOutput } from "./schemas";
import {
  generateRecommendation,
  type NormalizedInput,
} from "@/lib/ai/agents/recommendation";
import type { AssembledContext } from "@/lib/retrieval/context-assembly";

const MAX_ATTEMPTS = 2;

export class ValidationError extends Error {
  constructor(
    message: string,
    public details: any
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Generate recommendation with automatic retry on validation failure
 */
export async function generateWithRetry(
  input: NormalizedInput,
  context: AssembledContext
): Promise<RecommendationOutput> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `Recommendation generation attempt ${attempt}/${MAX_ATTEMPTS}`
      );

      // Generate recommendation (with retry feedback if this is attempt 2)
      const retryFeedback =
        attempt > 1 ? formatRetryFeedback(lastError!) : undefined;
      const rawRecommendation = await generateRecommendation(
        input,
        context,
        retryFeedback
      );

      // Validate with Zod schema
      const validatedRecommendation =
        RecommendationSchema.parse(rawRecommendation);

      console.log("Recommendation validated successfully");
      return validatedRecommendation;
    } catch (error) {
      lastError = error as Error;

      if (error instanceof ZodError) {
        console.error(`Validation failed on attempt ${attempt}:`, error.issues);

        if (attempt === MAX_ATTEMPTS) {
          throw new ValidationError(
            "Recommendation failed validation after maximum retries",
            error.issues
          );
        }
        // Continue to next attempt
      } else if(error instanceof SyntaxError) {
        if (attempt === MAX_ATTEMPTS) {
          console.error(`Validation failed on attempt ${attempt}:`, error.message);
          throw new ValidationError(
            "Recommendation failed validation after maximum retries",
            error.message
          );
        }
      } else {
        // Non-validation error (e.g., API error) - don't retry
        console.error("Non-validation error:", error);
        throw error;
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new ValidationError("Recommendation generation failed", lastError);
}

/**
 * Format validation error into feedback for the AI agent
 */
function formatRetryFeedback(error: Error): string {
  if (error instanceof ZodError) {
    let feedback =
      "Your previous response failed validation. Please fix these issues:\n\n";

    error.issues.forEach((err: any, index: number) => {
      const path = err.path.join(".");
      feedback += `${index + 1}. Field "${path}": ${err.message}\n`;
    });

    feedback += "\nPlease ensure:\n";
    feedback += "- All required fields are present\n";
    feedback += "- Confidence values are between 0 and 1\n";
    feedback +=
      '- Priority values are "immediate", "soon", or "when_convenient"\n';
    feedback +=
      "- Condition type is one of: deficiency, disease, pest, environmental, unknown\n";
    feedback += "- Each recommendation has at least one citation\n";
    feedback += "- Product IDs match those available in the context\n";

    return feedback;
  }

  return `Previous attempt failed: ${error.message}`;
}
