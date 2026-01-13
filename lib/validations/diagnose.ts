import { z } from 'zod'

export const GROWTH_STAGES = [
  'Seedling',
  'Vegetative',
  'Flowering',
  'Fruiting',
  'Mature',
  'Harvest',
] as const

export const photoDiagnoseSchema = z.object({
  description: z.string().min(20, 'Please provide at least 20 characters').max(1000),
  crop: z.string().min(1, 'Please select a crop'),
  growthStage: z.string().min(1, 'Please select a growth stage'),
  locationState: z.string().min(1, 'Please select a state/province'),
  locationCountry: z.string().min(1, 'Please select a country'),
})

export type PhotoDiagnoseInput = z.infer<typeof photoDiagnoseSchema>

export const labReportSchema = z.object({
  // Basic Info
  labName: z.string().optional(),
  testDate: z.string().optional(),
  sampleId: z.string().optional(),

  // Macronutrients
  ph: z.number().min(0).max(14).optional(),
  organicMatter: z.number().min(0).max(100).optional(),
  nitrogen: z.number().min(0).optional(),
  phosphorus: z.number().min(0).optional(),
  potassium: z.number().min(0).optional(),

  // Secondary Nutrients
  calcium: z.number().min(0).optional(),
  magnesium: z.number().min(0).optional(),
  sulfur: z.number().min(0).optional(),

  // Micronutrients
  zinc: z.number().min(0).optional(),
  manganese: z.number().min(0).optional(),
  iron: z.number().min(0).optional(),
  copper: z.number().min(0).optional(),
  boron: z.number().min(0).optional(),

  // Other
  cec: z.number().min(0).optional(),
  baseSaturation: z.number().min(0).max(100).optional(),

  // Required context
  crop: z.string().min(1, 'Please select a crop'),
  locationState: z.string().min(1),
  locationCountry: z.string().min(1),
})

export type LabReportInput = z.infer<typeof labReportSchema>

export const hybridDiagnoseSchema = z.object({
  // Photo section (optional)
  description: z.string().max(1000).optional(),

  // Lab section - just macronutrients (all optional)
  ph: z.number().min(0).max(14).optional(),
  organicMatter: z.number().min(0).max(100).optional(),
  nitrogen: z.number().min(0).optional(),
  phosphorus: z.number().min(0).optional(),
  potassium: z.number().min(0).optional(),

  // Shared required fields
  crop: z.string().min(1, 'Please select a crop'),
  growthStage: z.string().min(1, 'Please select a growth stage'),
  locationState: z.string().min(1),
  locationCountry: z.string().min(1),
})

export type HybridDiagnoseInput = z.infer<typeof hybridDiagnoseSchema>
