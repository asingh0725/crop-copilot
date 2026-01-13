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
