'use client'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { toUserContext, PLANS_INFO, type Plan } from '@/lib/capabilities'

/**
 * Écran d'accueil (hub) — tuiles d'accès aux modules.
 *
 * 3 statuts par tuile :
 *   - `live`        : module fonctionnel, on entre dedans
 *   - `coming_soon` : tuile cliquable, ouvre une modale "Bientôt disponible"
 *   - gated         : si requiredPlan défini, on check via can() ;
 *                     si pas d'accès → badge + modale "Abonnement requis"
 *
 * Admin override : un admin a accès à tout (via can()).
 */

type TileStatus = 'live' | 'coming_soon'

interface Tile {
  id: string
  label: string
  sublabel?: string
  emoji: string
  color: string
  status: TileStatus
  requiredPlan?: 'pro' | 'max'   // si défini, gate l'accès au plan ou +
}

interface Props {
  onSelectAgenda:        () => void
  onSelectAnnuaire:      () => void
  onSelectProducteurs:   () => void
  onComingSoon:          (label: string) => void
  onUpgradePrompt:       (requiredPlan: 'pro' | 'max', label: string) => void
  onOpenNotifs?:         () => void
}

export default function HubView({
  onSelectAgenda, onSelectAnnuaire, onSelectProducteurs,
  onComingSoon, onUpgradePrompt, onOpenNotifs,
}: Props) {
  const { user, profile, isAdmin } = useAuth()
  const { unreadCount } = useNotifications()

  const ctx = toUserContext(profile, isAdmin)

  const tiles: Tile[] = [
    // Modules fonctionnels — gratuits
    { id: 'agenda',      label: 'Agenda',      sublabel: 'culturel',      emoji: '📅', color: '#E8F2EB', status: 'live' },
    { id: 'annuaire',    label: 'Annuaire',    sublabel: 'pro',           emoji: '🏪', color: '#FEF0F5', status: 'live' },
    { id: 'producteurs', label: 'Producteurs', sublabel: 'vente libre',   emoji: '🌿', color: '#FFF0EB', status: 'live' },
    // Modules à venir — gratuits (pages)
    { id: 'annonces',    label: 'Annonces',    sublabel: 'locales',       emoji: '📢', color: '#FFF7E5', status: 'coming_soon' },
    { id: 'hebergements',label: 'Hébergements',sublabel: '',              emoji: '🛏️', color: '#EEF3FF', status: 'coming_soon' },
    { id: 'mobilite',    label: 'Mobilité',    sublabel: 'transport',     emoji: '🚌', color: '#E5F4FF', status: 'coming_soon' },
    { id: 'associations',label: 'Assos',       sublabel: '& clubs',       emoji: '🤝', color: '#F0EBFF', status: 'coming_soon' },
    { id: 'idees',       label: 'Boîte',       sublabel: 'à idées',       emoji: '💡', color: '#FFF9E0', status: 'coming_soon' },
    // Modules à venir — Pro/Max
    { id: 'commerces',   label: 'Commerces',   sublabel: 'e-commerce',    emoji: '🛍️', color: '#FFEEF8', status: 'coming_soon', requiredPlan: 'pro' },
    { id: 'promotions',  label: 'Promotions',  sublabel: 'offres pro',    emoji: '🎯', color: '#FFE8DD', status: 'coming_soon', requiredPlan: 'max' },
  ]

  const hasAccess = (tile: Tile): boolean => {
    if (isAdmin) return true
    if (!tile.requiredPlan) return true
    // Pro débloque pro+max ; Max ne débloque que max
    if (tile.requiredPlan === 'pro') return ctx.plan === 'pro' || ctx.plan === 'max'
    if (tile.requiredPlan === 'max') return ctx.plan === 'max'
    return false
  }

  const handleClick = (tile: Tile) => {
    // Gating premier : requiredPlan
    if (tile.requiredPlan && !hasAccess(tile)) {
      onUpgradePrompt(tile.requiredPlan, `${tile.label} ${tile.sublabel ?? ''}`.trim())
      return
    }
    // Routing
    if (tile.id === 'agenda')      return onSelectAgenda()
    if (tile.id === 'annuaire')    return onSelectAnnuaire()
    if (tile.id === 'producteurs') return onSelectProducteurs()
    // Sinon : coming soon
    onComingSoon(`${tile.label} ${tile.sublabel ?? ''}`.trim())
  }

  return (
    <div style={{
      minHeight: '100%',
      backgroundColor: 'var(--creme)',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Header — titre + cloche notif */}
      <div style={{ padding: '20px 20px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 24,
            fontWeight: 800,
            color: '#1A1209',
            margin: '0 0 4px',
            letterSpacing: '-0.02em',
          }}>
            La Place du Village
          </h1>
          <p style={{
            fontSize: 13,
            color: '#7A6A5A',
            margin: 0,
            fontFamily: 'Lora, serif',
            fontStyle: 'italic',
          }}>
            Tout le village, à portée de main
          </p>
        </div>

        {user && onOpenNotifs && (
          <button
            onClick={onOpenNotifs}
            style={{
              position: 'relative',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              color: '#3C2C20',
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

      {/* Grille des tuiles */}
      <div style={{
        flex: 1,
        padding: '0 16px 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        alignContent: 'flex-start',
      }}>
        {tiles.map(tile => {
          const access = hasAccess(tile)
          const dimmed = !access // tuile gatée et pas d'accès → grisée
          const planInfo = tile.requiredPlan ? PLANS_INFO[tile.requiredPlan as Plan] : null

          return (
            <button
              key={tile.id}
              onClick={() => handleClick(tile)}
              style={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: 18,
                padding: '14px 8px 12px',
                boxShadow: '0 1px 5px rgba(0,0,0,0.06)',
                cursor: 'pointer',
                opacity: dimmed ? 0.55 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                transition: 'transform 0.12s, box-shadow 0.12s',
                minHeight: 110,
                fontFamily: 'Inter, sans-serif',
                position: 'relative',
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{
                width: 50,
                height: 50,
                borderRadius: 12,
                backgroundColor: tile.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                flexShrink: 0,
                filter: dimmed ? 'grayscale(0.5)' : 'none',
              }}>
                {tile.emoji}
              </div>
              <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1209', margin: 0 }}>
                  {tile.label}
                </p>
                {tile.sublabel && (
                  <p style={{ fontSize: 10, color: '#7A6A5A', margin: '2px 0 0' }}>
                    {tile.sublabel}
                  </p>
                )}
              </div>

              {/* Badge plan requis (Pro/Max) */}
              {tile.requiredPlan && planInfo && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: 9, fontWeight: 800,
                  backgroundColor: planInfo.bgColor, color: planInfo.color,
                  padding: '2px 6px', borderRadius: 999,
                  display: 'flex', alignItems: 'center', gap: 2,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {planInfo.icon} {planInfo.label}
                </span>
              )}

              {/* Badge "Bientôt" pour les modules pas encore live ET non gatés */}
              {tile.status === 'coming_soon' && !tile.requiredPlan && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: 8, fontWeight: 800,
                  backgroundColor: '#F5EFD6', color: '#8B6914',
                  padding: '2px 6px', borderRadius: 999,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Bientôt
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Footer accroche */}
      <div style={{
        margin: '0 16px 16px',
        padding: '16px 18px',
        backgroundColor: '#FFFBF2',
        borderRadius: 18,
        border: '1px solid #F0E7D5',
      }}>
        <p style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#3C2C20',
          margin: '0 0 4px',
        }}>
          {profile?.display_name ? `Bonjour ${profile.display_name}` : 'Restez connecté à votre village'}
        </p>
        <p style={{
          fontSize: 11,
          color: '#7A6A5A',
          margin: 0,
          lineHeight: 1.5,
        }}>
          Toutes les infos, tous les acteurs, au même endroit.
        </p>
      </div>
    </div>
  )
}
