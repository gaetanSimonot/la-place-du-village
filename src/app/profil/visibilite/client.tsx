'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import { FeatureModal } from '@/components/FeatureButton'
import { creditsRemaining, type FeatureCredits, type FeaturedContentType } from '@/lib/featured'

interface ContentItem {
  id: string
  type: FeaturedContentType
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  ownerUserId?: string | null
  /** d'où vient ce contenu : 'owned' = je l'ai créé, 'liked' = favori, 'interest' = ⭐ intéressé */
  origin: 'owned' | 'liked' | 'interest'
}

export default function VisibiliteView() {
  const router = useRouter()
  const { user, profile, isAdmin, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [items, setItems]       = useState<ContentItem[]>([])
  const [credits, setCredits]   = useState<FeatureCredits | null>(null)
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'all' | 'owned' | 'favoris'>('all')
  const [selected, setSelected] = useState<ContentItem | null>(null)

  const plan = (profile?.plan as 'basic' | 'habitants' | 'pro' | undefined) ?? 'basic'
  const remaining = creditsRemaining(credits)

  useEffect(() => {
    if (authLoading) return
    if (!user) { openAuthModal('/profil/visibilite'); return }
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      // Crédits
      const rc = await fetch('/api/feature/credits', { headers: { Authorization: `Bearer ${token}` } })
      if (rc.ok) { const d = await rc.json(); setCredits(d.credits ?? null) }

      // Mes contenus
      const owned = await loadOwned(user.id)
      // Favoris + intérêts (events + annonces)
      const liked = await loadLikedAndInterests(user.id)

      setItems([...owned, ...liked])
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  const visibleItems = items.filter(it => {
    if (filter === 'all')     return true
    if (filter === 'owned')   return it.origin === 'owned'
    if (filter === 'favoris') return it.origin === 'liked' || it.origin === 'interest'
    return true
  })

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const pct = credits && credits.slots_total > 0 ? Math.round((credits.slots_used / credits.slots_total) * 100) : 0

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
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
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A1209', letterSpacing: '-0.02em' }}>
              🚀 Visibilité
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
              Mettez vos contenus en avant
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 14px 40px' }}>
        {/* Crédit Partenaire — visible si pro */}
        {plan === 'pro' && credits && (
          <div style={{
            padding: '14px 16px', borderRadius: 16,
            background: 'linear-gradient(135deg, #3A5BC7 0%, #5B7BDD 100%)',
            color: '#fff', marginBottom: 14,
            boxShadow: '0 4px 18px rgba(58,91,199,0.25)',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              💙 Crédit Partenaire
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 900 }}>{remaining}</span>
              <span style={{ fontSize: 12, opacity: 0.85 }}>/ {credits.slots_total} crédit{credits.slots_total > 1 ? 's' : ''} restant{remaining > 1 ? 's' : ''} ce mois-ci</span>
            </div>
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
              <div style={{ width: `${100 - pct}%`, height: '100%', backgroundColor: '#fff', borderRadius: 3 }} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, opacity: 0.85, }}>
              1 crédit = 1 jour de mise en avant dans un slot. Reset le 1er du mois.
            </p>
          </div>
        )}

        {plan !== 'pro' && (
          <div style={{
            padding: '14px 16px', borderRadius: 16,
            backgroundColor: '#FDFAF6', border: '1px solid #E5DDD2',
            marginBottom: 14,
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
              🚀 Boost ponctuel
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B5E4E', lineHeight: 1.5, }}>
              Pour mettre en avant un contenu : choisissez-le ci-dessous, on vous propose la formule adaptée (à partir de 4€).
            </p>
          </div>
        )}

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {([
            { id: 'all',     label: `Tout (${items.length})` },
            { id: 'owned',   label: `Mes contenus (${items.filter(i => i.origin === 'owned').length})` },
            { id: 'favoris', label: `Favoris (${items.filter(i => i.origin !== 'owned').length})` },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '7px 12px', borderRadius: 999,
                border: '1.5px solid #E5DDD2',
                backgroundColor: filter === f.id ? '#1A1209' : '#fff',
                color: filter === f.id ? '#fff' : '#7A6A5A',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >{f.label}</button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <p style={{ fontSize: 13, color: '#1A1209', fontWeight: 700, margin: '0 0 6px' }}>
              Aucun contenu à mettre en avant
            </p>
            <p style={{ fontSize: 12, color: '#8A7A6A', }}>
              Publiez une annonce, un événement, ou ajoutez des favoris pour démarrer.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleItems.map(it => (
              <button
                key={`${it.type}:${it.id}`}
                onClick={() => setSelected(it)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 10, borderRadius: 14,
                  backgroundColor: '#fff', border: '1px solid #E5DDD2',
                  textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'inherit', width: '100%',
                }}
              >
                <div style={{
                  width: 50, height: 50, borderRadius: 10, flexShrink: 0,
                  backgroundColor: '#F0EBE3',
                  backgroundImage: it.imageUrl ? `url(${it.imageUrl})` : undefined,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {!it.imageUrl && (it.type === 'evenement' ? '🎉' : it.type === 'annonce' ? '🏷️' : it.type === 'etablissement' ? '🏪' : it.type === 'promotion' ? '🎁' : '🌱')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {it.type}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 800,
                      color: it.origin === 'owned' ? '#2D5A3D' : it.origin === 'liked' ? '#C0392B' : '#E8A627',
                      backgroundColor: it.origin === 'owned' ? '#E8F2EB' : it.origin === 'liked' ? '#FBE9E7' : '#FFF4DA',
                      padding: '1px 6px', borderRadius: 999,
                    }}>
                      {it.origin === 'owned' ? 'à moi' : it.origin === 'liked' ? '❤ favori' : '⭐ intérêt'}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.title}
                  </p>
                  {it.subtitle && (
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.subtitle}
                    </p>
                  )}
                </div>
                <span style={{ color: '#2D5A3D', fontSize: 14, flexShrink: 0 }}>⭐</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <FeatureModal
          contentType={selected.type}
          contentId={selected.id}
          isAdmin={!!isAdmin}
          isOwner={selected.origin === 'owned'}
          plan={plan}
          onClose={() => setSelected(null)}
        />
      )}

      <BottomNavBar />
    </div>
  )
}

// ───────── Chargements ─────────

async function loadOwned(userId: string): Promise<ContentItem[]> {
  const items: ContentItem[] = []

  // Annonces actives
  const { data: annonces } = await supabase
    .from('annonces')
    .select('id, titre, photos, statut, type')
    .eq('user_id', userId)
    .eq('statut', 'active')
    .order('updated_at', { ascending: false })
    .limit(20)
  ;(annonces ?? []).forEach(a => items.push({
    id: a.id, type: 'annonce', title: a.titre, subtitle: a.type, imageUrl: a.photos?.[0] ?? null,
    ownerUserId: userId, origin: 'owned',
  }))

  // Établissements gérés
  const { data: etabs } = await supabase
    .from('etablissements')
    .select('id, nom, commune, photos')
    .eq('user_id', userId)
    .limit(20)
  ;(etabs ?? []).forEach(e => items.push({
    id: e.id, type: 'etablissement', title: e.nom, subtitle: e.commune ?? null, imageUrl: e.photos?.[0] ?? null,
    ownerUserId: userId, origin: 'owned',
  }))

  // Producteur (si exists)
  const { data: producers } = await supabase
    .from('producers')
    .select('id, nom, commune, photos')
    .eq('user_id', userId)
    .limit(10)
  ;(producers ?? []).forEach(p => items.push({
    id: p.id, type: 'producteur', title: p.nom, subtitle: p.commune ?? null, imageUrl: p.photos?.[0] ?? null,
    ownerUserId: userId, origin: 'owned',
  }))

  // Promotions actives via mes établissements
  if ((etabs ?? []).length > 0) {
    const etabIds = (etabs ?? []).map(e => e.id)
    const { data: promos } = await supabase
      .from('promotions')
      .select('id, title, image_url, etablissement_id')
      .in('etablissement_id', etabIds)
      .limit(20)
    ;(promos ?? []).forEach(p => items.push({
      id: p.id, type: 'promotion', title: p.title, imageUrl: p.image_url, ownerUserId: userId, origin: 'owned',
    }))
  }

  // Events soumis (si une colonne user_id existe)
  const { data: events } = await supabase
    .from('evenements')
    .select('id, titre, image_url, date_debut')
    .eq('submitted_by', userId)
    .eq('statut', 'publie')
    .order('date_debut', { ascending: true })
    .limit(20)
  ;(events ?? []).forEach(e => items.push({
    id: e.id, type: 'evenement', title: e.titre, subtitle: e.date_debut, imageUrl: e.image_url,
    ownerUserId: userId, origin: 'owned',
  }))

  return items
}

async function loadLikedAndInterests(userId: string): Promise<ContentItem[]> {
  const items: ContentItem[] = []

  // Intérêts (events ⭐)
  const { data: interests } = await supabase
    .from('interests')
    .select('evenement_id')
    .eq('user_id', userId)
    .limit(40)
  const eventIds = (interests ?? []).map(i => i.evenement_id)
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from('evenements')
      .select('id, titre, image_url, date_debut, user_id')
      .in('id', eventIds)
      .eq('statut', 'publie')
    ;(events ?? []).forEach(e => items.push({
      id: e.id, type: 'evenement', title: e.titre, subtitle: e.date_debut, imageUrl: e.image_url,
      ownerUserId: (e as { user_id?: string | null }).user_id ?? null, origin: 'interest',
    }))
  }

  // Favoris events (table event_favorites)
  const { data: favEv } = await supabase
    .from('event_favorites')
    .select('evenement_id')
    .eq('user_id', userId)
    .limit(40)
  const favEvIds = (favEv ?? []).map(i => i.evenement_id)
  if (favEvIds.length > 0) {
    const { data: events } = await supabase
      .from('evenements')
      .select('id, titre, image_url, date_debut')
      .in('id', favEvIds)
      .eq('statut', 'publie')
    ;(events ?? []).forEach(e => {
      // Évite doublons avec interests
      if (!items.some(it => it.type === 'evenement' && it.id === e.id)) {
        items.push({
          id: e.id, type: 'evenement', title: e.titre, subtitle: e.date_debut, imageUrl: e.image_url,
          origin: 'liked',
        })
      }
    })
  }

  return items
}
