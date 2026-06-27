'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import EmbedPicker, { type EmbedItem } from '@/components/EmbedPicker'

/* Données réelles renvoyées par /api/splash */
interface SplashData {
  aujourdhui?: { today: number; week: number; debates: number } | null
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

/* Petites icônes des rubriques (réutilisées du site) */
const bi = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const BIcons = {
  calendar: <svg {...bi}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  chat: <svg {...bi}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>,
  book: <svg {...bi}><path d="M4 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2" /></svg>,
  tag: <svg {...bi}><path d="M20 12V8H4v4" /><path d="M20 12v8H4v-8" /><line x1="12" y1="8" x2="12" y2="20" /></svg>,
  compass: <svg {...bi}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>,
}

/* Badge : "filled" = rect à peine arrondi coloré (tuiles sombres) ; sinon plat sans capsule (tuiles claires) */
function Badge({ color, label, icon, filled }: { color: string; label: React.ReactNode; icon: React.ReactNode; filled?: boolean }) {
  if (filled) return (
    <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, background: color, color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{icon}{label}</span>
  )
  return (
    <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, color, fontSize: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{icon}{label}</span>
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
    setD(prev => (prev ? { ...prev, decouvrir: item } : prev))   // affichage instantané (optimiste)
    try {
      await supabase.auth.refreshSession().catch(() => {})        // token frais (sinon POST admin échoue en silence)
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const r = await fetch('/api/splash/decouvrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
        body: JSON.stringify(item),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      toast.success(item ? 'Mise en avant enregistrée' : 'Mise en avant retirée')
      load()   // refetch de l'état persistant → confirme la prise en compte (comme le home)
    } catch {
      toast.error("Échec de l'enregistrement — réessaie")
    }
  }

  const auj = d?.aujourdhui
  const cfp = d?.caFaitParler
  const jrn = d?.journal
  const bp = d?.bonPlan
  const dec = d?.decouvrir

  // Dégradés — transition franche sur la ligne de séparation (gauche net, image pure à droite)
  const darkGrad = 'linear-gradient(to right, rgba(18,14,9,0.92) 0%, rgba(18,14,9,0.88) 48%, rgba(18,14,9,0) 86%)'
  // Même dégradé pour les 3 petites tuiles : net haut-gauche → image pure bas-droite, avancé vers la droite
  const lightTile = 'linear-gradient(to bottom right, rgba(253,250,245,1) 0%, rgba(253,250,245,1) 54%, rgba(253,250,245,0) 92%)'
  const serif = 'var(--font-dm-serif), Georgia, serif'   // typo des titres de tuiles (proche de la réf)
  const tileShadow = '0 2px 12px rgba(60,40,20,0.10)'
  // + liseré interne ivoire 1px : masque le hairline noir des coins arrondis sur les tuiles <img>
  const tileShadowEdge = '0 2px 12px rgba(60,40,20,0.10), inset 0 0 0 1px #FDFAF5'

  const linkRow = (label: string, color: string, chip?: boolean) => chip ? (
    <span style={{ marginTop: 'auto', alignSelf: 'flex-start', maxWidth: '100%', display: 'inline-flex', alignItems: 'center', gap: 4, color, fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(3px)', borderRadius: 6, padding: '3px 8px' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color, fontSize: 12, fontWeight: 800, marginTop: 'auto', whiteSpace: 'nowrap' }}>{label} {ARROW}</span>
  )

  return (
    <div className="pdv-hscroll" style={{ position: 'fixed', inset: 0, zIndex: 250, backgroundColor: '#F7F2E6', overflowY: 'auto', WebkitOverflowScrolling: 'touch', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      {/* Header illustré (image directe, pleine largeur) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/splash-header.jpg" alt="La Place du Village — Explorez, découvrez, profitez" style={{ width: '100%', height: 'auto', display: 'block' }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 13px max(18px, env(safe-area-inset-bottom, 18px))', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Titre de section — aligné à gauche, texte vert, chevrons orange */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2D5A3D', fontSize: 13, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8622A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
          À la une aujourd'hui
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8622A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </div>

        {/* ── 2 grandes tuiles (Aujourd'hui + Ça fait parler) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {/* Aujourd'hui */}
          <button
            onClick={() => (onToday ? onToday() : onRubrique('/?tab=carte'))}
            style={{ position: 'relative', minHeight: 230, borderRadius: 18, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${darkGrad}, url('/splash-bg-aujourdhui.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 13, gap: 7 }}>
              <Badge color="#E8622A" filled icon={BIcons.calendar} label="Aujourd'hui" />
              <span style={{ lineHeight: 1.22, fontFamily: serif }}>
                <span style={{ display: 'block', color: '#fff', fontSize: 30 }}>{auj?.today ?? 0}</span>
                <span style={{ display: 'block', color: '#fff', fontSize: 18 }}>événements</span>
                <span style={{ display: 'block', color: '#F4A24A', fontSize: 18 }}>aujourd'hui</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: 600, marginTop: 1 }}>{auj?.week ?? 0} cette semaine</span>
              <span style={{ marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 800 }}>Explorer {ARROW}</span>
            </span>
          </button>

          {/* Ça fait parler */}
          <button
            onClick={() => onRubrique(cfp ? `/forum/${cfp.id}` : '/forum')}
            style={{ position: 'relative', minHeight: 230, borderRadius: 18, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${darkGrad}, url('${cfp?.image || '/splash-bg-journal.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 13, gap: 8 }}>
              <Badge color="#7C3AED" filled icon={BIcons.chat} label="Ça fait parler" />
              <span style={{ color: '#fff', fontSize: 16, fontFamily: serif, lineHeight: 1.25, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cfp?.titre ?? 'La place publique'}</span>
              {cfp && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}>{cfp.votes} votes · {cfp.comments} commentaires</span>}
              <span style={{ marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 800 }}>Voir le débat {ARROW}</span>
            </span>
          </button>
        </div>

        {/* ── 3 tuiles claires (Journal + Bon plan + À découvrir) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
          {/* Journal */}
          <button
            onClick={() => onRubrique('/journal')}
            style={{ position: 'relative', minHeight: 158, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundImage: `${lightTile}, url('/splash-bg-journal.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 6 }}>
              <Badge color="#3A5BC7" icon={BIcons.book} label="Le journal" />
              <span style={{ color: '#1A1209', fontSize: 13, fontFamily: serif, lineHeight: 1.3 }}>{jrn?.titre ?? 'Le Journal du Village'}</span>
              {linkRow("Lire l'article", '#3A5BC7', true)}
            </span>
          </button>

          {/* Bon plan du jour */}
          <button
            onClick={() => onRubrique(bp ? `/promotions?id=${bp.id}` : '/promotions')}
            style={{ position: 'relative', minHeight: 158, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: '#FDFAF5', boxShadow: tileShadowEdge, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bp?.image || '/splash-bg-journal.jpg'} alt="" style={{ position: 'absolute', top: -2, left: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', objectFit: 'cover', transform: 'scale(1.06)' }} />
            <span style={{ position: 'absolute', inset: 0, background: lightTile }} />
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 5 }}>
              <Badge color="#2D5A3D" icon={BIcons.tag} label={<span style={{ lineHeight: 1.1 }}>Bon plan<br />du jour</span>} />
              <span style={{ color: '#1A1209', fontSize: 13, fontFamily: serif, lineHeight: 1.3 }}>{bp?.titre ?? 'Les bons plans'}</span>
              {bp?.sous && <span style={{ color: '#6B5E4E', fontSize: 11, fontStyle: 'italic', lineHeight: 1.25 }}>{bp.sous}</span>}
              {linkRow('En profiter', '#2D5A3D', true)}
            </span>
          </button>

          {/* À découvrir */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { if (dec) onRubrique(decouvrirHref(dec.kind, dec.id)); else if (isAdmin) setPickerOpen(true); else onExplore() }}
              style={{ position: 'relative', width: '100%', minHeight: 158, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: '#FDFAF5', boxShadow: tileShadowEdge, fontFamily: 'var(--font-jakarta), sans-serif', display: 'block' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dec?.photo || '/splash-bg-aujourdhui.jpg'} alt="" style={{ position: 'absolute', top: -2, left: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', objectFit: 'cover', transform: 'scale(1.06)' }} />
              <span style={{ position: 'absolute', inset: 0, background: lightTile }} />
              <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 5 }}>
                <Badge color="#C84B2F" icon={BIcons.compass} label="À découvrir" />
                <span style={{ color: '#1A1209', fontSize: 13, fontFamily: serif, lineHeight: 1.3 }}>{dec?.title || (isAdmin ? 'Choisir une mise en avant' : 'À découvrir au village')}</span>
                {linkRow('En savoir plus', '#C84B2F', true)}
              </span>
            </button>
            {isAdmin && (
              <button onClick={() => setPickerOpen(true)} aria-label="Changer la mise en avant" style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, backdropFilter: 'blur(3px)' }}>✎</button>
            )}
          </div>
        </div>

        {/* Explorer la Place */}
        <button
          onClick={onExplore}
          style={{ marginTop: 4, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#234A30', border: 'none', borderRadius: 999, padding: '15px 18px', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-jakarta), sans-serif' }}
        >
          Explorer la Place
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
