'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmbedPicker, { type EmbedItem } from '@/components/EmbedPicker'

/* Données réelles renvoyées par /api/splash */
interface SplashData {
  aujourdhui?: { today: number; weekend: number; debates: number } | null
  events?: { id: string; titre: string; commune: string | null }[]
  caFaitParler?: { id: string; titre: string; comments: number; votes: number; image: string | null } | null
  journal?: { numero: number; titre: string; deck: string } | null
  bonPlan?: { id: string; titre: string; sous: string | null; image: string | null; etab: string | null } | null
  vuAujourdhui?: { id: string; titre: string; auteur: string; image: string | null } | null
  decouvrir?: { kind: string; id: string; title: string; subtitle: string | null; photo: string | null } | null
}

function decouvrirHref(kind: string, id: string): string {
  switch (kind) {
    case 'event':    return `/evenement/${id}`
    case 'etab':     return `/etablissement/${id}`
    case 'producer': return `/producteur/${id}`
    case 'annonce':  return `/annonces/${id}`
    case 'promo':    return `/promotions?id=${id}`
    case 'covoit':   return `/covoiturage/${id}`
    case 'article':  return `/journal`
    default:         return '/'
  }
}

const ARROW = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
)

/* Badge coloré en haut d'une tuile */
function Badge({ color, bg, label, light }: { color: string; bg: string; label: string; light?: boolean }) {
  return (
    <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, color, borderRadius: 999, padding: '4px 10px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: light ? 'none' : '0 1px 3px rgba(0,0,0,0.25)' }}>
      {label}
    </span>
  )
}

export default function EditorialSplash({ onExplore, onRubrique, onToday, isAdmin = false }: {
  onExplore: () => void
  onRubrique: (href: string) => void
  onToday?: () => void
  isAdmin?: boolean
}) {
  const [d, setD] = useState<SplashData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const load = useCallback(() => {
    fetch(`/api/splash?_=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(data => { if (data) setD(data) }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  // Admin : élément mis en avant dans « À découvrir »
  const savePick = async (item: EmbedItem | null) => {
    setPickerOpen(false)
    setD(prev => (prev ? { ...prev, decouvrir: item } : prev))
    await supabase.auth.refreshSession().catch(() => {})
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    await fetch('/api/splash/decouvrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
      body: JSON.stringify(item),
    }).catch(() => null)
  }

  const auj = d?.aujourdhui
  const events = d?.events ?? []
  const cfp = d?.caFaitParler
  const jrn = d?.journal
  const bp = d?.bonPlan
  const dec = d?.decouvrir

  // Dégradés
  const darkGrad = 'linear-gradient(95deg, rgba(18,14,9,0.93) 0%, rgba(18,14,9,0.60) 56%, rgba(18,14,9,0.34) 100%)'
  const lightFromBottom = 'linear-gradient(to top, rgba(253,250,245,0.97) 32%, rgba(253,250,245,0.68) 66%, rgba(253,250,245,0.18) 100%)'
  const lightFromLeft = 'linear-gradient(95deg, rgba(253,250,245,0.97) 36%, rgba(253,250,245,0.70) 70%, rgba(253,250,245,0.12) 100%)'

  const linkRow = (label: string, color: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color, fontSize: 12.5, fontWeight: 800, marginTop: 'auto' }}>{label} {ARROW}</span>
  )

  return (
    <div className="pdv-hscroll" style={{ position: 'fixed', inset: 0, zIndex: 250, backgroundColor: '#FDFAF5', overflowY: 'auto', WebkitOverflowScrolling: 'touch', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      {/* Header illustré (image directe, pleine largeur) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/splash-header.jpg" alt="La Place du Village — Explorez, découvrez, profitez" style={{ width: '100%', height: 'auto', display: 'block' }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 13px max(18px, env(safe-area-inset-bottom, 18px))', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Titre de section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#E8622A', fontSize: 13, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
          À la une aujourd'hui
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </div>

        {/* ── 2 grandes tuiles (Aujourd'hui + Ça fait parler) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {/* Aujourd'hui */}
          <button
            onClick={() => (onToday ? onToday() : onRubrique('/?tab=carte'))}
            style={{ position: 'relative', minHeight: 230, borderRadius: 18, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${darkGrad}, url('/splash-bg-aujourdhui.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 13, gap: 7 }}>
              <Badge color="#fff" bg="#E8622A" label="📅 Aujourd'hui" />
              <span style={{ lineHeight: 1.05 }}>
                <span style={{ display: 'block', color: '#fff', fontSize: 20, fontWeight: 800 }}>{auj?.today ?? 0} événements</span>
                <span style={{ display: 'block', color: '#F4A24A', fontSize: 19, fontWeight: 800 }}>aujourd'hui</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                {events.slice(0, 3).map(ev => (
                  <span key={ev.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F4A24A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.titre}</span>
                      {ev.commune && <span style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: 10.5, lineHeight: 1.2 }}>{ev.commune}</span>}
                    </span>
                  </span>
                ))}
              </span>
              {linkRow('Explorer', '#F4A24A')}
            </span>
          </button>

          {/* Ça fait parler */}
          <button
            onClick={() => onRubrique(cfp ? `/forum/${cfp.id}` : '/forum')}
            style={{ position: 'relative', minHeight: 230, borderRadius: 18, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${darkGrad}, url('${cfp?.image || '/splash-bg-journal.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 13, gap: 8 }}>
              <Badge color="#fff" bg="#7C3AED" label="💬 Ça fait parler" />
              <span style={{ color: '#fff', fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: 2 }}>{cfp?.titre ?? 'La place publique'}</span>
              {cfp && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}>{cfp.votes} votes · {cfp.comments} commentaires</span>}
              <span style={{ marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: 999, padding: '7px 13px', fontSize: 12, fontWeight: 800 }}>Voir le débat {ARROW}</span>
            </span>
          </button>
        </div>

        {/* ── 3 tuiles claires (Journal + Bon plan + À découvrir) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
          {/* Journal */}
          <button
            onClick={() => onRubrique('/journal')}
            style={{ position: 'relative', minHeight: 158, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${lightFromBottom}, url('/splash-bg-journal.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 6 }}>
              <Badge color="#3A5BC7" bg="#E6ECFB" label="📖 Le journal" light />
              <span style={{ color: '#1A1209', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{jrn?.titre ?? 'Le Journal du Village'}</span>
              {linkRow("Lire l'article", '#3A5BC7')}
            </span>
          </button>

          {/* Bon plan du jour */}
          <button
            onClick={() => onRubrique(bp ? `/promotions?id=${bp.id}` : '/promotions')}
            style={{ position: 'relative', minHeight: 158, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${lightFromLeft}, url('${bp?.image || '/splash-bg-journal.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 5 }}>
              <Badge color="#2D5A3D" bg="#E3F0E8" label="🎁 Bon plan du jour" light />
              <span style={{ color: '#1A1209', fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{bp?.titre ?? 'Les bons plans'}</span>
              {bp?.sous && <span style={{ color: '#6B5E4E', fontSize: 11, fontStyle: 'italic', lineHeight: 1.25 }}>{bp.sous}</span>}
              {linkRow("Profiter de l'offre", '#2D5A3D')}
            </span>
          </button>

          {/* À découvrir */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { if (dec) onRubrique(decouvrirHref(dec.kind, dec.id)); else if (isAdmin) setPickerOpen(true); else onExplore() }}
              style={{ position: 'relative', width: '100%', minHeight: 158, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${lightFromLeft}, url('${dec?.photo || '/splash-bg-aujourdhui.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: 'var(--font-jakarta), sans-serif', display: 'block' }}
            >
              <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 5 }}>
                <Badge color="#C84B2F" bg="#FBE6DF" label="🧭 À découvrir" light />
                <span style={{ color: '#1A1209', fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>{dec?.title || (isAdmin ? 'Choisir une mise en avant' : 'À découvrir au village')}</span>
                {linkRow('En savoir plus', '#C84B2F')}
              </span>
            </button>
            {isAdmin && (
              <button onClick={() => setPickerOpen(true)} aria-label="Changer la mise en avant" style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, backdropFilter: 'blur(3px)' }}>✎</button>
            )}
          </div>
        </div>

        {/* Explorer le village */}
        <button
          onClick={onExplore}
          style={{ marginTop: 4, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#234A30', border: 'none', borderRadius: 999, padding: '15px 18px', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-jakarta), sans-serif' }}
        >
          Explorer le village
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>

        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: '#9A8A78', fontSize: 12, fontWeight: 500 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
          Tout ce qui se passe près de chez vous
        </span>
      </div>

      {pickerOpen && <EmbedPicker onSelect={savePick} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
