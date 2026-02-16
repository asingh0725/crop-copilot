/**
 * Upload Service
 *
 * Handles file uploads to Supabase Storage.
 * Extracted from /api/upload route.
 */

import { createClient as createServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UploadImageParams {
  userId: string;
  file: File;
  supabaseClient?: SupabaseClient;
}

export interface UploadImageResult {
  url: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Upload an image file to Supabase Storage
 */
export async function uploadImage(
  params: UploadImageParams
): Promise<UploadImageResult> {
  const { userId, file, supabaseClient } = params;

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Invalid file type. Allowed: JPEG, PNG, WebP');
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large. Maximum 10MB');
  }

  // Use provided client or create a new server client
  const supabase = supabaseClient || (await createServerClient());

  // Generate unique filename
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}-${sanitizedName}`;

  // Upload to Supabase Storage
  const { data, error: uploadError } = await supabase.storage
    .from('field-images')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    throw new Error('Upload failed');
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from('field-images').getPublicUrl(data.path);

  return { url: publicUrl };
}

/**
 * Delete an image from Supabase Storage
 */
export async function deleteImage(
  params: { userId: string; filePath: string; supabaseClient?: SupabaseClient }
): Promise<void> {
  const { userId, filePath, supabaseClient } = params;

  // Ensure the file belongs to the user
  if (!filePath.startsWith(`${userId}/`)) {
    throw new Error('Unauthorized: Cannot delete files that do not belong to user');
  }

  // Use provided client or create a new server client
  const supabase = supabaseClient || (await createServerClient());

  const { error } = await supabase.storage.from('field-images').remove([filePath]);

  if (error) {
    console.error('Delete error:', error);
    throw new Error('Failed to delete file');
  }
}
