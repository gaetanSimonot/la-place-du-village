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

/* Petites icônes des rubriques (réutilisées du site) */
const bi = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const BIcons = {
  calendar: <svg {...bi}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  chat: <svg {...bi}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>,
  book: <svg {...bi}><path d="M4 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2" /></svg>,
  tag: <svg {...bi}><path d="M20 12V8H4v4" /><path d="M20 12v8H4v-8" /><line x1="12" y1="8" x2="12" y2="20" /></svg>,
  compass: <svg {...bi}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>,
}

/* Badge : "filled" = pill colorée (tuiles haut) ; sinon plat (tuiles bas) */
function Badge({ color, label, icon, filled }: { color: string; label: React.ReactNode; icon: React.ReactNode; filled?: boolean }) {
  if (filled) return (
    <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, background: color, color: '#fff', borderRadius: 7, padding: '5px 10px', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>{icon}{label}</span>
  )
  return (
    <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, color, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{icon}{label}</span>
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
      await supabase.auth.refreshSession().catch(() => {})
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const r = await fetch('/api/splash/decouvrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
        body: JSON.stringify(item),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      toast.success(item ? 'Mise en avant enregistrée' : 'Mise en avant retirée')
      load()
    } catch {
      toast.error("Échec de l'enregistrement — réessaie")
    }
  }

  const auj = d?.aujourdhui
  const cfp = d?.caFaitParler
  const jrn = d?.journal
  const bp = d?.bonPlan
  const dec = d?.decouvrir

  // ── Premium : overlay VERT qui recouvre l'image (plus foncé à gauche) ──
  const greenOverlay = 'linear-gradient(to right, rgba(17,38,24,0.95) 0%, rgba(17,38,24,0.78) 52%, rgba(17,38,24,0.56) 100%)'
  // À découvrir : pas de teinte verte → overlay neutre (image naturelle, texte lisible)
  const neutralOverlay = 'linear-gradient(to bottom, rgba(18,12,8,0.66) 0%, rgba(18,12,8,0.52) 42%, rgba(18,12,8,0.90) 100%)'
  const tileBg = '#13291B'   // fond vert foncé sous l'image (évite tout liseré au bord arrondi)
  const tileShadow = '0 3px 14px rgba(20,30,18,0.20)'
  const serif = 'var(--font-dm-serif), Georgia, serif'

  // Titre des petites tuiles : plus c'est court, plus c'est gros
  const tileTitleSize = (t?: string | null) => {
    const n = (t ?? '').trim().length
    if (n <= 14) return 21
    if (n <= 24) return 18
    if (n <= 38) return 15.5
    if (n <= 54) return 13.5
    return 12.5
  }

  const ARROW = (small?: boolean) => (
    <svg width={small ? 13 : 16} height={small ? 13 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  )

  const greenBg = 'linear-gradient(180deg, #2b6044 0%, #1b4730 100%)'
  const grayBg = 'linear-gradient(180deg, #6b6862 0%, #4d4a45 100%)'
  // Bouton de tuile. small → bas de tuile (auto) + compact ; sinon grande tuile (space-between gère la position).
  const tileBtn = (label: string, small?: boolean, bg: string = greenBg) => (
    <span style={{ alignSelf: 'flex-start', marginTop: small ? 'auto' : 0, maxWidth: '100%', display: 'inline-flex', alignItems: 'center', gap: 7, background: bg, color: '#fff', borderRadius: 11, padding: small ? '8px 13px' : '11px 17px', fontSize: small ? 12 : 14, fontWeight: 800, boxShadow: '0 2px 6px rgba(12,28,18,0.35)' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {ARROW(small)}
    </span>
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
          {"À la une aujourd'hui"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8622A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </div>

        {/* ── 2 grandes tuiles (Aujourd'hui + Ça fait parler) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {/* Aujourd'hui */}
          <button
            onClick={() => (onToday ? onToday() : onRubrique('/?tab=carte'))}
            style={{ position: 'relative', minHeight: 244, borderRadius: 18, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: tileBg, backgroundImage: `${greenOverlay}, url('/splash-bg-aujourdhui.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px 15px' }}>
              <Badge color="#E8622A" filled icon={BIcons.calendar} label="Aujourd'hui" />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontFamily: serif, lineHeight: 1.16, color: '#fff' }}>
                  <span style={{ display: 'block', fontSize: 34 }}>{auj?.today ?? 0}</span>
                  <span style={{ display: 'block', fontSize: 19 }}>événements</span>
                  <span style={{ display: 'block', fontSize: 19 }}>{"aujourd'hui"}</span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: 600 }}>{auj?.week ?? 0} cette semaine</span>
              </span>
              {tileBtn('Explorer')}
            </span>
          </button>

          {/* Ça fait parler */}
          <button
            onClick={() => onRubrique(cfp ? `/forum/${cfp.id}` : '/forum')}
            style={{ position: 'relative', minHeight: 244, borderRadius: 18, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: tileBg, backgroundImage: `${greenOverlay}, url('${cfp?.image || '/splash-bg-journal.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px 15px' }}>
              <Badge color="#7C3AED" filled icon={BIcons.chat} label="Ça fait parler" />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ color: '#fff', fontSize: 20, fontFamily: serif, lineHeight: 1.24, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cfp?.titre ?? 'La place publique'}</span>
                {cfp && <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: 500 }}>{cfp.votes} votes · {cfp.comments} commentaires</span>}
              </span>
              {tileBtn('Voir le débat')}
            </span>
          </button>
        </div>

        {/* ── 3 petites tuiles (Journal + Bon plan + À découvrir) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
          {/* Journal */}
          <button
            onClick={() => onRubrique('/journal')}
            style={{ position: 'relative', minHeight: 162, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: tileBg, backgroundImage: `${greenOverlay}, url('/splash-bg-journal.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 6 }}>
              <Badge color="rgba(255,255,255,0.88)" icon={BIcons.book} label="Le journal" />
              <span style={{ color: '#fff', fontSize: tileTitleSize(jrn?.titre ?? 'Le Journal du Village'), fontFamily: serif, lineHeight: 1.22 }}>{jrn?.titre ?? 'Le Journal du Village'}</span>
              {tileBtn('Lire', true)}
            </span>
          </button>

          {/* Bon plan du jour */}
          <button
            onClick={() => onRubrique(bp ? `/promotions?id=${bp.id}` : '/promotions')}
            style={{ position: 'relative', minHeight: 162, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: tileBg, backgroundImage: `${greenOverlay}, url('${bp?.image || '/splash-bg-journal.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif' }}
          >
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 5 }}>
              <Badge color="rgba(255,255,255,0.88)" icon={BIcons.tag} label={<span style={{ lineHeight: 1.1 }}>Bon plan<br />du jour</span>} />
              <span style={{ color: '#fff', fontSize: tileTitleSize(bp?.titre ?? 'Les bons plans'), fontFamily: serif, lineHeight: 1.22 }}>{bp?.titre ?? 'Les bons plans'}</span>
              {bp?.sous && <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontStyle: 'italic', lineHeight: 1.25 }}>{bp.sous}</span>}
              {tileBtn('Go !', true)}
            </span>
          </button>

          {/* À découvrir */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { if (dec) onRubrique(decouvrirHref(dec.kind, dec.id)); else if (isAdmin) setPickerOpen(true); else onExplore() }}
              style={{ position: 'relative', width: '100%', minHeight: 162, borderRadius: 16, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, backgroundColor: '#1A130D', backgroundImage: `${neutralOverlay}, url('${dec?.photo || '/splash-bg-aujourdhui.jpg'}')`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: tileShadow, fontFamily: 'var(--font-jakarta), sans-serif', display: 'block' }}
            >
              <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 11, gap: 5 }}>
                <Badge color="#EE8A3E" icon={BIcons.compass} label="À découvrir" />
                <span style={{ color: '#fff', fontSize: tileTitleSize(dec?.title || (isAdmin ? 'Choisir une mise en avant' : 'À découvrir au village')), fontFamily: serif, lineHeight: 1.22 }}>{dec?.title || (isAdmin ? 'Choisir une mise en avant' : 'À découvrir au village')}</span>
                {tileBtn('Voir', true, grayBg)}
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
          style={{ marginTop: 4, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#E8622A', border: 'none', borderRadius: 999, padding: '15px 18px', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-jakarta), sans-serif' }}
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
