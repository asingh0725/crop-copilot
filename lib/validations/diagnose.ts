import { z, type ZodOptional, type ZodType } from "zod";

export const GROWTH_STAGES: readonly string[] = [
  "Seedling",
  "Vegetative",
  "Flowering",
  "Fruiting",
  "Mature",
  "Harvest",
];

export const photoDiagnoseSchema = z.object({
  description: z
    .string()
    .min(20, "Please provide at least 20 characters")
    .max(1000),
  crop: z.string().min(1, "Please select a crop"),
  growthStage: z.string().min(1, "Please select a growth stage"),
  locationState: z.string().min(1, "Please select a state/province"),
  locationCountry: z.string().min(1, "Please select a country"),
});

export interface PhotoDiagnoseInput {
  description: string;
  crop: string;
  growthStage: string;
  locationState: string;
  locationCountry: string;
}

// Helper for optional string number fields with validation
const optionalStringNumber = (
  min: number = 0,
  max?: number
): ZodOptional<ZodType<string, string>> => {
  const schema: ZodType<string, string> = z.string().refine(
    (val: string): boolean => {
      if (val === "") {
        return true;
      }
      const num = parseFloat(val);
      return !isNaN(num) && num >= min && (max === undefined || num <= max);
    },
    {
      message:
        max !== undefined
          ? `Must be a number between ${min} and ${max}`
          : `Must be a number >= ${min}`,
    }
  );
  return schema.optional();
};

export const labReportSchema = z.object({
  // Basic Info
  labName: z.string().optional(),
  testDate: z.string().optional(),
  sampleId: z.string().optional(),

  // Macronutrients - stored as strings, validated as numbers
  ph: optionalStringNumber(0, 14),
  organicMatter: optionalStringNumber(0, 100),
  nitrogen: optionalStringNumber(0),
  phosphorus: optionalStringNumber(0),
  potassium: optionalStringNumber(0),

  // Secondary Nutrients
  calcium: optionalStringNumber(0),
  magnesium: optionalStringNumber(0),
  sulfur: optionalStringNumber(0),

  // Micronutrients
  zinc: optionalStringNumber(0),
  manganese: optionalStringNumber(0),
  iron: optionalStringNumber(0),
  copper: optionalStringNumber(0),
  boron: optionalStringNumber(0),

  // Other
  cec: optionalStringNumber(0),
  baseSaturation: optionalStringNumber(0, 100),

  // Required context
  crop: z.string().min(1, "Please select a crop"),
  locationState: z.string().min(1),
  locationCountry: z.string().min(1),
});

export interface LabReportInput {
  labName?: string;
  testDate?: string;
  sampleId?: string;
  ph?: string;
  organicMatter?: string;
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  calcium?: string;
  magnesium?: string;
  sulfur?: string;
  zinc?: string;
  manganese?: string;
  iron?: string;
  copper?: string;
  boron?: string;
  cec?: string;
  baseSaturation?: string;
  crop: string;
  locationState: string;
  locationCountry: string;
}

export const hybridDiagnoseSchema = z.object({
  // Photo section (optional)
  description: z.string().max(1000).optional(),

  // Lab section - just macronutrients (all optional)
  ph: optionalStringNumber(0, 14),
  organicMatter: optionalStringNumber(0, 100),
  nitrogen: optionalStringNumber(0),
  phosphorus: optionalStringNumber(0),
  potassium: optionalStringNumber(0),

  // Shared required fields
  crop: z.string().min(1, "Please select a crop"),
  growthStage: z.string().min(1, "Please select a growth stage"),
  locationState: z.string().min(1),
  locationCountry: z.string().min(1),
});

export interface HybridDiagnoseInput {
  description?: string;
  ph?: string;
  organicMatter?: string;
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  crop: string;
  growthStage: string;
  locationState: string;
  locationCountry: string;
}
