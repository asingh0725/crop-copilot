import { z } from "zod";

export const GROWTH_STAGES = [
  "Seedling",
  "Vegetative",
  "Flowering",
  "Fruiting",
  "Mature",
  "Harvest",
];

// Helper for optional string number fields with validation
function optionalStringNumber(min = 0, max?: number) {
  let schema = z.string().refine(
    (val) => {
      if (val === "") return true;
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
}

export const photoDiagnoseSchema = z.object({
  description: z
    .string()
    .min(20, "Please provide at least 20 characters")
    .max(1000),
  crop: z.string().min(1, "Please select a crop"),
  growthStage: z.string().min(1, "Please select a growth stage"),
  locationState: z.string().min(1, "Please select a state/province"),
  locationCountry: z.string().min(1, "Please select a country"),
  fieldAcreage: optionalStringNumber(0.01),
  plannedApplicationDate: z.string().optional(),
  fieldLatitude: optionalStringNumber(-90, 90),
  fieldLongitude: optionalStringNumber(-180, 180),
});

export type PhotoDiagnoseInput = z.infer<typeof photoDiagnoseSchema>;

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
  fieldAcreage: optionalStringNumber(0.01),
  plannedApplicationDate: z.string().optional(),
  fieldLatitude: optionalStringNumber(-90, 90),
  fieldLongitude: optionalStringNumber(-180, 180),
});

export type LabReportInput = z.infer<typeof labReportSchema>;
