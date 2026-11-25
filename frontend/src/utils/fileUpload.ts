export type UploadPreset = 'avatar' | 'image' | 'attachment';

const PRESET_CONFIG: Record<UploadPreset, { maxBytes: number; allowedExtensions: string[] }> = {
  avatar: {
    maxBytes: 5 * 1024 * 1024,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  image: {
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  },
  attachment: {
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip',
    ],
  },
};

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
}

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function looksLikeExecutable(bytes: Uint8Array): boolean {
  return (
    startsWithBytes(bytes, [0x4d, 0x5a]) || // Windows PE / EXE ("MZ")
    startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46]) // Linux ELF
  );
}

async function matchesMagicBytes(file: File, ext: string): Promise<string | null> {
  const headerBuf = await file.slice(0, 64).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);

  if (looksLikeExecutable(bytes)) {
    return 'File terdeteksi sebagai program/executable dan ditolak demi keamanan.';
  }

  switch (ext) {
    case '.png':
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ? null
        : 'Isi file bukan gambar PNG yang valid.';
    case '.jpg':
    case '.jpeg':
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
        ? null
        : 'Isi file bukan gambar JPG/JPEG yang valid.';
    case '.gif':
      return startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
        ? null
        : 'Isi file bukan gambar GIF yang valid.';
    case '.webp':
      return startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
        ? null
        : 'Isi file bukan gambar WebP yang valid.';
    case '.pdf':
      return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
        ? null
        : 'Isi file bukan dokumen PDF yang valid.';
    case '.zip':
    case '.docx':
    case '.xlsx':
    case '.pptx':
      return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])
        ? null
        : `Isi file tidak cocok dengan format ${ext}.`;
    case '.doc':
    case '.xls':
    case '.ppt':
      return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        ? null
        : `Isi file tidak cocok dengan format ${ext}.`;
    case '.svg': {
      const text = (await file.text()).toLowerCase();
      if (!text.includes('<svg')) return 'File .svg tidak memiliki elemen <svg> yang valid.';
      const forbidden = ['<script', 'javascript:', 'onload=', 'onerror=', 'onclick=', '<iframe', '<object', '<embed'];
      if (forbidden.some((pat) => text.includes(pat))) {
        return 'File SVG ditolak karena mengandung elemen skrip berbahaya (anti-XSS).';
      }
      return null;
    }
    case '.txt':
    case '.csv':
      return bytes.includes(0x00) ? 'File teks (.txt/.csv) tidak boleh berisi data biner.' : null;
    default:
      return null;
  }
}

/**
 * Validasi file sisi client sebelum dikirim ke server:
 * cek ukuran, ekstensi yang diizinkan, serta magic-bytes isi file aslinya.
 * Mengembalikan pesan error string jika tidak valid, atau null jika aman diunggah.
 */
export async function validateFileForUpload(file: File, preset: UploadPreset): Promise<string | null> {
  const cfg = PRESET_CONFIG[preset];

  if (file.size <= 0) {
    return 'File tidak boleh kosong.';
  }

  if (file.size > cfg.maxBytes) {
    const maxMb = Math.round(cfg.maxBytes / (1024 * 1024));
    return `Ukuran file "${file.name}" melebihi batas maksimal ${maxMb} MB.`;
  }

  const ext = getExtension(file.name);
  if (!ext || !cfg.allowedExtensions.includes(ext)) {
    return `Format file "${file.name}" tidak diizinkan. Gunakan: ${cfg.allowedExtensions.join(', ')}.`;
  }

  return await matchesMagicBytes(file, ext);
}
