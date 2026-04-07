'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/components/ThemeProvider'
import { COLOR_THEMES, MAP_STYLES } from '@/lib/themes'
import AdminAccess from '@/components/AdminAccess'

type Tab = 'profil' | 'theme'

export default function ProfilPage() {
  const [tab, setTab] = useState<Tab>('theme')
  const { colorTheme, mapStyle, setColorThemeId, setMapStyleId } = useTheme()

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
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', margin: 0, flex: 1 }}>
          Mon espace
        </h1>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 8 }}>
        {(['profil', 'theme'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13,
            backgroundColor: tab === t ? 'var(--primary)' : '#EDE8E0',
            color: tab === t ? '#fff' : '#6B6B6B',
            transition: 'all 0.15s',
          }}>
            {t === 'profil' ? 'Profil' : 'Thème'}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ padding: '20px 16px 40px' }}>

        {tab === 'profil' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 24 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              backgroundColor: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, color: '#2C1810', margin: 0 }}>
              Mon profil
            </h2>
            <p style={{ fontSize: 14, color: '#8A8A8A', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
              Les comptes arrivent bientôt.<br/>Tu pourras suivre tes événements favoris.
            </p>
          </div>
        )}

        {tab === 'theme' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* ── Couleur ── */}
            <section>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', marginBottom: 12 }}>
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

            {/* ── Style de carte ── */}
            <section>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', marginBottom: 12 }}>
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
                          fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
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
