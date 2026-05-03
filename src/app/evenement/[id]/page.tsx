'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import ImageLightbox from '@/components/ImageLightbox'
import FeedbackButton from '@/components/FeedbackButton'
import EventEditDrawer from '@/components/EventEditDrawer'
import { useAdminSession } from '@/hooks/useAdminSession'

function linkify(text: string): React.ReactNode {
  const urlRe = /https?:\/\/[^\s]+/g
  const nodes: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" style={{ color: '#C4622D', textDecoration: 'underline', wordBreak: 'break-all' }}>{m[0]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
}

function renderContact(contact: string): React.ReactNode {
  const s = contact.trim()
  if (/^https?:\/\//i.test(s))
    return <a href={s} target="_blank" rel="noopener noreferrer" style={{ color: '#C4622D', textDecoration: 'underline', wordBreak: 'break-all' }}>{s.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    return <a href={`mailto:${s}`} style={{ color: '#C4622D', textDecoration: 'underline' }}>{s}</a>
  if (/^[\d\s+\-().]{6,}$/.test(s))
    return <a href={`tel:${s.replace(/[\s\-().]/g, '')}`} style={{ color: '#C4622D', textDecoration: 'underline' }}>{s}</a>
  return <>{linkify(s)}</>
}

export default function EvenementPage() {
  const { id } = useParams<{ id: string }>()
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

      <div className="p-4 space-y-3 pb-8">
        <div>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full text-white mb-2"
            style={{ backgroundColor: cat.color }}>
            {cat.emoji} {cat.label}
          </span>
          <h2 className="text-2xl font-bold text-[#2C1810] leading-tight">{evt.titre}</h2>
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
