'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/components/ThemeProvider'
import { COLOR_THEMES, MAP_STYLES, SHEET_BG_OPTIONS } from '@/lib/themes'
import AdminAccess from '@/components/AdminAccess'
import MonEspaceProducteur from '@/components/MonEspaceProducteur'
import { supabase } from '@/lib/supabase'

type Tab = 'profil' | 'theme' | 'producteur'

export default function ProfilPage() {
  const [tab, setTab] = useState<Tab>('theme')
  const [plan, setPlan] = useState<string | null>(null)
  const { user, profile } = useAuth()
  const { colorTheme, mapStyle, sheetBg, setColorThemeId, setMapStyleId, setSheetBgId } = useTheme()

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('plan').eq('user_id', user.id).single()
      .then(({ data: p, error }) => { console.log('plan fetch result:', p, error); if (p) setPlan(p.plan ?? null) })
  }, [user?.id])

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Link href="/" style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none', color: 'var(--primary)', fontSize: 18, fontWeight: 700,
        }}>←</Link>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', margin: 0, flex: 1 }}>
          Mon espace
        </h1>
      </div>

      <p style={{ margin: '8px 16px', fontSize: 12, color: '#999' }}>DEBUG plan: {plan ?? 'null'}</p>

      {/* Onglets */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 8, overflowX: 'auto' }}>
        {(['profil', 'theme', ...(plan === 'max' ? ['producteur'] : [])] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
            backgroundColor: tab === t ? 'var(--primary)' : '#EDE8E0',
            color: tab === t ? '#fff' : '#6B6B6B',
            transition: 'all 0.15s',
          }}>
            {t === 'profil' ? 'Profil' : t === 'theme' ? 'Thème' : '🌿 Ma fiche'}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ padding: '20px 16px 40px' }}>

        {tab === 'profil' && (
          user ? (
            <Link href={`/profil/${user.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 16, padding: '16px', marginTop: 8 }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
                    {(profile?.display_name || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: '#2C1810', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile?.display_name || user.email?.split('@')[0] || 'Mon profil'}
                  </p>
                </div>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Voir et modifier mon profil →</p>
              </div>
            </Link>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 24 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </div>
              <p style={{ fontSize: 14, color: '#8A8A8A', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>Connecte-toi pour accéder à ton profil.</p>
            </div>
          )
        )}

        {tab === 'producteur' && <MonEspaceProducteur />}

        {tab === 'theme' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* ── Couleur ── */}
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

            {/* ── Fond de liste ── */}
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
                      {/* Pastille preview */}
                      <div style={{
                        width: 44, height: 28, borderRadius: 8,
                        backgroundColor: opt.bg,
                        border: `1px solid ${opt.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 3,
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

            {/* ── Style de carte ── */}
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
                      transition: 'all 0.15s',
                      textAlign: 'left',
                    }}>
                      {/* Pastille de prévisualisation */}
                      <div style={{
                        width: 52, height: 40, borderRadius: 10, flexShrink: 0,
                        backgroundColor: style.previewBg,
                        overflow: 'hidden', position: 'relative',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                      }}>
                        {/* Mini routes dessinées */}
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
      <AdminAccess />
    </div>
  )
}
