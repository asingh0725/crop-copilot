import { z } from 'zod'

export const profileSchema = z.object({
  location: z.string().optional(),
  farmSize: z.enum(['hobby', 'small', 'medium', 'large', 'commercial']).optional(),
  cropsOfInterest: z.array(z.string()).optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional(),
})

export type ProfileInput = z.infer<typeof profileSchema>
