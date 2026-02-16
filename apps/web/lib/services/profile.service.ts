/**
 * Profile Service
 *
 * Handles user profile operations.
 * Extracted from /api/profile route.
 */

import { prisma } from '@/lib/prisma';
import { profileSchema, ProfileInput } from '@/lib/validations/profile';

export interface GetProfileParams {
  userId: string;
}

export interface UpdateProfileParams {
  userId: string;
  email: string;
  profileData: ProfileInput;
}

export interface ProfileResult {
  userId: string;
  location: string | null;
  farmSize: string | null;
  cropsOfInterest: string[];
  experienceLevel: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get user profile
 */
export async function getProfile(params: GetProfileParams): Promise<ProfileResult | null> {
  const { userId } = params;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });

  return profile;
}

/**
 * Update or create user profile
 */
export async function updateProfile(params: UpdateProfileParams): Promise<ProfileResult> {
  const { userId, email, profileData } = params;

  // Validate profile data
  const validatedData = profileSchema.parse(profileData);

  // Ensure cropsOfInterest is an array
  const normalizedProfileData = {
    ...validatedData,
    cropsOfInterest: validatedData.cropsOfInterest || [],
  };

  // Ensure user exists in database
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: email || '',
    },
  });

  // Update or create profile
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: normalizedProfileData,
    create: {
      userId,
      ...normalizedProfileData,
    },
  });

  return profile;
}
