'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { markHubDirty } from '@/lib/hubFresh'
import { useAuth } from '@/hooks/useAuth'
import { FEATURED_SLOTS, type FeaturedSlotRow } from '@/lib/featured'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import { HUB_SECTIONS, normalizeHubOrder } from '@/lib/hubSections'

interface EnrichedSlot extends FeaturedSlotRow {
  title?: string
  imageUrl?: string | null
  detailUrl?: string
}

/** Aspect ratio du hero du hub (180h sur viewport - 32px de gutters). */
const HUB_HERO_ASPECT = 2.0

function fmtRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 'expiré'
  const h = Math.floor(ms / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}j`
}

/**
 * fetch pour les écritures de cette page. Chaque écriture change l'accueil
 * (mise en avant, ordre des sections, slide intro) alors que /api/hub est
 * caché 60s par le CDN : on pose un drapeau pour que le prochain affichage
 * de l'accueil aille chercher une copie fraîche au lieu de la périmée.
 */
async function writeJson(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.ok) markHubDirty()
  return res
}

export default function AdminHubCarousel() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()
  const [allSlots, setAllSlots] = useState<EnrichedSlot[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState(false)
  const [cropping, setCropping] = useState<EnrichedSlot | null>(null)
  // Slide intro "Bouche à oreille" en première position du carrousel hub_hero
  const [introEnabled, setIntroEnabled] = useState(false)
  const [introSaving, setIntroSaving]   = useState(false)
  // Image custom du slide intro (null = utiliser /hub-intro-slide.png par défaut)
  const [introImageUrl, setIntroImageUrl] = useState<string | null>(null)
  const [introImgUploading, setIntroImgUploading] = useState(false)
  const introImgInput = useRef<HTMLInputElement>(null)
  // Ordre des sections de contenu de l'accueil
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => normalizeHubOrder([]))
  const [hiddenSections, setHiddenSections] = useState<string[]>([])
  const [orderSaving, setOrderSaving] = useState(false)

  // Charge la config slide intro (toggle + image custom)
  useEffect(() => {
    if (authLoading || !user || !isAdmin) return
    Promise.all([
      supabase.from('config').select('value').eq('key', 'hub_hero_intro_enabled').maybeSingle(),
      supabase.from('config').select('value').eq('key', 'hub_hero_intro_image_url').maybeSingle(),
      supabase.from('config').select('value').eq('key', 'hub_section_order').maybeSingle(),
      supabase.from('config').select('value').eq('key', 'hub_section_hidden').maybeSingle(),
    ]).then(([toggleRes, imgRes, orderRes, hiddenRes]) => {
      setIntroEnabled(toggleRes.data?.value === 'true')
      setIntroImageUrl(imgRes.data?.value || null)
      let parsed: unknown = []
      try { parsed = JSON.parse(orderRes.data?.value ?? '[]') } catch {}
      setSectionOrder(normalizeHubOrder(parsed))
      try {
        const h = JSON.parse(hiddenRes.data?.value ?? '[]')
        setHiddenSections(Array.isArray(h) ? h.filter((x: unknown): x is string => typeof x === 'string') : [])
      } catch { setHiddenSections([]) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin])

  async function toggleIntro(next: boolean) {
    if (introSaving) return
    const prev = introEnabled
    setIntroEnabled(next)
    setIntroSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setIntroEnabled(prev); setIntroSaving(false); return }
    const res = await writeJson('/api/admin/config', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key: 'hub_hero_intro_enabled', value: next ? 'true' : 'false' }),
    })
    if (!res.ok) setIntroEnabled(prev)
    setIntroSaving(false)
  }

  async function handleIntroImagePick(file: File) {
    if (introImgUploading) return
    setIntroImgUploading(true)
    try {
      // Carrousel : ratio ~2:1 (180h x 360w typique), maxDim 1200, qualité 0.9
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.9 })
      const r = await uploadViaSignedUrl({ file: compressed, kind: 'hub-hero-intro' })
      const newUrl = `${r.publicUrl}?v=${Date.now()}`

      // Sauvegarde l'URL dans config
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setIntroImgUploading(false); return }
      const res = await writeJson('/api/admin/config', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ key: 'hub_hero_intro_image_url', value: newUrl }),
      })
      if (res.ok) setIntroImageUrl(newUrl)
    } catch (e) {
      console.error('[intro image upload]', e)
    } finally {
      setIntroImgUploading(false)
    }
  }

  async function resetIntroImage() {
    if (introImgUploading) return
    if (!confirm('Restaurer l\'image par défaut du slide intro ?')) return
    setIntroImgUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setIntroImgUploading(false); return }
    // Vide la config → HubView retombera sur /hub-intro-slide.png
    await writeJson('/api/admin/config', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key: 'hub_hero_intro_image_url', value: '' }),
    })
    setIntroImageUrl(null)
    setIntroImgUploading(false)
  }

  async function moveSection(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= sectionOrder.length || orderSaving) return
    const prev = sectionOrder
    const next = [...sectionOrder]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSectionOrder(next)
    setOrderSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSectionOrder(prev); setOrderSaving(false); return }
    const res = await writeJson('/api/admin/config', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key: 'hub_section_order', value: JSON.stringify(next) }),
    })
    if (!res.ok) setSectionOrder(prev)
    setOrderSaving(false)
  }

  async function toggleHide(id: string) {
    if (orderSaving) return
    const prev = hiddenSections
    const next = hiddenSections.includes(id) ? hiddenSections.filter(x => x !== id) : [...hiddenSections, id]
    setHiddenSections(next)
    setOrderSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setHiddenSections(prev); setOrderSaving(false); return }
    const res = await writeJson('/api/admin/config', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key: 'hub_section_hidden', value: JSON.stringify(next) }),
    })
    if (!res.ok) setHiddenSections(prev)
    setOrderSaving(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) {
      router.replace('/')
      return
    }
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin, showExpired])

  async function reload() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/featured-slots?all=${showExpired ? '1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setLoading(false)
      return
    }
    const { slots } = await res.json()
    const enriched = await enrich(slots as FeaturedSlotRow[])
    setAllSlots(enriched)
    setLoading(false)
  }

  async function enrich(slots: FeaturedSlotRow[]): Promise<EnrichedSlot[]> {
    if (!slots.length) return []

    const byType: Record<string, string[]> = {}
    slots.forEach(s => {
      byType[s.content_type] ??= []
      byType[s.content_type].push(s.content_id)
    })

    const titleMap: Record<string, { title: string; imageUrl: string | null; detailUrl: string }> = {}

    if (byType.evenement) {
      const { data } = await supabase
        .from('evenements')
        .select('id, titre, image_url')
        .in('id', byType.evenement)
      ;(data ?? []).forEach(d => { titleMap[`evenement:${d.id}`] = { title: d.titre, imageUrl: d.image_url, detailUrl: `/evenement/${d.id}` } })
    }
    if (byType.etablissement) {
      const { data } = await supabase
        .from('etablissements')
        .select('id, nom, photos')
        .in('id', byType.etablissement)
      ;(data ?? []).forEach(d => { titleMap[`etablissement:${d.id}`] = { title: d.nom, imageUrl: d.photos?.[0] ?? null, detailUrl: `/etablissement/${d.id}` } })
    }
    if (byType.producteur) {
      const { data } = await supabase
        .from('producers')
        .select('id, nom, photos')
        .in('id', byType.producteur)
      ;(data ?? []).forEach(d => { titleMap[`producteur:${d.id}`] = { title: d.nom, imageUrl: d.photos?.[0] ?? null, detailUrl: `/producteur/${d.id}` } })
    }
    if (byType.annonce) {
      const { data } = await supabase
        .from('annonces')
        .select('id, titre, photos')
        .in('id', byType.annonce)
      ;(data ?? []).forEach(d => { titleMap[`annonce:${d.id}`] = { title: d.titre, imageUrl: d.photos?.[0] ?? null, detailUrl: `/annonces/${d.id}` } })
    }
    if (byType.promotion) {
      const { data } = await supabase
        .from('promotions')
        .select('id, title, image_url')
        .in('id', byType.promotion)
      ;(data ?? []).forEach(d => { titleMap[`promotion:${d.id}`] = { title: d.title, imageUrl: d.image_url, detailUrl: `/promotions?id=${d.id}` } })
    }
    if (byType.forum_topic) {
      const { data } = await supabase
        .from('forum_topics')
        .select('id, titre, media')
        .in('id', byType.forum_topic)
      ;(data ?? []).forEach(d => {
        const media = d.media as Array<{ t?: string; url?: string }> | null
        const photo = Array.isArray(media) ? (media.find(m => m?.t === 'photo')?.url ?? null) : null
        titleMap[`forum_topic:${d.id}`] = { title: d.titre, imageUrl: photo, detailUrl: `/forum/${d.id}` }
      })
    }

    return slots.map(s => ({
      ...s,
      title:     titleMap[`${s.content_type}:${s.content_id}`]?.title ?? '(contenu introuvable)',
      imageUrl:  titleMap[`${s.content_type}:${s.content_id}`]?.imageUrl ?? null,
      detailUrl: titleMap[`${s.content_type}:${s.content_id}`]?.detailUrl,
    }))
  }

  async function patchSlot(id: string, patch: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await writeJson('/api/featured-slots', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, ...patch }),
    })
    if (res.ok) reload()
  }

  async function deleteSlot(id: string) {
    if (!confirm('Supprimer ce slot ?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await writeJson(`/api/featured-slots?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) reload()
  }

  function bumpPriority(slot: EnrichedSlot, delta: number) {
    patchSlot(slot.id, { priority: slot.priority + delta })
  }

  function extendDuration(slot: EnrichedSlot, hours: number) {
    const newEnd = new Date(new Date(slot.ends_at).getTime() + hours * 3600 * 1000).toISOString()
    patchSlot(slot.id, { ends_at: newEnd })
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'var(--font-body), sans-serif', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #E5DDD2',
        backgroundColor: 'rgba(242,235,224,0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A1209', letterSpacing: '-0.02em' }}>
              Hub carousel
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
              Gestion éditoriale de la mise en avant
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7A6A5A', cursor: 'pointer' }}>
            <input type="checkbox" checked={showExpired} onChange={e => setShowExpired(e.target.checked)} />
            Voir expirés
          </label>
        </div>
      </div>

      {error && <p style={{ padding: 16, color: '#C0392B', fontSize: 13, textAlign: 'center' }}>{error}</p>}

      {/* Toggle slide intro "Bouche à oreille" + image custom */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: introEnabled ? '#E8F2EB' : '#FFFFFF',
          border: `1px solid ${introEnabled ? '#C8DEC0' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: introSaving ? 'default' : 'pointer',
          }}>
            <input
              type="checkbox"
              checked={introEnabled}
              disabled={introSaving}
              onChange={e => toggleIntro(e.target.checked)}
              style={{ accentColor: '#2D5A3D', cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
                Slide intro « Bouche à oreille »
              </div>
              <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                Affiche en première position du carrousel. Click = ouvre la modale
                « C&apos;est quoi La Place du Village ? ».
              </div>
            </div>
          </label>

          {/* Preview + upload image custom */}
          {introEnabled && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #C8DEC0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5B8A4A', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Image du slide
              </div>
              <div style={{
                position: 'relative',
                width: '100%', height: 160, borderRadius: 12, overflow: 'hidden',
                background: '#FBF3E6', border: '1px solid #E5DDD2',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={introImageUrl || '/hub-intro-slide.webp'}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span style={{
                  position: 'absolute', top: 8, left: 8,
                  background: '#FFFFFF', color: '#7A6A5A',
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 7px', borderRadius: 999,
                  border: '1px solid #E5DDD2',
                }}>
                  {introImageUrl ? 'Personnalisée' : 'Par défaut'}
                </span>
              </div>

              <input
                ref={introImgInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleIntroImagePick(f)
                  e.target.value = ''
                }}
              />

              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => introImgInput.current?.click()}
                  disabled={introImgUploading}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 8,
                    background: '#2D5A3D', color: '#FFFFFF',
                    border: 'none', fontSize: 12, fontWeight: 800,
                    cursor: introImgUploading ? 'default' : 'pointer',
                    opacity: introImgUploading ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {introImgUploading ? 'Upload…' : 'Changer l\'image'}
                </button>
                {introImageUrl && (
                  <button
                    type="button"
                    onClick={resetIntroImage}
                    disabled={introImgUploading}
                    style={{
                      padding: '9px 12px', borderRadius: 8,
                      background: '#FFFFFF', color: '#7A6A5A',
                      border: '1px solid #E5DDD2', fontSize: 12, fontWeight: 700,
                      cursor: introImgUploading ? 'default' : 'pointer',
                      opacity: introImgUploading ? 0.6 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    Restaurer défaut
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ordre des sections de contenu de l'accueil */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: '1px solid #E5DDD2', boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
            Ordre des sections de l&apos;accueil
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 10 }}>
            Réorganise les blocs de contenu de la page d&apos;accueil. Hero, tuiles et footer restent fixes. Une section sans contenu n&apos;apparaît pas mais garde sa place dans l&apos;ordre.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sectionOrder.map((id, i) => {
              const label = HUB_SECTIONS.find(s => s.id === id)?.label ?? id
              const isFirst = i === 0
              const isLast = i === sectionOrder.length - 1
              const isHidden = hiddenSections.includes(id)
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  background: isHidden ? '#F4EFE7' : '#FDFAF6',
                  border: '1px solid #E5DDD2', opacity: isHidden ? 0.62 : 1,
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: '#F0EAE0', color: '#7A6A5A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900, flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1A1209', textDecoration: isHidden ? 'line-through' : 'none' }}>{label}</span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleHide(id)} disabled={orderSaving}
                      title={isHidden ? 'Afficher' : 'Masquer'}
                      style={{ ...btnStyle(orderSaving), color: isHidden ? '#B53A22' : '#2D5A3D', width: 30 }}
                    >
                      {isHidden
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10 10 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                    </button>
                    <button onClick={() => moveSection(i, -1)} disabled={isFirst || orderSaving} style={btnStyle(isFirst || orderSaving)}>▲</button>
                    <button onClick={() => moveSection(i, +1)} disabled={isLast || orderSaving} style={btnStyle(isLast || orderSaving)}>▼</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 12px' }}>
        {FEATURED_SLOTS.map(slot => {
          const items = allSlots.filter(s => s.slot === slot.id)

          // Slot 'homepage' : sous-grouper par content_type (events / promos /
          // annonces). Sinon liste plate comme avant.
          const isHomepage = slot.id === 'homepage'
          const homepageGroups = isHomepage ? [
            { type: 'evenement' as const, label: 'Events',     emoji: '📅' },
            { type: 'promotion' as const, label: 'Promotions', emoji: '🏷️' },
            { type: 'annonce'   as const, label: 'Annonces',   emoji: '📰' },
          ] : []

          return (
            <section key={slot.id} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, padding: '0 4px' }}>
                <span style={{ fontSize: 18 }}>{slot.emoji}</span>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A1209' }}>{slot.label}</h2>
                <span style={{ fontSize: 11, color: '#8A7A6A' }}>· {items.length} item{items.length > 1 ? 's' : ''}</span>
              </div>

              {isHomepage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {homepageGroups.map(g => {
                    const groupItems = items.filter(s => s.content_type === g.type)

                    // EVENTS : 3 positions fixes (pas une liste). L'admin
                    // assigne les positions depuis la fiche event.
                    if (g.type === 'evenement') {
                      const byPos = new Map<number, EnrichedSlot>()
                      for (const it of groupItems) {
                        if (typeof it.position === 'number') byPos.set(it.position, it)
                      }
                      return (
                        <div key={g.type}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 6px' }}>
                            <span style={{ fontSize: 13 }}>{g.emoji}</span>
                            <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {g.label}
                            </h3>
                            <span style={{ fontSize: 10, color: '#A89B8C' }}>· 3 positions · expire à minuit</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[1, 2, 3].map(pos => {
                              const taken = byPos.get(pos) ?? null
                              return (
                                <PositionCell
                                  key={pos}
                                  position={pos}
                                  slot={taken}
                                  onDelete={taken ? () => deleteSlot(taken.id) : undefined}
                                  onEditCrop={taken ? () => setCropping(taken) : undefined}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    }

                    // PROMOS / ANNONCES : liste classique
                    return (
                      <div key={g.type}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 6px' }}>
                          <span style={{ fontSize: 13 }}>{g.emoji}</span>
                          <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            {g.label}
                          </h3>
                          <span style={{ fontSize: 10, color: '#A89B8C' }}>· {groupItems.length}</span>
                        </div>
                        {groupItems.length === 0 ? (
                          <p style={{ padding: '10px 14px', backgroundColor: '#FDFAF6', borderRadius: 10, fontSize: 11.5, color: '#8A7A6A', fontStyle: 'italic', textAlign: 'center', margin: 0 }}>
                            Aucune {g.label.toLowerCase().slice(0, -1)} featured.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {groupItems.map((s, idx) => (
                              <SlotCard
                                key={s.id}
                                slot={s}
                                isFirst={idx === 0}
                                isLast={idx === groupItems.length - 1}
                                onUp={() => bumpPriority(s, +1)}
                                onDown={() => bumpPriority(s, -1)}
                                onExtend={h => extendDuration(s, h)}
                                onDelete={() => deleteSlot(s.id)}
                                onEditCrop={() => setCropping(s)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : items.length === 0 ? (
                <p style={{ padding: '14px 16px', backgroundColor: '#FDFAF6', borderRadius: 12, fontSize: 12, color: '#8A7A6A', fontStyle: 'italic', textAlign: 'center' }}>
                  Aucun contenu featured. Le hub utilise le fallback automatique.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((s, idx) => (
                    <SlotCard
                      key={s.id}
                      slot={s}
                      isFirst={idx === 0}
                      isLast={idx === items.length - 1}
                      onUp={() => bumpPriority(s, +1)}
                      onDown={() => bumpPriority(s, -1)}
                      onExtend={h => extendDuration(s, h)}
                      onDelete={() => deleteSlot(s.id)}
                      onEditCrop={() => setCropping(s)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {cropping && cropping.imageUrl && (
        <CropOverlay
          src={cropping.imageUrl}
          position={cropping.image_position ?? '50% 50%'}
          aspect={HUB_HERO_ASPECT}
          onCancel={() => setCropping(null)}
          onSave={async pos => {
            await patchSlot(cropping.id, { image_position: pos })
            setCropping(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Cellule fixe pour une position (1/2/3) du carrousel "Aujourd'hui".
 * Affiche soit l'event choisi par l'admin, soit un placeholder "vide →
 * fallback auto event du jour". Pas de bouton "Choisir" — l'admin assigne
 * une position depuis la fiche event (via FeatureModal).
 */
function PositionCell({
  position, slot, onDelete, onEditCrop,
}: {
  position: number
  slot: EnrichedSlot | null
  onDelete?: () => void
  onEditCrop?: () => void
}) {
  const label = position === 1 ? 'Grosse tuile' : position === 2 ? 'Mini gauche' : 'Mini droite'
  if (!slot) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 12,
        border: '1.5px dashed #D7CFC0', backgroundColor: '#FDFAF6',
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9,
          backgroundColor: '#F0EAE0', color: '#7A6A5A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 900, flexShrink: 0,
        }}>{position}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A6A5A' }}>Position {position} · {label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#A89B8C', fontStyle: 'italic' }}>
            Vide — sera comblée par un event du jour
          </p>
        </div>
      </div>
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 12,
      border: '1.5px solid #2D5A3D', backgroundColor: '#FFF',
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 9,
        backgroundColor: '#E8F2EB', color: '#2D5A3D',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 900, flexShrink: 0,
      }}>{position}</span>
      {slot.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.imageUrl} alt="" style={{
          width: 40, height: 40, borderRadius: 8, objectFit: 'cover',
          objectPosition: slot.image_position ?? '50% 50%', flexShrink: 0,
        }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Position {position} · {label}
        </p>
        {slot.detailUrl ? (
          <Link href={slot.detailUrl} style={{
            display: 'block', margin: '2px 0 0', fontSize: 12.5, fontWeight: 700,
            color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', textDecoration: 'none',
          }}>{slot.title}</Link>
        ) : (
          <p style={{ margin: '2px 0 0', fontSize: 12.5, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.title}</p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {onEditCrop && slot.imageUrl && (
          <button onClick={onEditCrop} aria-label="Cadrage" style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid #E5DDD2',
            background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A1209" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} aria-label="Retirer" style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid #F0D4C8',
            background: '#FDF4F0', color: '#B53A22', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function SlotCard({
  slot, isFirst, isLast,
  onUp, onDown, onExtend, onDelete, onEditCrop,
}: {
  slot: EnrichedSlot
  isFirst: boolean
  isLast:  boolean
  onUp:     () => void
  onDown:   () => void
  onExtend: (hours: number) => void
  onDelete: () => void
  onEditCrop: () => void
}) {
  const expired = new Date(slot.ends_at) <= new Date()
  const hasImg = !!slot.imageUrl
  const cropped = !!slot.image_position
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14,
      backgroundColor: '#fff',
      border: expired ? '1.5px solid #E5DDD2' : '1px solid #E5DDD2',
      opacity: expired ? 0.6 : 1,
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <button
        type="button"
        onClick={hasImg ? onEditCrop : undefined}
        disabled={!hasImg}
        title={hasImg ? 'Cliquer pour cadrer dans le hub' : 'Pas d\'image'}
        style={{
          position: 'relative',
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          border: 'none', padding: 0,
          backgroundColor: '#F0EBE3',
          backgroundImage: slot.imageUrl ? `url(${slot.imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: slot.image_position ?? 'center',
          cursor: hasImg ? 'pointer' : 'default',
        }}
      >
        {hasImg && (
          <span style={{
            position: 'absolute', right: -4, bottom: -4,
            width: 18, height: 18, borderRadius: '50%',
            backgroundColor: cropped ? '#2D5A3D' : '#fff',
            border: '1.5px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: cropped ? '#fff' : '#2D5A3D',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
              <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
          </span>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={slot.detailUrl ?? '#'}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slot.title ?? '(contenu)'}
          </p>
        </Link>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#8A7A6A' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{slot.content_type}</span>
          {' · '}
          <span style={{ color: slot.source === 'admin' ? '#2D5A3D' : slot.source === 'boost_purchase' ? '#E8622A' : '#3A5BC7' }}>
            {slot.source === 'admin' ? 'éditorial' : slot.source === 'boost_purchase' ? 'boost payant' : slot.source === 'pro_credit' ? 'crédit pro' : slot.source}
          </span>
          {' · '}
          priority {slot.priority}
          {' · '}
          {expired ? 'expiré' : `expire dans ${fmtRemaining(slot.ends_at)}`}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onUp}   disabled={isFirst} style={btnStyle(isFirst)}>▲</button>
        <button onClick={onDown} disabled={isLast}  style={btnStyle(isLast)}>▼</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={() => onExtend(24)}  style={btnStyle(false)} title="+1 jour">+1j</button>
        <button onClick={onDelete} style={{ ...btnStyle(false), color: '#C0392B' }}>✕</button>
      </div>
    </div>
  )
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 26, borderRadius: 7,
    border: '1px solid #E5DDD2', backgroundColor: '#FDFAF6',
    color: '#2D5A3D', fontSize: 11, fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontFamily: 'var(--font-body), sans-serif',
  }
}

/**
 * Modale plein écran : cadrage d'une image (object-position) avec preview
 * à l'aspect du hero du hub. Le user clique/drag pour repositionner le crop.
 * Pattern inspiré de EventEditDrawer.CropStep, adapté à un aspect arbitraire.
 */
function CropOverlay({
  src, position, aspect, onCancel, onSave,
}: {
  src: string
  position: string
  aspect: number
  onCancel: () => void
  onSave: (position: string) => void | Promise<void>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [pos, setPos] = useState(position || '50% 50%')
  const [saving, setSaving] = useState(false)

  const [px, py] = pos.split(' ').map(v => parseFloat(v) || 0)

  function computeLayout(cW: number, cH: number, nW: number, nH: number) {
    // Image fittée en object-contain dans le container (rW × rH)
    const ir = nW / nH, cr = cW / cH
    let rW: number, rH: number, oX: number, oY: number
    if (ir > cr) { rW = cW; rH = cW / ir; oX = 0; oY = (cH - rH) / 2 }
    else         { rH = cH; rW = cH * ir; oX = (cW - rW) / 2; oY = 0 }
    // Crop window dans l'image : représente la zone visible après object-cover
    // dans un rectangle d'aspect ratio `aspect`. On limite par la dimension la plus courte.
    let cropW: number, cropH: number
    if (rW / rH > aspect) {
      // Image plus large que target : crop hauteur entière, largeur réduite
      cropH = rH
      cropW = rH * aspect
    } else {
      cropW = rW
      cropH = rW / aspect
    }
    return { rW, rH, oX, oY, cropW, cropH }
  }

  const layout = (() => {
    const c = containerRef.current
    if (!c || !natural) return null
    const { width: cW, height: cH } = c.getBoundingClientRect()
    const l = computeLayout(cW, cH, natural.w, natural.h)
    return {
      ...l,
      cropLeft: l.oX + (l.rW - l.cropW) * px / 100,
      cropTop:  l.oY + (l.rH - l.cropH) * py / 100,
    }
  })()

  const handlePointer = (e: React.PointerEvent) => {
    const c = containerRef.current
    if (!c || !natural) return
    const rect = c.getBoundingClientRect()
    const l = computeLayout(rect.width, rect.height, natural.w, natural.h)
    const rX = Math.max(0, Math.min(1, (e.clientX - rect.left - l.oX) / l.rW))
    const rY = Math.max(0, Math.min(1, (e.clientY - rect.top  - l.oY) / l.rH))
    setPos(`${Math.round(rX * 100)}% ${Math.round(rY * 100)}%`)
  }

  const D = 'rgba(0,0,0,0.62)'

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try { await onSave(pos) } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      backgroundColor: '#000',
      display: 'flex', flexDirection: 'column',
      userSelect: 'none',
      fontFamily: 'var(--font-body), sans-serif',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: '#B0B0B0',
          fontSize: 13, cursor: 'pointer', padding: '6px 4px',
        }}>← Annuler</button>
        <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>Cadrer pour le hub</p>
        <button onClick={handleSave} disabled={saving} style={{
          backgroundColor: '#2D5A3D', color: '#fff',
          padding: '8px 14px', borderRadius: 10,
          border: 'none', fontSize: 13, fontWeight: 800,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? '…' : 'Enregistrer'}</button>
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'relative', flex: 1, overflow: 'hidden',
          touchAction: 'none', cursor: 'crosshair',
        }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={e => { if (e.buttons > 0) handlePointer(e) }}
      >
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
          onLoad={e => { const i = e.currentTarget; setNatural({ w: i.naturalWidth, h: i.naturalHeight }) }}
        />
        {layout && (
          <div style={{ position: 'absolute', top: layout.oY, left: layout.oX, width: layout.rW, height: layout.rH, pointerEvents: 'none' }}>
            {/* Masques sombres */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: layout.cropLeft - layout.oX, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: layout.rW - (layout.cropLeft - layout.oX) - layout.cropW, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.cropTop - layout.oY, backgroundColor: D }} />
            <div style={{ position: 'absolute', bottom: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.rH - (layout.cropTop - layout.oY) - layout.cropH, backgroundColor: D }} />
            {/* Crop window */}
            <div style={{
              position: 'absolute',
              top: layout.cropTop - layout.oY,
              left: layout.cropLeft - layout.oX,
              width: layout.cropW,
              height: layout.cropH,
              border: '2px solid #fff',
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            }} />
          </div>
        )}
      </div>

      <p style={{
        margin: 0, padding: '10px 16px 16px',
        color: '#B0B0B0', fontSize: 12, textAlign: 'center', flexShrink: 0,
      }}>
        Touche / clique pour repositionner le cadrage. Aspect : carousel hub (≈2:1).
      </p>
    </div>
  )
}
