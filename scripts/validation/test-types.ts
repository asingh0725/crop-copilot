import type {
  Diagnosis,
  ActionItem,
  ProductSuggestion,
  RecommendationOutput,
} from "@/lib/validation/schemas";
import { ValidationError } from "@/lib/validation/retry";

// This script verifies that types are correctly exported
// If it compiles without errors, types are working

const mockDiagnosis: Diagnosis = {
  condition: "Test Condition",
  conditionType: "deficiency",
  confidence: 0.8,
  reasoning: "Test reasoning",
};

const mockAction: ActionItem = {
  action: "Test action",
  priority: "immediate",
  details: "Test details",
  citations: ["chunk-1"],
};

const mockProduct: ProductSuggestion = {
  productId: "prod-1",
  reason: "Test reason",
  applicationRate: "10 gal/acre",
};

const mockRecommendation: RecommendationOutput = {
  diagnosis: mockDiagnosis,
  recommendations: [mockAction],
  products: [mockProduct],
  sources: [
    {
      chunkId: "chunk-1",
      relevance: 0.9,
      excerpt: "Test excerpt",
    },
  ],
  confidence: 0.8,
};

console.log("✅ All TypeScript types are correctly exported and valid");
console.log("Mock diagnosis:", mockDiagnosis.condition);
console.log("Mock recommendation confidence:", mockRecommendation.confidence);

// Test ValidationError type
const mockError = new ValidationError("Test error", { test: "details" });
console.log("ValidationError name:", mockError.name);
console.log("ValidationError details:", mockError.details);

console.log("\n✅ Type exports test passed!");
