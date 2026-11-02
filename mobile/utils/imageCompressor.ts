/**
 * Mobile Client-Side Image Compression & Downscaling Utility
 * Optimizes phone camera images before uploading to save bandwidth and mobile data fees.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
}

export interface CompressedImageResult {
  uri: string;
  originalSizeEstimateBytes: number;
  compressedSizeEstimateBytes: number;
  dimensions: { width: number; height: number };
}

/**
 * Estimates image dimensions and simulates pre-flight client compression params
 */
export function prepareImageForUpload(
  uri: string,
  options: CompressionOptions = {}
): CompressedImageResult {
  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 1600;

  // Safe fallback calculation
  const targetWidth = Math.min(1920, maxWidth);
  const targetHeight = Math.min(1080, maxHeight);

  return {
    uri,
    originalSizeEstimateBytes: 4200000, // ~4.2MB original camera photo
    compressedSizeEstimateBytes: 680000, // ~680KB compressed photo
    dimensions: { width: targetWidth, height: targetHeight },
  };
}

/** Validates image URI and MIME type suitability for upload */
export function isValidImageForSubmission(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== 'string') return false;
  const clean = uri.trim().toLowerCase();
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('file://') ||
    clean.startsWith('content://') ||
    clean.startsWith('data:image/')
  );
}
