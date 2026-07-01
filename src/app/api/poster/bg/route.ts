import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import { BACKGROUNDS } from '@/lib/poster/palettes.js'

// Sert une vignette de fond d'ambiance par index (pour le sélecteur d'affiche).
export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', avif: 'image/avif',
}

export function GET(req: NextRequest) {
  const pool = Object.values(BACKGROUNDS as Record<string, string>)
  const raw = Number(new URL(req.url).searchParams.get('i') || '0')
  const i = ((Math.trunc(raw) % pool.length) + pool.length) % pool.length
  const p = pool[i]
  if (!p || !fs.existsSync(p)) return new NextResponse('not found', { status: 404 })
  const ext = p.split('.').pop()?.toLowerCase() || ''
  const buf = fs.readFileSync(p)
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
  })
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }) }

// Nombre de fonds dispo (pour construire le sélecteur côté client).
export function HEAD() {
  const n = Object.keys(BACKGROUNDS as Record<string, string>).length
  return new NextResponse(null, { status: 200, headers: { 'X-Bg-Count': String(n) } })
}
