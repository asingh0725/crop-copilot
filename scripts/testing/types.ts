export type ScenarioCategory =
  | "nitrogen_deficiency"
  | "phosphorus_deficiency"
  | "potassium_deficiency"
  | "micronutrient_deficiency"
  | "fungal_disease"
  | "bacterial_or_viral"
  | "insect_pressure"
  | "abiotic_stress"
  | "edge_case";

export interface TestScenario {
  id: string;
  category: ScenarioCategory;
  crop: string;
  region: string;
  growthStage: string;
  symptoms: string;
  expectedDiagnosis: string;
  expectedConditionType:
    | "deficiency"
    | "disease"
    | "pest"
    | "environmental"
    | "unknown";
  mustInclude: string[];
  shouldAvoid: string[];
}

export interface ImmediateFeedback {
  helpful: boolean;
  overallRating: number;
  accuracyRating: number;
  whatWasGood: string[];
  whatWasWrongOrMissing: string[];
  issueTags: string[];
  recommendToFarmer: "yes" | "yes_with_changes" | "no";
  simulatedOutcome?: {
    applied: boolean;
    success: "yes" | "partial" | "no";
    notes: string;
  };
}

export interface BaselineRecord {
  recommendationId: string;
  scenario: TestScenario;
  diagnosis: {
    condition: string;
    conditionType: string;
    confidence: number;
  };
  recommendationText: string[];
  sourceCount: number;
  createdAt: string;
  feedback: ImmediateFeedback;
}
