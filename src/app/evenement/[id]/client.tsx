'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import ImageLightbox from '@/components/ImageLightbox'
import FeedbackButton from '@/components/FeedbackButton'
import EventEditDrawer from '@/components/EventEditDrawer'
import { useAdminSession } from '@/hooks/useAdminSession'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useFavorites } from '@/hooks/useFavorites'

const LINK_STYLE = { color: '#C4622D', textDecoration: 'underline', wordBreak: 'break-all' } as const

function linkify(text: string): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/g
  const nodes: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const raw = m[0]
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    nodes.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{raw}</a>)
    last = m.index + raw.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
}

function renderContact(contact: string): React.ReactNode {
  const s = contact.trim()
  if (/^https?:\/\//i.test(s))
    return <a href={s} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{s.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
  if (/^www\.[^\s]+$/.test(s))
    return <a href={`https://${s}`} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{s}</a>
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    return <a href={`mailto:${s}`} style={LINK_STYLE}>{s}</a>
  if (/^[\d\s+\-().]{6,}$/.test(s))
    return <a href={`tel:${s.replace(/[\s\-().]/g, '')}`} style={LINK_STYLE}>{s}</a>
  return <>{linkify(s)}</>
}

function VoteButton({ evt }: { evt: Evenement }) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [voted, setVoted]           = useState(false)
  const [count, setCount]           = useState(evt.vote_count ?? 0)
  const [loading, setLoading]       = useState(false)
  const [checked, setChecked]       = useState(false)

  useEffect(() => {
    if (!user) { setChecked(true); return }
    supabase.from('votes').select('id').eq('evenement_id', evt.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setVoted(!!data); setChecked(true) })
  }, [user, evt.id])

  const toggle = async () => {
    if (!user) { openAuthModal(); return }
    if (loading) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ evenement_id: evt.id }),
    })
    const d = await res.json()
    if (res.ok) { setVoted(d.voted); setCount(d.vote_count) }
    setLoading(false)
  }

  if (!checked) return null

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 999,
        backgroundColor: voted ? '#FFF0E8' : '#F9F5F0',
        border: `1.5px solid ${voted ? '#C4622D' : '#E0D8CE'}`,
        cursor: 'pointer', transition: 'all 0.15s',
        fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
        color: voted ? '#C4622D' : '#8A8A8A',
      }}
    >
      <span style={{ fontSize: 16 }}>👍</span>
      <span>{count > 0 ? count : ''} {voted ? 'Voté !' : 'Utile'}</span>
    </button>
  )
}

function FavoriteButton({ eventId }: { eventId: string }) {
  const { isFav, toggle } = useFavorites()
  const fav = isFav(eventId)
  return (
    <button
      onClick={() => toggle(eventId)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 16px', borderRadius: 16,
        backgroundColor: fav ? '#FFF0F5' : '#fff',
        border: `1.5px solid ${fav ? '#EC407A' : '#E0D8CE'}`,
        cursor: 'pointer', transition: 'all 0.15s',
        fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
        color: fav ? '#EC407A' : '#8A8A8A',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill={fav ? '#EC407A' : 'none'} stroke={fav ? '#EC407A' : 'currentColor'} strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      {fav ? 'Sauvegardé' : 'Sauvegarder'}
    </button>
  )
}

function ShareButton({ evt }: { evt: Evenement }) {
  const [copied, setCopied] = useState(false)

  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/evenement/${evt.id}`
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const dateStr = evt.date_debut ? formatDate(evt.date_debut) : ''
  const lieu = evt.lieux as { commune?: string } | null
  const lieuStr = lieu?.commune ? ` · ${lieu.commune}` : ''
  const text = `${cat.emoji} ${evt.titre}${dateStr ? `\n📅 ${dateStr}` : ''}${lieuStr ? `\n📍${lieuStr}` : ''}`

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: evt.titre, text, url })
      } catch {}
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <button
      onClick={share}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 16px',
        backgroundColor: '#fff', border: '1.5px solid #E0D8CE',
        borderRadius: 16, cursor: 'pointer',
        fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: '#5A5A5A',
        transition: 'background-color 0.15s',
      }}
    >
      {copied
        ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Lien copié !</>
        : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Partager l&apos;événement</>
      }
    </button>
  )
}

export default function EvenementPageClient({ id }: { id: string }) {
  const [evt, setEvt]       = useState<Evenement | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const isAdmin = useAdminSession()

  useEffect(() => {
    supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
      .then(({ data }) => {
        if (data) setEvt(data as Evenement)
        setLoading(false)
      })
  }, [id])

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#C4622D', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!evt) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <p style={{ color: '#8A8A8A' }}>Événement introuvable</p>
    </div>
  )

  const cat   = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu  = evt.lieux
  const mapsUrl = lieu?.lat && lieu?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lieu.lat},${lieu.lng}`
    : lieu?.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lieu.adresse)}`
    : null

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold text-[#2C1810] flex-1 truncate text-base">{evt.titre}</h1>
        {isAdmin && (
          <button onClick={() => setEditing(true)}
            style={{ fontSize: 11, fontWeight: 700, color: '#C4622D', border: '1px solid #C4622D', borderRadius: 999, padding: '4px 12px', backgroundColor: 'transparent', cursor: 'pointer' }}>
            ✏️ Éditer
          </button>
        )}
      </div>

      {evt.image_url && <ImageLightbox src={evt.image_url} alt={evt.titre} objectPosition={evt.image_position ?? '50% 50%'} />}

      {/* Actions — sous la photo */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px 0' }}>
        <FavoriteButton eventId={evt.id} />
        <ShareButton evt={evt} />
      </div>

      <div className="p-4 space-y-3 pb-8">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full text-white"
              style={{ backgroundColor: cat.color }}>
              {cat.emoji} {cat.label}
            </span>
            <VoteButton evt={evt} />
          </div>
          <h2 className="text-2xl font-bold text-[#2C1810] leading-tight">{evt.titre}</h2>
          {evt.submitted_by_name && (
            <p className="text-xs text-gray-400 mt-1">Proposé par {evt.submitted_by_name}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 space-y-2.5">
          {evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="font-medium">{formatDate(evt.date_debut, 'long')}</span>
            </div>
          )}
          {evt.date_fin && evt.date_fin !== evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="text-gray-500">jusqu&apos;au {formatDate(evt.date_fin, 'long')}</span>
            </div>
          )}
          {evt.heure && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">🕐</span>
              <span className="font-medium">{evt.heure.slice(0, 5)}</span>
            </div>
          )}
          {lieu && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-base mt-0.5">📍</span>
              <div>
                <span className="font-medium">{lieu.nom}</span>
                {isApproxLocation(lieu) && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-500 font-semibold px-1.5 py-0.5 rounded-full">
                    localisation approximative
                  </span>
                )}
                {lieu.adresse && <p className="text-gray-500 text-xs">{lieu.adresse}</p>}
                {lieu.commune && !lieu.adresse && <p className="text-gray-500 text-xs">{lieu.commune}</p>}
              </div>
            </div>
          )}
          {evt.prix && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">💶</span>
              <span className="font-medium">{evt.prix}</span>
            </div>
          )}
        </div>

        {evt.description && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-[#2C1810] mb-2">À propos</h3>
            <p className="text-sm text-gray-600 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>{linkify(evt.description)}</p>
          </div>
        )}

        {(evt.contact || evt.organisateurs) && (
          <div className="bg-white rounded-2xl p-4 space-y-1.5">
            <h3 className="font-bold text-[#2C1810] mb-1">Contact</h3>
            {evt.organisateurs && <p className="text-sm text-gray-600">🏛️ {renderContact(evt.organisateurs)}</p>}
            {evt.contact && <p className="text-sm text-gray-600">📞 {renderContact(evt.contact)}</p>}
          </div>
        )}

        {evt.source && /^https?:\/\//i.test(evt.source) && (
          <div className="bg-white rounded-2xl p-4">
            <a href={evt.source} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium"
              style={{ color: '#C4622D', textDecoration: 'underline', wordBreak: 'break-all' }}>
              🔗 Voir la source
            </a>
          </div>
        )}

        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="block w-full bg-[#C4622D] text-white text-center py-4 rounded-2xl font-bold text-base shadow-md active:bg-[#A8521E] transition-colors">
            🗺️ Y aller
          </a>
        )}

        <FeedbackButton evenementId={evt.id} evenementTitre={evt.titre} />
      </div>

      {editing && (
        <EventEditDrawer
          evenementId={evt.id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
              .then(({ data }) => { if (data) setEvt(data as Evenement) })
          }}
        />
      )}
    </div>
  )
}
