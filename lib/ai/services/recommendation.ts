import { analyzeText, analyzeWithVision, imageUrlToBase64 } from '@/lib/ai/claude'
import { DIAGNOSIS_SYSTEM_PROMPT, buildDiagnosisPrompt, DiagnosisPromptInput } from '@/lib/ai/prompts/diagnosis'
import { AIResponseSchema, AIResponse, isValidationFailure } from '@/lib/validations/recommendation'

const MAX_RETRIES = 2

interface GenerationResult {
  success: boolean
  response?: AIResponse
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  model?: string
}

/**
 * Parse JSON from Claude response, handling potential markdown code blocks
 */
function parseJSONResponse(content: string): unknown {
  let cleaned = content.trim()

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }

  cleaned = cleaned.trim()

  return JSON.parse(cleaned)
}

/**
 * Generate a recommendation for the given input
 */
export async function generateRecommendation(
  input: DiagnosisPromptInput
): Promise<GenerationResult> {
  let lastError: string | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const userPrompt = buildDiagnosisPrompt(input)
      let claudeResponse

      // Use vision API if we have an image
      if (input.imageUrl && (input.type === 'PHOTO' || input.type === 'HYBRID')) {
        const { base64, mediaType } = await imageUrlToBase64(input.imageUrl)
        claudeResponse = await analyzeWithVision(
          DIAGNOSIS_SYSTEM_PROMPT,
          userPrompt,
          base64,
          mediaType
        )
      } else {
        claudeResponse = await analyzeText(
          DIAGNOSIS_SYSTEM_PROMPT,
          userPrompt
        )
      }

      // Parse JSON response
      let parsed: unknown
      try {
        parsed = parseJSONResponse(claudeResponse.content)
      } catch (parseError) {
        lastError = `Failed to parse JSON response: ${parseError}`
        console.error(`Attempt ${attempt}: ${lastError}`)
        console.error('Raw response:', claudeResponse.content)
        continue
      }

      // Validate with Zod
      const validated = AIResponseSchema.safeParse(parsed)

      if (!validated.success) {
        lastError = `Schema validation failed: ${JSON.stringify(validated.error.flatten())}`
        console.error(`Attempt ${attempt}: ${lastError}`)
        continue
      }

      return {
        success: true,
        response: validated.data,
        usage: claudeResponse.usage,
        model: claudeResponse.model,
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Attempt ${attempt} error:`, lastError)
    }
  }

  return {
    success: false,
    error: lastError || 'Failed to generate recommendation after multiple attempts',
  }
}

/**
 * Convert database Input to DiagnosisPromptInput
 */
export function inputToPromptInput(input: {
  type: string
  imageUrl?: string | null
  description?: string | null
  labData?: Record<string, any> | null
  crop?: string | null
  location?: string | null
  season?: string | null
}): DiagnosisPromptInput {
  return {
    type: input.type as 'PHOTO' | 'LAB_REPORT' | 'HYBRID',
    imageUrl: input.imageUrl,
    description: input.description,
    labData: input.labData,
    crop: input.crop,
    location: input.location,
    growthStage: input.season,
  }
}
