import { z } from "zod";

export const DiagnosisSchema = z.object({
  condition: z.string().min(1, "Condition name is required"),
  conditionType: z.enum([
    "deficiency",
    "disease",
    "pest",
    "environmental",
    "unknown",
  ]),
  confidence: z
    .number()
    .min(0, "Confidence must be >= 0")
    .max(1, "Confidence must be <= 1"),
  reasoning: z.string().min(10, "Reasoning must be at least 10 characters"),
});

export const ActionItemSchema = z.object({
  action: z.string().min(1, "Action is required"),
  priority: z.enum(["immediate", "soon", "when_convenient"]),
  timing: z.string().optional(),
  details: z.string().min(10, "Details must be at least 10 characters"),
  citations: z
    .array(z.string())
    .min(1, "At least one citation is required per action"),
});

export const ProductSuggestionSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  applicationRate: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
});

export const SourceSchema = z.object({
  chunkId: z.string().min(1, "Chunk ID is required"),
  relevance: z.number().min(0).max(1),
  excerpt: z.string().max(500, "Excerpt must be <= 500 characters"),
});

export const RecommendationSchema = z.object({
  diagnosis: DiagnosisSchema,
  recommendations: z
    .array(ActionItemSchema)
    .min(1, "At least one recommendation is required")
    .max(5, "Maximum 5 recommendations allowed"),
  products: z
    .array(ProductSuggestionSchema)
    .max(6, "Maximum 6 products allowed"),
  sources: z.array(SourceSchema).min(1, "At least one source is required"),
  confidence: z.number().min(0).max(1),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type ProductSuggestion = z.infer<typeof ProductSuggestionSchema>;
export type RecommendationOutput = z.infer<typeof RecommendationSchema>;
