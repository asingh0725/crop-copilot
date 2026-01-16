import { z } from 'zod'

// Validation failure response
export const ValidationFailureSchema = z.object({
  validation: z.object({
    passed: z.literal(false),
    inputQuality: z.literal('insufficient'),
    issues: z.array(z.string()).min(1),
  }),
})

// Quality factors for successful validation
export const QualityFactorsSchema = z.object({
  imageClarity: z.enum(['unclear', 'acceptable', 'clear']).nullable(),
  imageRelevance: z.enum(['not_agricultural', 'agricultural']).nullable(),
  descriptionDetail: z.enum(['vague', 'basic', 'detailed']).nullable(),
  labDataProvided: z.boolean(),
})

// Successful validation
export const ValidationSuccessSchema = z.object({
  validation: z.object({
    passed: z.literal(true),
    inputQuality: z.enum(['minimal', 'adequate', 'good', 'excellent']),
    qualityFactors: QualityFactorsSchema,
  }),
})

// Primary diagnosis condition
export const PrimaryConditionSchema = z.object({
  condition: z.string().min(1),
  confidence: z.number().min(0.5).max(0.95),
  confidenceLevel: z.enum(['low', 'moderate', 'high']),
  severity: z.enum(['low', 'moderate', 'high', 'critical']),
  reasoning: z.string().min(50),
})

// Differential diagnosis
export const DifferentialDiagnosisSchema = z.object({
  condition: z.string().min(1),
  likelihood: z.number().min(0).max(1),
  differentiatingFactors: z.string().min(20),
})

// Recommendation action
export const RecommendationActionSchema = z.object({
  action: z.string().min(1),
  priority: z.enum(['immediate', 'soon', 'monitor']),
  timing: z.string().min(1),
  details: z.string().min(20),
  safetyNotes: z.string().nullable(),
})

// Disclaimers
export const DisclaimersSchema = z.object({
  liability: z.string().min(50),
  safety: z.string().min(50),
})

// Complete successful recommendation output
export const RecommendationOutputSchema = z.object({
  validation: z.object({
    passed: z.literal(true),
    inputQuality: z.enum(['minimal', 'adequate', 'good', 'excellent']),
    qualityFactors: QualityFactorsSchema,
  }),
  diagnosis: z.object({
    primaryCondition: PrimaryConditionSchema,
    differentialDiagnoses: z.array(DifferentialDiagnosisSchema).min(0).max(3),
  }),
  recommendations: z.array(RecommendationActionSchema).min(1).max(5),
  confidenceExplanation: z.string().min(50),
  additionalNotes: z.string(),
  disclaimers: DisclaimersSchema,
})

// Union type for any AI response
export const AIResponseSchema = z.union([
  ValidationFailureSchema,
  RecommendationOutputSchema,
])

// Type exports
export type ValidationFailure = z.infer<typeof ValidationFailureSchema>
export type RecommendationOutput = z.infer<typeof RecommendationOutputSchema>
export type AIResponse = z.infer<typeof AIResponseSchema>

/**
 * Check if response is a validation failure
 */
export function isValidationFailure(response: AIResponse): response is ValidationFailure {
  return response.validation.passed === false
}

/**
 * Check if response is a successful recommendation
 */
export function isRecommendationOutput(response: AIResponse): response is RecommendationOutput {
  return response.validation.passed === true
}
