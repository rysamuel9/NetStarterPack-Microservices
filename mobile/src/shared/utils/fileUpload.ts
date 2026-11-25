import type * as ImagePicker from 'expo-image-picker';

export type MobileUploadPreset = 'avatar' | 'image';

const LIMITS: Record<MobileUploadPreset, { maxBytes: number; allowedMimes: string[] }> = {
  avatar: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  image: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function inferMimeType(asset: ImagePicker.ImagePickerAsset): string {
  const raw = (asset.mimeType || '').toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (MIME_TO_EXT[raw]) return raw;

  const lowerUri = (asset.fileName || asset.uri || '').toLowerCase();
  if (lowerUri.endsWith('.png')) return 'image/png';
  if (lowerUri.endsWith('.webp')) return 'image/webp';
  if (lowerUri.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export type MobileMediaValidationResult =
  | { valid: true; mimeType: string; fileName: string }
  | { valid: false; message: string };

/**
 * Validasi awal ukuran dan format gambar di mobile sebelum dikirim ke backend
 * (backend tetap melakukan validasi magic-bytes penuh via FileSignatureValidator).
 */
export function validatePickedMedia(
  asset: ImagePicker.ImagePickerAsset,
  preset: MobileUploadPreset,
  fallbackPrefix = 'upload'
): MobileMediaValidationResult {
  const cfg = LIMITS[preset];

  if (typeof asset.fileSize === 'number' && asset.fileSize > cfg.maxBytes) {
    const maxMb = Math.round(cfg.maxBytes / (1024 * 1024));
    return {
      valid: false,
      message: `Ukuran gambar melebihi batas maksimal ${maxMb} MB.`,
    };
  }

  const mimeType = inferMimeType(asset);
  if (!cfg.allowedMimes.includes(mimeType)) {
    return {
      valid: false,
      message:
        preset === 'avatar'
          ? 'Format foto profil harus JPG, PNG, atau WebP.'
          : 'Format gambar harus JPG, PNG, WebP, atau GIF.',
    };
  }

  const ext = MIME_TO_EXT[mimeType] || 'jpg';
  const fileName = asset.fileName || `${fallbackPrefix}-${Date.now()}.${ext}`;
  return { valid: true, mimeType, fileName };
}
