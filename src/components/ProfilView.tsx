'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAdminSession } from '@/hooks/useAdminSession'
import { useTheme } from '@/components/ThemeProvider'
import { COLOR_THEMES, MAP_STYLES, SHEET_BG_OPTIONS } from '@/lib/themes'
import { PLANS_INFO, type Plan } from '@/lib/capabilities'
import LoginView from '@/components/LoginView'
import PlanBadge from '@/components/PlanBadge'
import SubscriptionModal from '@/components/SubscriptionModal'
import MesAnnonces from '@/components/MesAnnonces'
import AbonnementsView from '@/components/AbonnementsView'
import MonEspaceProducteur from '@/components/MonEspaceProducteur'

type Tab = 'profil' | 'reglages'
type SubView = null | 'annonces' | 'abonnements' | 'producteur'

interface Etab { id: string; nom: string; plan: string; photos: string[] | null }
interface AbandonedDraft {
  id: string
  etablissement: { id: string; nom: string; commune: string | null; photos: string[] | null }
  updated_at: string
}

export default function ProfilView() {
  const { user, profile, loading: authLoading, signOut, updateDisplayName } = useAuth()
  const isAdmin = useAdminSession()
  const theme = useTheme()

  const [tab, setTab] = useState<Tab>('profil')
  const [subView, setSubView] = useState<SubView>(null)

  const [plan, setPlan] = useState<string | null>(null)
  const [myEtabs, setMyEtabs] = useState<Etab[]>([])
  const [interestCount, setInterestCount] = useState<number | null>(null)
  const [activeAnnonceCount, setActiveAnnonceCount] = useState<number | null>(null)
  const [followingCount, setFollowingCount] = useState<number | null>(null)
  const [abandonedDrafts, setAbandonedDrafts] = useState<AbandonedDraft[]>([])

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [supportUnread, setSupportUnread] = useState(0)

  // Compteur unread pour les tickets support (admin only)
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      const { count } = await supabase
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_is_admin', false)
        .is('lu_at', null)
      if (!cancelled && typeof count === 'number') setSupportUnread(count)
    })()
    return () => { cancelled = true }
  }, [isAdmin])

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ── Chargement des données ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    // Plan
    supabase.from('profiles').select('plan').eq('user_id', user.id).single()
      .then(({ data }) => { if (!cancelled && data) setPlan(data.plan ?? null) })

    // Établissements gérés
    supabase.from('etablissements').select('id, nom, plan, photos').eq('user_id', user.id)
      .then(({ data }) => { if (!cancelled && data) setMyEtabs(data) })

    // Compteurs (best effort — silencieux si erreur)
    supabase.from('interests').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => { if (!cancelled) setInterestCount(count ?? 0) })

    supabase.from('annonces').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('statut', 'active')
      .then(({ count }) => { if (!cancelled) setActiveAnnonceCount(count ?? 0) })

    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id)
      .then(({ count }) => { if (!cancelled) setFollowingCount(count ?? 0) })

    // Brouillons abandonnés
    ;(async () => {
      const t = await getToken()
      if (!t) return
      const r = await fetch('/api/profile/drafts', { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) return
      const d = await r.json()
      const abandoned = (d.drafts ?? []).filter((x: { managed: boolean }) => !x.managed)
      if (!cancelled) setAbandonedDrafts(abandoned)
    })()

    return () => { cancelled = true }
  }, [user?.id])

  // ── Loading / non connecté ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--creme)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ padding: '40px 20px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1A1209', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Bienvenue 👋
          </h1>
          <p style={{ fontSize: 14, color: '#7A6A5A', margin: 0, lineHeight: 1.5 }}>
            Connecte-toi pour accéder à ton espace, profiter des bons plans et participer à la vie du village.
          </p>
        </div>
        <LoginView />
      </div>
    )
  }

  // ── Sous-vue plein écran (annonces / abonnements / producteur) ─────────
  if (subView === 'annonces') {
    return <SubViewWrap title="Mes annonces" onBack={() => setSubView(null)}><MesAnnonces /></SubViewWrap>
  }
  if (subView === 'abonnements') {
    return <SubViewWrap title="Mes abonnements" onBack={() => setSubView(null)}><AbonnementsView /></SubViewWrap>
  }
  if (subView === 'producteur') {
    return <SubViewWrap title="Ma fiche producteur" onBack={() => setSubView(null)}><MonEspaceProducteur /></SubViewWrap>
  }

  const currentPlan = (plan ?? 'basic') as Plan
  const planInfo = PLANS_INFO[currentPlan]
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'Mon profil'

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  // ── Render principal ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif', paddingBottom: 40 }}>

      {/* Header avec tabs */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #EDE8E0',
      }}>
        <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: '#2C1810', margin: 0, letterSpacing: '-0.01em' }}>
            Mon espace
          </h1>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 16px', gap: 6 }}>
          {(['profil', 'reglages'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0', border: 'none',
                borderBottom: tab === t ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                backgroundColor: 'transparent',
                fontSize: 13, fontWeight: 800,
                color: tab === t ? 'var(--primary)' : '#9A8A7A',
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.02em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              {t === 'profil' ? 'Profil' : 'Réglages'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'profil' && (
          <>
            {/* Card header user */}
            <div style={{
              backgroundColor: '#fff', borderRadius: 20,
              padding: '22px 18px 18px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-light)' }} />
                : (
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    backgroundColor: 'var(--primary)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 26, fontWeight: 800,
                  }}>
                    {displayName[0].toUpperCase()}
                  </div>
                )
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingName ? (
                  <form onSubmit={async e => {
                    e.preventDefault()
                    if (!nameInput.trim()) return
                    await updateDisplayName(nameInput.trim())
                    setEditingName(false)
                  }} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      style={{ border: '1.5px solid var(--primary)', borderRadius: 8, padding: '5px 10px', fontSize: 14, fontWeight: 700, outline: 'none', flex: 1, minWidth: 0, fontFamily: 'inherit' }}
                    />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>OK</button>
                    <button type="button" onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8A8A', fontSize: 14 }}>✕</button>
                  </form>
                ) : (
                  <button
                    onClick={() => { setNameInput(profile?.display_name ?? ''); setEditingName(true) }}
                    style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1209', letterSpacing: '-0.01em' }}>
                      {displayName}
                    </span>
                    <PlanBadge plan={currentPlan} />
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B0A898" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                  </button>
                )}
                <p style={{ fontSize: 12, color: '#9A8A7A', margin: '4px 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </p>
                <Link
                  href={`/profil/${user.id}`}
                  style={{
                    display: 'inline-block',
                    fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                    backgroundColor: 'var(--primary-light)',
                    padding: '4px 10px', borderRadius: 999,
                    textDecoration: 'none',
                  }}
                >
                  Voir mon profil public →
                </Link>
              </div>
            </div>

            {/* Card Mon abonnement */}
            <Card>
              <CardLabel>💳 Mon abonnement</CardLabel>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{planInfo.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: planInfo.color }}>{planInfo.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>{planInfo.priceLabel}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowUpgrade(true)}
                style={{
                  width: '100%', padding: '11px',
                  background: currentPlan === 'basic'
                    ? 'linear-gradient(135deg, #4A8B5C 0%, #3A5BC7 100%)'
                    : 'transparent',
                  color: currentPlan === 'basic' ? '#fff' : planInfo.color,
                  border: currentPlan === 'basic' ? 'none' : `1.5px solid ${planInfo.color}`,
                  borderRadius: 12,
                  fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {currentPlan === 'basic' ? '✦ Découvrir nos offres' : 'Voir les offres / gérer'}
              </button>
            </Card>

            {/* Card Mes établissements */}
            {myEtabs.length > 0 && (
              <Card>
                <CardLabel>🏪 Mes établissements ({myEtabs.length})</CardLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myEtabs.map(e => (
                    <Link key={e.id} href={`/etablissement/${e.id}`} style={ROW_LINK}>
                      <div style={ROW_IMG}>
                        {e.photos?.[0] ? <img src={e.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18 }}>🏪</span>}
                      </div>
                      <span style={ROW_NAME}>{e.nom}</span>
                      <span style={ROW_ARROW}>›</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Card Brouillons abandonnés */}
            {abandonedDrafts.length > 0 && (
              <div style={{ backgroundColor: '#FFFBF2', borderRadius: 16, padding: '14px 16px', border: '1px solid #F0E2C0' }}>
                <CardLabel>📝 Mes brouillons abandonnés</CardLabel>
                <p style={{ fontSize: 11, color: '#7A6A5A', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Fiches que tu as gérées par le passé. Tes modifs sont gardées si tu re-revendiques.
                </p>
                {abandonedDrafts.map(d => (
                  <Link key={d.id} href={`/etablissement/${d.etablissement.id}`} style={ROW_LINK}>
                    <div style={ROW_IMG}>
                      {d.etablissement.photos?.[0] ? <img src={d.etablissement.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18 }}>🏪</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1209', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.etablissement.nom}</span>
                      <span style={{ fontSize: 10, color: '#9A8A7A' }}>Modifié {new Date(d.updated_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <span style={ROW_ARROW}>›</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Card Ma fiche producteur (pro only) */}
            {currentPlan === 'pro' && (
              <ActionCard
                icon="🌿"
                label="Ma fiche producteur"
                sub="Gère ta vitrine, tes produits, ta carte"
                onClick={() => setSubView('producteur')}
              />
            )}

            {/* Activités */}
            <Card>
              <CardLabel>📊 Mes activités</CardLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ActionRow
                  icon="📣"
                  label="Mes annonces"
                  badge={activeAnnonceCount != null ? `${activeAnnonceCount} active${activeAnnonceCount > 1 ? 's' : ''}` : ''}
                  onClick={() => setSubView('annonces')}
                />
                <ActionRow
                  icon="⭐"
                  label="Événements suivis"
                  badge={interestCount != null ? `${interestCount}` : ''}
                  onClick={() => setSubView('abonnements')}
                />
                <ActionRow
                  icon="👥"
                  label="Mes abonnements"
                  badge={followingCount != null ? `${followingCount} personne${followingCount && followingCount > 1 ? 's' : ''}` : ''}
                  onClick={() => setSubView('abonnements')}
                />
                <ActionRow
                  icon="💬"
                  label="Mes échanges support"
                  onClick={() => { window.location.href = '/support' }}
                />
                <ActionRow
                  icon="🚀"
                  label="Visibilité & boost"
                  badge={plan === 'pro' ? 'Inclus' : ''}
                  onClick={() => { window.location.href = '/profil/visibilite' }}
                />
              </div>
            </Card>

            {/* Admin */}
            {isAdmin && (
              <Link
                href="/admin"
                style={{
                  textDecoration: 'none', color: 'inherit',
                  backgroundColor: '#1A1209', borderRadius: 18, padding: '18px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                }}
              >
                <span style={{ fontSize: 24 }}>🛡️</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fff' }}>Tableau de bord admin</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Membres, demandes, scraping, inbox</p>
                </div>
                <span style={{ color: '#fff', fontSize: 18 }}>›</span>
              </Link>
            )}

            {/* Admin — Hub carousel manager */}
            {isAdmin && (
              <Link
                href="/admin/hub-carousel"
                style={{
                  textDecoration: 'none', color: 'inherit',
                  backgroundColor: '#fff', borderRadius: 18, padding: '16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  border: '1px solid #E5DDD2',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ fontSize: 22 }}>⭐</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209' }}>Hub carousel</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8A7A6A' }}>Mise en avant éditoriale</p>
                </div>
                <span style={{ color: '#8A7A6A', fontSize: 18 }}>›</span>
              </Link>
            )}

            {/* Admin — Tickets support */}
            {isAdmin && (
              <Link
                href="/admin/support"
                style={{
                  textDecoration: 'none', color: 'inherit',
                  backgroundColor: '#fff', borderRadius: 18, padding: '16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  border: '1px solid #E5DDD2',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ fontSize: 22 }}>💬</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209' }}>Tickets support</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8A7A6A' }}>Messages des utilisateurs</p>
                </div>
                {supportUnread > 0 && (
                  <span style={{
                    minWidth: 22, height: 22, borderRadius: 11,
                    backgroundColor: '#E53935', color: '#fff',
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 7px',
                  }}>{supportUnread > 99 ? '99+' : supportUnread}</span>
                )}
                <span style={{ color: '#8A7A6A', fontSize: 18 }}>›</span>
              </Link>
            )}
          </>
        )}

        {tab === 'reglages' && (
          <>
            {/* Thème */}
            <Card>
              <CardLabel>🎨 Apparence</CardLabel>

              <SectionTitle>Couleur</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
                {COLOR_THEMES.map(t => {
                  const active = theme.colorTheme.id === t.id
                  return (
                    <button key={t.id} onClick={() => theme.setColorThemeId(t.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 4px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      backgroundColor: active ? t.primaryLight : 'transparent',
                      outline: active ? `2px solid ${t.primary}` : '1.5px solid #EDE8E0',
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: t.primary }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: active ? t.primary : '#8A8A8A', textAlign: 'center' }}>{t.name}</span>
                    </button>
                  )
                })}
              </div>

              <SectionTitle>Fond de liste</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                {SHEET_BG_OPTIONS.map(opt => {
                  const active = theme.sheetBg.id === opt.id
                  return (
                    <button key={opt.id} onClick={() => theme.setSheetBgId(opt.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      backgroundColor: active ? 'var(--primary-light)' : 'transparent',
                      outline: active ? '2px solid var(--primary)' : '1.5px solid #EDE8E0',
                    }}>
                      <div style={{ width: 38, height: 22, borderRadius: 6, backgroundColor: opt.bg, border: `1px solid ${opt.border}` }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: active ? 'var(--primary)' : '#8A8A8A' }}>{opt.name}</span>
                    </button>
                  )
                })}
              </div>

              <SectionTitle>Style de carte</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MAP_STYLES.map(s => {
                  const active = theme.mapStyle.id === s.id
                  return (
                    <button key={s.id} onClick={() => theme.setMapStyleId(s.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      backgroundColor: active ? 'var(--primary-light)' : '#FBF7F0',
                      outline: active ? '2px solid var(--primary)' : '1.5px solid transparent',
                      textAlign: 'left',
                    }}>
                      <div style={{ width: 36, height: 28, borderRadius: 6, backgroundColor: s.previewBg, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: active ? 'var(--primary)' : '#2C1810' }}>{s.name}</p>
                        <p style={{ margin: '1px 0 0', fontSize: 10, color: '#8A8A8A' }}>{s.description}</p>
                      </div>
                      {active && <span style={{ color: 'var(--primary)', fontSize: 16 }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* Compte */}
            <Card>
              <CardLabel>👤 Compte</CardLabel>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                style={{
                  width: '100%', padding: '12px',
                  background: 'transparent', color: '#C0392B',
                  border: '1.5px solid #F4C9C2', borderRadius: 12,
                  fontSize: 13, fontWeight: 800, cursor: signingOut ? 'default' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                🚪 {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
              </button>
            </Card>

            {/* Footer info */}
            <div style={{ textAlign: 'center', padding: '12px 16px', fontSize: 10, color: '#9A8A7A', lineHeight: 1.6 }}>
              La Place du Village<br />
              Fait avec ❤️ à Ganges
            </div>
          </>
        )}

      </div>

      {showUpgrade && (
        <SubscriptionModal
          context={{ kind: 'generic' }}
          onClose={() => setShowUpgrade(false)}
          currentPlan={currentPlan}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers visuels
// ────────────────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 18, padding: '16px 18px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      {children}
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 800, color: '#7A6A5A',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      margin: '0 0 12px',
    }}>{children}</p>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 12, fontWeight: 700, color: '#3C2C20',
      margin: '4px 0 8px',
    }}>{children}</p>
  )
}

function ActionRow({
  icon, label, badge, onClick,
}: { icon: string; label: string; badge?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 4px', border: 'none', background: 'transparent',
        cursor: 'pointer', borderTop: '1px solid #F5F0E8',
        fontFamily: 'inherit', textAlign: 'left', width: '100%',
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1A1209' }}>{label}</span>
      {badge && <span style={{ fontSize: 11, fontWeight: 700, color: '#7A6A5A', backgroundColor: '#F0EBE0', padding: '3px 9px', borderRadius: 999 }}>{badge}</span>}
      <span style={{ color: '#C8B8A8', fontSize: 18 }}>›</span>
    </button>
  )
}

function ActionCard({
  icon, label, sub, onClick,
}: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px', backgroundColor: '#fff',
        border: 'none', borderRadius: 18, cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
        fontFamily: 'inherit', textAlign: 'left', width: '100%',
      }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>{sub}</p>
      </div>
      <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
    </button>
  )
}

function SubViewWrap({
  title, onBack, children,
}: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #EDE8E0',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
          border: 'none', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2C1810', flex: 1 }}>{title}</h1>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Styles partagés
// ────────────────────────────────────────────────────────────────────────────

const ROW_LINK: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 4px', borderRadius: 10,
  textDecoration: 'none', color: 'inherit',
}

const ROW_IMG: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10,
  overflow: 'hidden', flexShrink: 0,
  backgroundColor: '#E8F2EB',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const ROW_NAME: React.CSSProperties = {
  flex: 1, fontSize: 13, fontWeight: 700, color: '#1A1209',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const ROW_ARROW: React.CSSProperties = { color: '#C8B8A8', fontSize: 18, flexShrink: 0 }
