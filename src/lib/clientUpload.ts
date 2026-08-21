/**
 * CLIENT UPLOAD — upload direct browser -> Supabase Storage via signed URL
 *
 * Strategy : le browser demande une signed URL a notre API, puis PUT le
 * fichier directement chez Supabase. Aucun byte de l image ne transite par
 * Vercel -> economise massivement le Fast Origin Transfer.
 *
 * Pattern d usage :
 *   const file = e.target.files[0]
 *   const compressed = await compressImage(file)
 *   const { publicUrl } = await uploadViaSignedUrl({
 *     file: compressed,
 *     kind: 'event-image',
 *   })
 *   // ensuite : POST a /api/evenements avec image_url: publicUrl
 *
 * Limite : ne fonctionne que cote client (use 'window', 'fetch', etc.).
 */

import { supabase } from '@/lib/supabase'

export type UploadKind = 'event-image' | 'product-image' | 'admin-edit' | 'profile-banner' | 'profile-avatar' | 'hub-hero-intro' | 'film-affiche' | 'post-media' | 'moment-image' | 'moment-video'

interface UploadOptions {
  file: Blob | File
  kind: UploadKind
  /** Pour 'product-image' : id du product (ownership check serveur) */
  refId?: string
  /** Callback de progression d'upload (0→100). Si fourni, le PUT passe par
   *  XHR (fetch n'expose pas la progression). Utile pour les gros médias. */
  onProgress?: (pct: number) => void
}

/** PUT via XHR pour exposer la progression d'upload (fetch ne le permet pas). */
function putWithProgress(url: string, file: Blob | File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`Upload Supabase échoué (${xhr.status})`)) }
    xhr.onerror = () => reject(new Error('Upload réseau échoué'))
    xhr.send(file)
  })
}

interface UploadResult {
  publicUrl: string
  path: string
  bucket: string
}

/**
 * Demande une signed URL puis upload directement chez Supabase.
 * Throw en cas d echec (erreur reseau, 4xx, 5xx).
 */
export async function uploadViaSignedUrl({
  file, kind, refId, onProgress,
}: UploadOptions): Promise<UploadResult> {
  // 1. Demande la signed URL a notre API (auth via token user).
  // Récupère la session avec fallback refresh — évite le "Non authentifié"
  // quand le token vient juste d'expirer (auto-refresh pas encore fini).
  let token = (await supabase.auth.getSession()).data.session?.access_token ?? null
  if (!token) {
    const refreshed = await supabase.auth.refreshSession()
    token = refreshed.data.session?.access_token ?? null
  }
  if (!token) throw new Error('Non authentifié')

  let meta = await fetch('/api/storage/signed-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kind,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
      refId: refId ?? null,
    }),
  })
  // 401 → refresh + retry une fois (token expiré pile au moment du POST)
  if (meta.status === 401) {
    const refreshed = await supabase.auth.refreshSession()
    const token2 = refreshed.data.session?.access_token
    if (token2) {
      meta = await fetch('/api/storage/signed-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
        body: JSON.stringify({
          kind,
          mimeType: file.type || 'image/jpeg',
          size: file.size,
          refId: refId ?? null,
        }),
      })
    }
  }
  if (!meta.ok) {
    const d = await meta.json().catch(() => ({}))
    throw new Error(d.error ?? `Erreur signed URL (${meta.status})`)
  }
  const { uploadUrl, publicUrl, path, bucket } = await meta.json() as {
    uploadUrl: string
    publicUrl: string
    path: string
    bucket: string
  }

  // 2. PUT direct chez Supabase Storage (pas via Vercel).
  // Avec onProgress → XHR (progression) ; sinon fetch (plus simple).
  if (onProgress) {
    await putWithProgress(uploadUrl, file, onProgress)
  } else {
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    })
    if (!put.ok) {
      const txt = await put.text().catch(() => '')
      throw new Error(`Upload Supabase échoué (${put.status}) ${txt.slice(0, 100)}`)
    }
  }

  return { publicUrl, path, bucket }
}

// ─────────────────────────────────────────────────────────────────────────
// COMPRESSION CLIENT — canvas resize + jpeg/webp encode
// Reduit drastiquement la taille avant upload OU avant envoi serveur (IA).
// ─────────────────────────────────────────────────────────────────────────

interface CompressOptions {
  /** Plus grande dimension max (px). Default 1280. */
  maxDim?: number
  /** Qualite jpeg/webp 0-1. Default 0.82. */
  quality?: number
  /** Format de sortie. Default 'image/jpeg' (compatibilite + petite taille). */
  outputType?: 'image/jpeg' | 'image/webp'
}

/**
 * Compresse une image (file ou blob) en JPEG/WebP via canvas.
 * Si l image est deja plus petite que maxDim, on la garde aux dimensions
 * originales mais on la re-encode (pour appliquer la quality + virer EXIF).
 */
export async function compressImage(
  input: Blob | File,
  { maxDim = 1280, quality = 0.82, outputType = 'image/jpeg' }: CompressOptions = {},
): Promise<Blob> {
  if (typeof window === 'undefined') {
    throw new Error('compressImage : disponible cote client uniquement')
  }

  // Cree une Image depuis le blob
  const url = URL.createObjectURL(input)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Image illisible'))
      i.src = url
    })

    // Calcule les dimensions cibles
    const { naturalWidth: w, naturalHeight: h } = img
    let targetW = w
    let targetH = h
    if (w > maxDim || h > maxDim) {
      if (w >= h) { targetW = maxDim; targetH = Math.round((h / w) * maxDim) }
      else        { targetH = maxDim; targetW = Math.round((w / h) * maxDim) }
    }

    // Draw on canvas + encode
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context indisponible')
    ctx.drawImage(img, 0, 0, targetW, targetH)

    const blob: Blob | null = await new Promise(resolve => {
      canvas.toBlob(b => resolve(b), outputType, quality)
    })
    if (!blob) throw new Error('Encoding canvas a échoué')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Helper combine : compresse + upload via signed URL. Le plus courant.
 */
export async function compressAndUpload(
  file: Blob | File,
  opts: Omit<UploadOptions, 'file'> & { compress?: CompressOptions | false },
): Promise<UploadResult> {
  const { compress, ...rest } = opts
  const toUpload = compress === false ? file : await compressImage(file, compress ?? {})
  return uploadViaSignedUrl({ file: toUpload, ...rest })
}

/**
 * Convertit un base64 (sans prefix data:URL) en Blob, pour le repasser
 * a uploadViaSignedUrl. Utile quand un flow existant manipule du base64
 * mais qu on veut maintenant uploader directement chez Supabase.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64)
  const arr = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

/**
 * Variante pour les flows qui doivent encore envoyer l image en base64 au
 * serveur (ex : /api/extract qui passe l image a Claude Vision). On
 * compresse puis on convertit en base64 (sans le prefix data:URL).
 */
export async function compressToBase64(
  file: Blob | File,
  opts?: CompressOptions,
): Promise<{ base64: string; mimeType: string }> {
  const compressed = await compressImage(file, opts)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FileReader error'))
    reader.readAsDataURL(compressed)
  })
  // dataUrl = "data:image/jpeg;base64,XXXX"
  const [meta, b64] = dataUrl.split(',')
  const mimeType = (meta.match(/data:([^;]+);/)?.[1]) ?? 'image/jpeg'
  return { base64: b64 ?? '', mimeType }
}
