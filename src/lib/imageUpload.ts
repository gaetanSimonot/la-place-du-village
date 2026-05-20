/**
 * IMAGE UPLOAD — validation MIME + taille + magic bytes
 *
 * Toutes les routes qui acceptent un upload base64 doivent passer par
 * `validateImageUpload(base64, mimeType)` AVANT d'écrire en Storage.
 *
 * - Whitelist MIME : jpeg, png, webp uniquement.
 * - Taille max 5 MB (configurable via second argument).
 * - Vérification des magic bytes pour éviter qu'un client envoie un PDF/ZIP/exe
 *   en prétendant que c'est une image.
 *
 * Returns either { ok: true, buffer } or { ok: false, error, status }.
 */

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number]

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export type ImageUploadResult =
  | { ok: true; buffer: Buffer; mimeType: AllowedImageMime; ext: 'jpg' | 'png' | 'webp' }
  | { ok: false; error: string; status: number }

/**
 * Magic bytes par format. On vérifie les premiers octets du buffer.
 */
function detectMime(buffer: Buffer): AllowedImageMime | null {
  if (buffer.length < 12) return null
  // JPEG : FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png'
  // WEBP : "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'image/webp'
  return null
}

function extFor(mime: AllowedImageMime): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  return 'webp'
}

/**
 * Valide un upload image (base64 + mimeType déclaré).
 * - Rejette si MIME hors whitelist.
 * - Rejette si la taille dépasse maxBytes (par défaut 5 MB).
 * - Rejette si les magic bytes ne correspondent à aucune image autorisée
 *   (le MIME déclaré ne doit pas contredire les magic bytes).
 */
export function validateImageUpload(
  base64: string | null | undefined,
  declaredMime: string | null | undefined,
  maxBytes: number = DEFAULT_MAX_BYTES,
): ImageUploadResult {
  if (!base64) {
    return { ok: false, error: 'Image manquante', status: 400 }
  }
  // Nettoie un éventuel préfixe data: URL
  const cleaned = base64.replace(/^data:[^;]+;base64,/, '')

  let buffer: Buffer
  try {
    buffer = Buffer.from(cleaned, 'base64')
  } catch {
    return { ok: false, error: 'Base64 invalide', status: 400 }
  }
  if (buffer.length === 0) {
    return { ok: false, error: 'Image vide', status: 400 }
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: `Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, status: 413 }
  }
  const detected = detectMime(buffer)
  if (!detected) {
    return { ok: false, error: 'Format non reconnu (JPEG/PNG/WebP uniquement)', status: 400 }
  }
  // Si un MIME est déclaré, il doit coïncider avec la détection.
  // (sinon on accepte ce qu'on a détecté, pour les routes qui hardcodent jpeg)
  const declaredNormalized = (declaredMime ?? '').split(';')[0].trim().toLowerCase()
  if (declaredNormalized && declaredNormalized !== detected) {
    return { ok: false, error: 'Type MIME ne correspond pas au contenu', status: 400 }
  }
  return { ok: true, buffer, mimeType: detected, ext: extFor(detected) }
}

/**
 * Variante pour FormData / File (utilisé par /share).
 */
export async function validateImageFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<ImageUploadResult> {
  if (file.size === 0) {
    return { ok: false, error: 'Fichier vide', status: 400 }
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, status: 413 }
  }
  const declared = (file.type || '').split(';')[0].trim().toLowerCase()
  if (declared && !ALLOWED_IMAGE_MIMES.includes(declared as AllowedImageMime)) {
    return { ok: false, error: 'Type MIME non autorisé', status: 400 }
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  const detected = detectMime(buffer)
  if (!detected) {
    return { ok: false, error: 'Format non reconnu (JPEG/PNG/WebP uniquement)', status: 400 }
  }
  if (declared && declared !== detected) {
    return { ok: false, error: 'Type MIME ne correspond pas au contenu', status: 400 }
  }
  return { ok: true, buffer, mimeType: detected, ext: extFor(detected) }
}
