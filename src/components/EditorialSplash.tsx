'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { compressImage, uploadViaSignedUrl } from '@/lib/clientUpload'
import EmbedPicker, { type EmbedItem } from '@/components/EmbedPicker'

/* Données réelles renvoyées par /api/splash */
interface SplashData {
  hero?: string | null
  aujourdhui?: { today: number; weekend: number; debates: number } | null
  caFaitParler?: { id: string; titre: string; comments: number; votes: number } | null
  journal?: { numero: number; titre: string; deck: string } | null
  bonPlan?: { id: string; titre: string; sous: string | null; image: string | null; etab: string | null } | null
  vuAujourdhui?: { id: string; titre: string; auteur: string; image: string | null } | null
  decouvrir?: { kind: string; id: string; title: string; subtitle: string | null; photo: string | null } | null
}

/* Lien vers la page d'un élément « À découvrir » selon son type */
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

const NAV_H = 62

/* Icônes RÉUTILISÉES du site (EmbedPicker / moments / messagerie), recolorées */
const SVG = { width: 25, height: 25, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Icons = {
  calendar: <svg {...SVG}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  chat: <svg {...SVG}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /><line x1="8" y1="11.5" x2="8.01" y2="11.5" /><line x1="12" y1="11.5" x2="12.01" y2="11.5" /><line x1="16" y1="11.5" x2="16.01" y2="11.5" /></svg>,
  book: <svg {...SVG}><path d="M4 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2" /><line x1="6" y1="8" x2="14" y2="8" /><line x1="6" y1="12" x2="14" y2="12" /><line x1="6" y1="16" x2="11" y2="16" /></svg>,
  tag: <svg {...SVG}><path d="M20 12V8H4v4" /><path d="M20 12v8H4v-8" /><line x1="12" y1="8" x2="12" y2="20" /><path d="M8 8a2 2 0 0 1 2-4c1.5 0 2 2 2 4-2 0-4 0-4-2 0-2 2-2 2-2" /></svg>,
  camera: <svg {...SVG}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  discover: <svg {...SVG}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>,
}

type RubProps = {
  kicker: string; color: string; iconBg: string; icon: React.ReactNode
  title: string; subParts?: (string | null)[]; thumb?: string | null; onClick: () => void
}
function Rubrique({ kicker, color, iconBg, icon, title, subParts, thumb, onClick }: RubProps) {
  const parts = (subParts ?? []).filter(Boolean) as string[]
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 13,
        background: '#fff', border: 'none', borderRadius: 18,
        padding: '11px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-jakarta), sans-serif',
      }}
    >
      <span style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 14, background: iconBg, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
        <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>{kicker}</span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', color: '#1A1209', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {parts.length > 0 && (
          <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 500, color: '#7A6A5A', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {parts.map((p, i) => (
              <span key={i}>{i > 0 && <span style={{ color: '#B3A492', fontWeight: 700, margin: '0 6px' }}>•</span>}{p}</span>
            ))}
          </span>
        )}
      </span>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 13, objectFit: 'cover' }} />
      )}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>
    </button>
  )
}

export default function EditorialSplash({ onExplore, onRubrique, onSearch, onShare, onInfo, onNotifs, onToday, isAdmin = false, notifUnread = 0 }: {
  onExplore: () => void
  onRubrique: (href: string) => void
  onSearch?: () => void
  onShare?: () => void
  onInfo?: () => void
  onNotifs?: () => void
  onToday?: () => void
  isAdmin?: boolean
  notifUnread?: number
}) {
  const [d, setD] = useState<SplashData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const load = useCallback(() => {
    fetch(`/api/splash?_=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(data => { if (data) setD(data) }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  // Admin : enregistre l'élément « À découvrir » choisi via l'EmbedPicker
  const savePick = async (item: EmbedItem | null) => {
    setPickerOpen(false)
    setD(prev => (prev ? { ...prev, decouvrir: item } : prev))   // change tout de suite et reste (pas de refetch qui ramènerait l'ancien)
    await supabase.auth.refreshSession().catch(() => {})
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const r = await fetch('/api/splash/decouvrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
      body: JSON.stringify(item),
    }).catch(() => null)
    if (!r || !r.ok) toast.error('Mise en avant affichée mais pas enregistrée — réessaie')
  }

  // Admin : changer l'image héro — loader direct (pas de bibliothèque).
  // heroOverride : priorité absolue à l'écran, jamais écrasé par un refetch.
  const [heroOverride, setHeroOverride] = useState<string | null>(null)
  const [heroBusy, setHeroBusy] = useState(false)
  const heroInputRef = useRef<HTMLInputElement>(null)
  const onHeroFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setHeroBusy(true)
    try {
      await supabase.auth.refreshSession().catch(() => {})   // token frais avant upload + POST
      const compressed = await compressImage(file)
      const { publicUrl } = await uploadViaSignedUrl({ file: compressed, kind: 'hub-hero-intro' })
      setHeroOverride(publicUrl)   // change tout de suite et reste affiché
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      const r = await fetch('/api/splash/hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
        body: JSON.stringify({ url: publicUrl }),
      }).catch(() => null)
      if (!r || !r.ok) toast.error('Image affichée mais pas enregistrée — réessaie')
    } catch (err) {
      toast.error('Chargement échoué : ' + (err instanceof Error ? err.message : 'erreur'))
    }
    setHeroBusy(false)
  }

  const auj = d?.aujourdhui
  const dec = d?.decouvrir
  const heroSrc = heroOverride || d?.hero || null

  return (
    <div className="pdv-hscroll" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 250, backgroundColor: '#FDFAF5', overflowY: 'auto', WebkitOverflowScrolling: 'touch', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 'max(10px, env(safe-area-inset-top, 10px)) 11px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>

        {/* En-tête unifié avec le hub : logo (gauche) + loupe + partager + cloche + menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingTop: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/splash-logo-v4.png" alt="La Place du Village" style={{ height: 52, width: 'auto', maxWidth: '46%', objectFit: 'contain', display: 'block' }} />
          <div style={{ flex: 1 }} />
          <button aria-label="Rechercher" onClick={onSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 5 }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
          </button>
          <button aria-label="Partager" onClick={onShare} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 5 }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
          </button>
          <button aria-label="Notifications" onClick={onNotifs} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 5 }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {notifUnread > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, background: '#E8622A' }} />}
          </button>
          <button aria-label="À propos" onClick={onInfo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 5 }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
          </button>
        </div>

        {/* Héro — image entière, pleine largeur, hauteur auto (jamais croppée,
            s'adapte au ratio). Placeholder neutre pendant le chargement (pas de
            flash de l'image du hub). */}
        <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', lineHeight: 0, background: '#EAE4D8', minHeight: heroSrc ? undefined : 160 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {heroSrc && <img src={heroSrc} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />}
          {isAdmin && (
            <>
              <input ref={heroInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onHeroFile} />
              <button
                onClick={() => heroInputRef.current?.click()}
                disabled={heroBusy}
                style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(4px)', fontFamily: 'var(--font-body), sans-serif' }}
              >
                {heroBusy ? 'Envoi…' : '✎ Image'}
              </button>
            </>
          )}
        </div>

        {/* Rubriques */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Rubrique
            kicker="Aujourd'hui" color="#E8622A" iconBg="#FFF0E5" icon={Icons.calendar}
            title={auj ? `${auj.today} événement${auj.today > 1 ? 's' : ''} aujourd'hui` : "L'agenda du village"}
            subParts={auj ? [auj.weekend ? `${auj.weekend} ce week-end` : null, auj.debates ? `${auj.debates} débat${auj.debates > 1 ? 's' : ''} actif${auj.debates > 1 ? 's' : ''}` : null] : []}
            onClick={() => (onToday ? onToday() : onRubrique('/?tab=carte'))}
          />
          <Rubrique
            kicker="Ça fait parler" color="#7C3AED" iconBg="#F3EEFB" icon={Icons.chat}
            title={d?.caFaitParler?.titre ?? 'La place publique'}
            subParts={d?.caFaitParler ? [`${d.caFaitParler.comments} commentaire${d.caFaitParler.comments > 1 ? 's' : ''}`, `${d.caFaitParler.votes} vote${d.caFaitParler.votes > 1 ? 's' : ''}`] : ['Rejoignez les discussions du village']}
            onClick={() => onRubrique(d?.caFaitParler ? `/forum/${d.caFaitParler.id}` : '/forum')}
          />
          <Rubrique
            kicker="Dans le journal" color="#3A5BC7" iconBg="#EEF2FE" icon={Icons.book}
            title={d?.journal ? `Le Journal Hebdo n°${d.journal.numero} est sorti` : 'Le Journal du Village'}
            subParts={[d?.journal?.deck || (d?.journal ? d.journal.titre : 'Le meilleur du village, chaque semaine')]}
            onClick={() => onRubrique('/journal')}
          />
          <Rubrique
            kicker="Bon plan du jour" color="#2D5A3D" iconBg="#E8F2EB" icon={Icons.tag}
            title={d?.bonPlan?.titre ?? 'Les bons plans du coin'}
            subParts={[d?.bonPlan?.etab ?? (d?.bonPlan ? null : 'Les offres des commerçants partenaires')]}
            thumb={d?.bonPlan?.image ?? null}
            onClick={() => onRubrique(d?.bonPlan ? `/promotions?id=${d.bonPlan.id}` : '/promotions')}
          />
          {d?.vuAujourdhui ? (
            <Rubrique
              kicker="Vu aujourd'hui" color="#D99100" iconBg="#FEF6E0" icon={Icons.camera}
              title={d.vuAujourdhui.titre}
              subParts={[`Photo de ${d.vuAujourdhui.auteur}`]}
              thumb={d.vuAujourdhui.image}
              onClick={() => onRubrique('/')}
            />
          ) : (
            <>
              <Rubrique
                kicker="À découvrir" color="#0E8A7A" iconBg="#E2F2EF" icon={Icons.discover}
                title={dec?.title || (isAdmin ? 'Choisir une mise en avant' : 'Explore le village')}
                subParts={[dec?.subtitle ?? (isAdmin ? 'Sélectionne un élément à mettre en avant' : 'Commerces, producteurs, événements…')]}
                thumb={dec?.photo ?? null}
                onClick={() => { if (dec) onRubrique(decouvrirHref(dec.kind, dec.id)); else if (isAdmin) setPickerOpen(true); else onExplore() }}
              />
              {isAdmin && (
                <button
                  onClick={() => setPickerOpen(true)}
                  style={{ alignSelf: 'flex-start', marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#0E8A7A', fontSize: 12, fontWeight: 700, padding: '1px 0', fontFamily: 'var(--font-body), sans-serif' }}
                >
                  ✎ {dec ? 'Changer la mise en avant' : 'Choisir la mise en avant'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Explorer le village → accueil */}
        <button
          onClick={onExplore}
          style={{ marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: '#234A30', border: 'none', borderRadius: 18, padding: '16px 18px', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-display), Georgia, serif', fontSize: 23, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Explorer le village</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>Voir tous les événements, annonces, articles…</span>
          </span>
          <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 21, background: '#fff', color: '#234A30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </span>
        </button>

      </div>

      {/* Admin : sélection de l'élément « À découvrir » (fouille toute l'app) */}
      {pickerOpen && <EmbedPicker onSelect={savePick} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
