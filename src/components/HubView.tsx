'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { toUserContext, PLANS_INFO, type Plan } from '@/lib/capabilities'
import type { EtablissementType } from '@/lib/types'

/**
 * Écran d'accueil (hub) — inspiré de ref/hub.png.
 *
 * Structure :
 *   1. Header — Bonjour + titre + cloche notif
 *   2. Hero promo (large card avec image/gradient + CTA)
 *   3. Section "Mes indispensables" — carrousel horizontal scrollable
 *   4. Encart "Exclusif abonnés" — 2 tuiles gatées Pro/Max
 *   5. Card large "Découvrir le territoire"
 *
 * Tuile = simple objet config dans le tableau. Ajouter une tuile = ajouter
 * une ligne dans le bon tableau (indispensables / exclusifAbonnes).
 */

interface IndispensableTile {
  id: string
  label: string
  sublabel?: string
  icon: string                                // chemin vers PNG (ou emoji fallback)
  isEmoji?: boolean                           // true si icon est un emoji, false = chemin image
  bg?: string                                 // fond pastel si emoji (icônes PNG ont déjà leur fond)
  onSelect: () => void
}

interface ExclusiveTile {
  id: string
  badge: string                               // ex: "PROMOTIONS LOCALES"
  title: string
  subtitle: string
  cta: string
  icon: string                                // chemin PNG ou emoji
  isEmoji?: boolean
  color: string                               // accent de la carte
  bg: string                                  // fond
  requiredPlan: 'pro' | 'max'
  comingSoon?: boolean
}

interface Props {
  onSelectAgenda:        () => void
  onSelectAnnuaire:      (typeFilter?: EtablissementType) => void
  onSelectProducteurs:   () => void
  onComingSoon:          (label: string) => void
  onUpgradePrompt:       (requiredPlan: 'pro' | 'max', label: string) => void
  onOpenNotifs?:         () => void
  unreadCount?:          number
}

export default function HubView({
  onSelectAgenda, onSelectAnnuaire, onSelectProducteurs,
  onComingSoon, onUpgradePrompt, onOpenNotifs,
  unreadCount = 0,
}: Props) {
  const router = useRouter()
  const { user, profile, isAdmin } = useAuth()
  const ctx = toUserContext(profile, isAdmin)

  // ── Tuiles "Mes indispensables" — carrousel horizontal ───────────────────
  const indispensables: IndispensableTile[] = [
    { id: 'agenda',       label: 'Agenda',      sublabel: 'culturel',     icon: '/icones/01_agenda_culturel.png',         onSelect: onSelectAgenda },
    { id: 'annuaire',     label: 'Annuaire',    sublabel: 'pro',          icon: '/icones/02_annuaire_professionnel.png',  onSelect: () => onSelectAnnuaire() },
    { id: 'producteurs',  label: 'Producteurs', sublabel: 'vente libre',  icon: '/icones/05_producteurs_vente_libre.png', onSelect: onSelectProducteurs },
    { id: 'restos',       label: 'Restos',      sublabel: '& bars',       icon: '/icones/03_restos_bars.png',             onSelect: () => onSelectAnnuaire('restaurant_bar') },
    { id: 'hebergements', label: 'Hébergements',                          icon: '/icones/12_hebergements.png',            onSelect: () => onSelectAnnuaire('hebergement') },
    { id: 'bien-etre',    label: 'Bien-être',   sublabel: 'santé',        icon: '/icones/04_bien_etre.png',               onSelect: () => onSelectAnnuaire('sante_bien_etre') },
    { id: 'mobilite',     label: 'Mobilité',    sublabel: 'transport',    icon: '/icones/13_mobilite.png',                onSelect: () => onComingSoon('Mobilité & transport') },
    { id: 'associations', label: 'Assos',       sublabel: '& clubs',      icon: '/icones/10_associations_clubs.png',      onSelect: () => onComingSoon('Associations & clubs') },
    { id: 'annonces',     label: 'Annonces',    sublabel: 'locales',      icon: '/icones/07_annonces_locales.png',        onSelect: () => onComingSoon('Annonces locales') },
    { id: 'idees',        label: 'Boîte',       sublabel: 'à idées',      icon: '/icones/09_boite_idees.png',             onSelect: () => onComingSoon('Boîte à idées') },
    { id: 'commerces',    label: 'Commerces',   sublabel: 'e-commerce',   icon: '/icones/06_commerces_ecommerce.png',     onSelect: () => onComingSoon('Commerces & e-commerce') },
  ]

  // ── Tuiles "Exclusif abonnés" ─────────────────────────────────────────────
  const exclusiveTiles: ExclusiveTile[] = [
    {
      id: 'promotions',
      badge: 'PROMOTIONS LOCALES',
      title: 'Des offres rien que pour vous',
      subtitle: 'Chez vos commerçants partenaires',
      cta: 'Voir les offres',
      icon: '/icones/11_promotions_locales.png',
      color: '#C4622D',
      bg: '#FFF0E5',
      requiredPlan: 'pro',
    },
    {
      id: 'encheres',
      badge: 'ENCHÈRES À VENIR',
      title: 'Faites de bonnes affaires',
      subtitle: 'Près de chez vous',
      cta: 'Découvrir',
      icon: '/icones/08_encheres_envers.png',
      color: '#3A5BC7',
      bg: '#EEF3FF',
      requiredPlan: 'max',
      comingSoon: true,
    },
  ]

  const hasAccess = (requiredPlan: 'pro' | 'max'): boolean => {
    if (isAdmin) return true
    if (requiredPlan === 'pro') return ctx.plan === 'pro' || ctx.plan === 'max'
    return ctx.plan === 'max'
  }

  const handleExclusiveClick = (tile: ExclusiveTile) => {
    if (!hasAccess(tile.requiredPlan)) {
      onUpgradePrompt(tile.requiredPlan, tile.title)
      return
    }
    onComingSoon(tile.title)
  }

  return (
    <div style={{
      minHeight: '100%',
      backgroundColor: 'var(--creme)',
      fontFamily: 'Inter, sans-serif',
      paddingBottom: 16,
    }}>

      <style>{`
        .pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .pdv-hscroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          {profile?.display_name && (
            <p style={{ fontSize: 13, color: '#7A6A5A', margin: '0 0 4px', fontWeight: 600 }}>
              Bonjour <span style={{ color: 'var(--primary)' }}>{profile.display_name}</span> 👋
            </p>
          )}
          <h1 style={{
            fontSize: 22, fontWeight: 800,
            color: '#1A1209', margin: '0 0 2px',
            letterSpacing: '-0.02em',
          }}>
            La Place du Village
          </h1>
          <p style={{
            fontSize: 12, color: '#7A6A5A', margin: 0,
            fontFamily: 'Lora, serif', fontStyle: 'italic',
          }}>
            Tout le village, à portée de main
          </p>
        </div>

        {user && onOpenNotifs && (
          <button
            onClick={onOpenNotifs}
            style={{
              position: 'relative', background: 'none', border: 'none',
              cursor: 'pointer', padding: 6, color: '#3C2C20',
            }}
            aria-label="Notifications"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2,
                minWidth: 17, height: 17, borderRadius: 9,
                backgroundColor: '#E53935', color: '#fff',
                fontSize: 9, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', border: '1.5px solid var(--creme)',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── 2. Hero Promo ──────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 22px' }}>
        <button
          onClick={() => router.push('/promotions')}
          style={{
            width: '100%', border: 'none', cursor: 'pointer',
            padding: 0, borderRadius: 22, overflow: 'hidden',
            position: 'relative', minHeight: 150,
            background: 'linear-gradient(135deg, #1A3A2A 0%, #2D5A3D 60%, #3F7A52 100%)',
            boxShadow: '0 4px 18px rgba(45,90,61,0.18)',
            fontFamily: 'Inter, sans-serif',
            textAlign: 'left',
          }}
        >
          {/* Décorations background */}
          <div style={{ position: 'absolute', right: -20, top: -20, width: 140, height: 140, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', right: 40, bottom: 16, fontSize: 64, opacity: 0.15 }}>🍷</div>

          <div style={{ position: 'relative', padding: '18px 18px 16px', color: '#fff' }}>
            <span style={{
              display: 'inline-block', fontSize: 9, fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              backgroundColor: 'rgba(255,255,255,0.18)', padding: '3px 10px',
              borderRadius: 999, marginBottom: 10, backdropFilter: 'blur(4px)',
            }}>
              ✨ Nouveau
            </span>
            <p style={{
              fontSize: 18, fontWeight: 800, margin: '0 0 6px',
              letterSpacing: '-0.02em', maxWidth: '70%',
            }}>
              Vos avantages près de chez vous
            </p>
            <p style={{
              fontSize: 12, color: 'rgba(255,255,255,0.82)',
              margin: '0 0 14px', maxWidth: '75%', lineHeight: 1.4,
            }}>
              Profitez d&apos;offres exclusives chez vos commerçants locaux
            </p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, color: '#fff',
              backgroundColor: 'rgba(255,255,255,0.22)',
              padding: '8px 16px', borderRadius: 999,
              backdropFilter: 'blur(8px)',
            }}>
              Découvrir les promos →
            </span>
          </div>
        </button>
      </div>

      {/* ── 3. Mes indispensables — Carrousel horizontal ────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <p style={{
          fontSize: 14, fontWeight: 800, color: '#2C1810',
          margin: '0 16px 12px', letterSpacing: '-0.01em',
        }}>
          Mes indispensables
        </p>
        <div
          className="pdv-hscroll"
          style={{
            display: 'flex', gap: 10, overflowX: 'auto',
            padding: '4px 16px', scrollSnapType: 'x mandatory',
          }}
        >
          {indispensables.map(tile => (
            <button
              key={tile.id}
              onClick={tile.onSelect}
              style={{
                flexShrink: 0, width: 86,
                backgroundColor: '#fff', border: 'none',
                borderRadius: 16, padding: '10px 6px 10px',
                boxShadow: '0 1px 5px rgba(0,0,0,0.06)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                fontFamily: 'Inter, sans-serif',
                scrollSnapAlign: 'start',
                transition: 'transform 0.12s',
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {tile.isEmoji ? (
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  backgroundColor: tile.bg ?? '#F5EFE5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                }}>
                  {tile.icon}
                </div>
              ) : (
                <img
                  src={tile.icon}
                  alt={tile.label}
                  width={56}
                  height={56}
                  style={{ display: 'block', objectFit: 'contain' }}
                />
              )}
              <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#1A1209', margin: 0 }}>
                  {tile.label}
                </p>
                {tile.sublabel && (
                  <p style={{ fontSize: 9, color: '#7A6A5A', margin: '1px 0 0' }}>
                    {tile.sublabel}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Exclusif abonnés ────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 22px' }}>
        <div style={{
          backgroundColor: '#FFFBF2',
          border: '1px solid #F0E2C0',
          borderRadius: 20,
          padding: '16px 14px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>👑</span>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#8B6914', margin: 0, letterSpacing: '-0.01em' }}>
                Exclusif abonnés
              </p>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
              color: PLANS_INFO.max.color, backgroundColor: PLANS_INFO.max.bgColor,
              padding: '3px 8px', borderRadius: 999,
            }}>
              {PLANS_INFO.max.icon} {PLANS_INFO.max.label.toUpperCase()}
            </span>
          </div>

          <p style={{ fontSize: 11, color: '#7A6A5A', margin: '0 4px 12px', lineHeight: 1.5 }}>
            Débloquez tout le potentiel de votre village
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {exclusiveTiles.map(tile => {
              const access = hasAccess(tile.requiredPlan)
              const planInfo = PLANS_INFO[tile.requiredPlan as Plan]
              return (
                <button
                  key={tile.id}
                  onClick={() => handleExclusiveClick(tile)}
                  style={{
                    backgroundColor: tile.bg, border: 'none',
                    borderRadius: 16, padding: '12px 12px 14px',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'column',
                    fontFamily: 'Inter, sans-serif',
                    position: 'relative', minHeight: 150,
                    opacity: access ? 1 : 0.85,
                    transition: 'transform 0.12s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {/* Lock badge si pas accès */}
                  {!access && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      fontSize: 9, fontWeight: 800,
                      backgroundColor: planInfo.color, color: '#fff',
                      padding: '3px 7px', borderRadius: 999,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      🔒 {planInfo.label}
                    </span>
                  )}

                  {tile.isEmoji ? (
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{tile.icon}</div>
                  ) : (
                    <img
                      src={tile.icon}
                      alt={tile.title}
                      width={56}
                      height={56}
                      style={{ display: 'block', marginBottom: 8, objectFit: 'contain' }}
                    />
                  )}

                  <p style={{
                    fontSize: 8, fontWeight: 800, color: tile.color,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    margin: '0 0 4px',
                  }}>
                    {tile.badge}
                  </p>
                  <p style={{
                    fontSize: 13, fontWeight: 800, color: '#1A1209',
                    margin: '0 0 4px', lineHeight: 1.25, letterSpacing: '-0.01em',
                  }}>
                    {tile.title}
                  </p>
                  <p style={{
                    fontSize: 10, color: '#7A6A5A', margin: '0 0 10px',
                    lineHeight: 1.4, flex: 1,
                  }}>
                    {tile.subtitle}
                  </p>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 800,
                    color: '#fff', backgroundColor: tile.color,
                    padding: '5px 11px', borderRadius: 999,
                    alignSelf: 'flex-start',
                  }}>
                    {tile.cta} →
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 5. Découvrir le territoire ──────────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px' }}>
        <p style={{
          fontSize: 14, fontWeight: 800, color: '#2C1810',
          margin: '0 0 10px', letterSpacing: '-0.01em',
        }}>
          Découvrir le territoire
        </p>
        <button
          onClick={() => onComingSoon('Découvrir le territoire')}
          style={{
            width: '100%', border: 'none', cursor: 'pointer',
            padding: '14px 16px', borderRadius: 18, overflow: 'hidden',
            background: 'linear-gradient(135deg, #E8F2EB 0%, #C7DCC9 100%)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            position: 'relative', minHeight: 90,
            display: 'flex', alignItems: 'center', gap: 14,
            fontFamily: 'Inter, sans-serif', textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 40, flexShrink: 0 }}>🏞️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#1A3A2A', margin: '0 0 3px', letterSpacing: '-0.01em' }}>
              Balades, patrimoine, villages…
            </p>
            <p style={{ fontSize: 11, color: '#3F7A52', margin: 0, lineHeight: 1.4 }}>
              Explorez tout ce que notre territoire a à vous offrir
            </p>
          </div>
          <span style={{ color: '#3F7A52', fontSize: 20, flexShrink: 0 }}>›</span>
        </button>
      </div>

    </div>
  )
}
