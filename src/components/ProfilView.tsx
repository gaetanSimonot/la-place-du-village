'use client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { COLOR_THEMES, MAP_STYLES, SHEET_BG_OPTIONS } from '@/lib/themes'
import LoginView from '@/components/LoginView'
import { useAuth } from '@/hooks/useAuth'
import { useAdminSession } from '@/hooks/useAdminSession'
import Link from 'next/link'
import AbonnementsView from '@/components/AbonnementsView'
import MonEspaceProducteur from '@/components/MonEspaceProducteur'
import { supabase } from '@/lib/supabase'

type Tab = 'profil' | 'abonnements' | 'theme' | 'producteur'

export default function ProfilView() {
  const [tab, setTab] = useState<Tab>('profil')
  const [plan, setPlan] = useState<string | null>(null)
  const { colorTheme, mapStyle, sheetBg, setColorThemeId, setMapStyleId, setSheetBgId } = useTheme()
  const { user, profile, loading, signOut, updateDisplayName } = useAuth()
  const isAdmin = useAdminSession()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('plan').eq('user_id', user.id).single()
      .then(({ data: p }) => { if (p) setPlan(p.plan ?? null) })
  }, [user?.id])

  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center',
      }}>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', margin: 0 }}>
          Mon espace
        </h1>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 8, overflowX: 'auto' }}>
        {([
          { id: 'profil', label: 'Profil' },
          { id: 'abonnements', label: 'Suivis' },
          { id: 'theme', label: 'Thème' },
          ...(plan === 'max' ? [{ id: 'producteur', label: '🌿 Ma fiche' }] : []),
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13,
            backgroundColor: tab === t.id ? 'var(--primary)' : '#EDE8E0',
            color: tab === t.id ? '#fff' : '#6B6B6B',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ padding: '20px 16px 40px' }}>

        {tab === 'profil' && (
          <>
            {/* Chargement */}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}

            {/* Non connecté */}
            {!loading && !user && <LoginView />}

            {/* Connecté */}
            {!loading && user && (
              <div style={{ paddingTop: 8 }}>

                {/* Carte profil */}
                <div style={{
                  backgroundColor: '#fff', borderRadius: 20,
                  padding: '24px 20px', marginBottom: 16,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                }}>
                  {/* Avatar */}
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-light)' }} />
                    : (
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        backgroundColor: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, fontWeight: 800, fontFamily: 'Inter, sans-serif',
                      }}>
                        {(profile?.display_name ?? user.email ?? '?')[0].toUpperCase()}
                      </div>
                    )
                  }

                  {/* Nom — cliquable pour modifier */}
                  {editingName
                    ? (
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
                          style={{ border: '1.5px solid var(--primary)', borderRadius: 10, padding: '6px 12px', fontSize: 15, fontWeight: 700, outline: 'none', fontFamily: 'Inter, sans-serif', color: '#2C1810', width: 160 }}
                        />
                        <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>OK</button>
                        <button type="button" onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8A8A', fontSize: 13 }}>✕</button>
                      </form>
                    )
                    : (
                      <button onClick={() => { setNameInput(profile?.display_name ?? ''); setEditingName(true) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 18, color: '#1A1209', letterSpacing: '-0.02em' }}>
                          {profile?.display_name ?? user.email?.split('@')[0] ?? 'Mon profil'}
                        </span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B0A898" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )
                  }

                  <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0 }}>{profile?.email ?? user.email}</p>


                  <Link href={`/profil/${user.id}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 18px', borderRadius: 999,
                    backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
                    fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    fontFamily: 'Inter, sans-serif',
                  }}>
                    Voir mon profil →
                  </Link>
                </div>

                {/* Bouton admin — visible uniquement pour les admins */}
                {isAdmin && (
                  <Link href="/admin" prefetch={false} style={{ textDecoration: 'none', width: '100%' }}>
                    <div style={{
                      width: '100%', padding: '13px', borderRadius: 14, marginBottom: 10,
                      backgroundColor: 'var(--primary-light)', border: '1.5px solid var(--primary)',
                      color: 'var(--primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      ⚙️ Tableau de bord admin
                    </div>
                  </Link>
                )}

                {/* Bouton déconnexion */}
                <button
                  onClick={signOut}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 14,
                    backgroundColor: 'transparent', border: '1.5px solid #E0D8CE',
                    color: '#8A8A8A', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Se déconnecter
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'producteur' && <MonEspaceProducteur />}

        {tab === 'abonnements' && (
          <div style={{ margin: '0 -16px' }}>
            <AbonnementsView />
          </div>
        )}

        {tab === 'theme' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            <section>
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', marginBottom: 12 }}>
                Couleur
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {COLOR_THEMES.map(theme => {
                  const isActive = colorTheme.id === theme.id
                  return (
                    <button key={theme.id} onClick={() => setColorThemeId(theme.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '10px 6px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      backgroundColor: isActive ? theme.primaryLight : 'transparent',
                      outline: isActive ? `2px solid ${theme.primary}` : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        backgroundColor: theme.primary,
                        boxShadow: isActive ? `0 0 0 3px #fff, 0 0 0 5px ${theme.primary}` : '0 2px 6px rgba(0,0,0,0.15)',
                        transition: 'all 0.15s',
                      }} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: isActive ? theme.primary : '#8A8A8A',
                        fontFamily: 'Inter, sans-serif', textAlign: 'center', lineHeight: 1.2,
                      }}>{theme.name}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', marginBottom: 4 }}>
                Fond de liste
              </h2>
              <p style={{ fontSize: 12, color: '#8A8A8A', marginBottom: 12 }}>Couleur du panneau d&apos;événements</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {SHEET_BG_OPTIONS.map(opt => {
                  const isActive = sheetBg.id === opt.id
                  return (
                    <button key={opt.id} onClick={() => setSheetBgId(opt.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '10px 8px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      backgroundColor: isActive ? 'var(--primary-light)' : 'transparent',
                      outline: isActive ? '2px solid var(--primary)' : '2px solid #EDE8E0',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{
                        width: 44, height: 28, borderRadius: 8,
                        backgroundColor: opt.bg,
                        border: `1px solid ${opt.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                      }}>
                        <div style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: opt.text, opacity: 0.7 }} />
                        <div style={{ width: 10, height: 4, borderRadius: 2, backgroundColor: opt.sub, opacity: 0.5 }} />
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: isActive ? 'var(--primary)' : '#8A8A8A',
                        fontFamily: 'Inter, sans-serif',
                      }}>{opt.name}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', marginBottom: 12 }}>
                Style de carte
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MAP_STYLES.map(style => {
                  const isActive = mapStyle.id === style.id
                  return (
                    <button key={style.id} onClick={() => setMapStyleId(style.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px', borderRadius: 16, border: 'none', cursor: 'pointer',
                      backgroundColor: isActive ? 'var(--primary-light)' : '#fff',
                      outline: isActive ? '2px solid var(--primary)' : '2px solid #EDE8E0',
                      transition: 'all 0.15s', textAlign: 'left',
                    }}>
                      <div style={{
                        width: 52, height: 40, borderRadius: 10, flexShrink: 0,
                        backgroundColor: style.previewBg, overflow: 'hidden', position: 'relative',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                      }}>
                        <svg width="52" height="40" viewBox="0 0 52 40" style={{ position: 'absolute', inset: 0 }}>
                          <line x1="0" y1="24" x2="52" y2="22" stroke="rgba(255,255,255,0.45)" strokeWidth="3"/>
                          <line x1="10" y1="0" x2="16" y2="40" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
                          <line x1="32" y1="0" x2="36" y2="40" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14,
                          color: isActive ? 'var(--primary)' : '#2C2C2C', margin: '0 0 2px',
                        }}>{style.name}</p>
                        <p style={{ fontSize: 12, color: '#8A8A8A', margin: 0, fontFamily: 'Inter, sans-serif' }}>
                          {style.description}
                        </p>
                      </div>
                      {isActive && (
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          backgroundColor: 'var(--primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                            <path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

          </div>
        )}
      </div>

      {/* Popup upgrade */}
      {showUpgrade && (
        <div onClick={() => setShowUpgrade(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#fff', borderRadius: '24px 24px 0 0',
            padding: '32px 24px 48px', width: '100%', maxWidth: 480,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <p style={{ fontSize: 44, margin: 0 }}>🌟</p>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 22, color: '#1A1209', margin: 0, textAlign: 'center' }}>
              Passer à Premium
            </h2>
            <p style={{ fontSize: 14, color: '#6B5E4E', fontFamily: 'Lora, serif', lineHeight: 1.6, textAlign: 'center', margin: 0, maxWidth: 300 }}>
              Les abonnements Premium arrivent bientôt ! Tu seras notifié dès que la fonctionnalité sera disponible.
            </p>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: '#EC407A', backgroundColor: '#FEF0F5',
              borderRadius: 999, padding: '4px 14px', fontFamily: 'Inter, sans-serif',
              marginTop: 4,
            }}>À venir</span>
            <button onClick={() => setShowUpgrade(false)} style={{
              marginTop: 12, width: '100%', padding: '15px', borderRadius: 999,
              backgroundColor: 'var(--primary)', color: '#fff',
              fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}>Compris</button>
          </div>
        </div>
      )}
    </div>
  )
}
