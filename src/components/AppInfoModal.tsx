'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { toast } from 'sonner'

const T = {
  primary: '#2D5A3D',
  primaryLight: '#E8F2EB',
  accent: '#C84B2F',
  texte: '#1A1209',
  texteDoux: '#7A6A5A',
  texteTresDoux: '#A99B89',
  creme: '#FDFAF5',
  cremeDeep: '#F7F1E6',
  bord: '#E8E0D4',
  bordSoft: '#F0EAE0',
  white: '#FFFFFF',
}

// ───── Icons ─────
const IconAbout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)
const IconHow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const IconPricing = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
)
const IconLegal = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20" /><path d="M6 7h12" />
    <path d="M6 7l-3 6h6z" /><path d="M18 7l3 6h-6z" />
    <path d="M9 21h6" />
  </svg>
)
const IconChat = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
)
const IconChev = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
)
const IconHeart = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

// ───── Helpers typography ─────
function InfoP({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 13, color: T.texte, lineHeight: 1.6, margin: '0 0 10px', ...style }}>
      {children}
    </p>
  )
}
function InfoSubH({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 800, color: T.primary, margin: '14px 0 6px', letterSpacing: '-0.01em' }}>
      {children}
    </p>
  )
}
function InfoBullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 10px', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: T.texte, lineHeight: 1.5 }}>
          <span style={{ flexShrink: 0, marginTop: 6, width: 4, height: 4, borderRadius: '50%', background: T.accent }} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

// ───── Composant principal ─────
export default function AppInfoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [contactOpen, setContactOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string>('about')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  function handleCreateAccount() {
    onClose()
    openAuthModal('/')
  }
  function handleGoPremium() {
    onClose()
    router.push('/profil')
  }

  async function sendContact() {
    if (!message.trim() || sending) return
    if (!user) {
      onClose()
      openAuthModal('/')
      return
    }
    setSending(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      // Session JWT expirée alors que user reste affiché loggé (cf. bug
      // session zombie). On informe l'user au lieu d'un return silencieux.
      setSending(false)
      toast.error('Ta session a expiré. Reconnecte-toi et réessaie.')
      return
    }
    const res = await fetch('/api/support/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: message.trim() }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      const msg = d.error ?? 'Erreur envoi — réessaie dans un instant.'
      setError(msg)
      toast.error(msg)
      setSending(false)
      return
    }
    const data = await res.json()
    onClose()
    if (data.conversation?.id) {
      router.push(`/support/${data.conversation.id}`)
    }
  }

  const sections = [
    {
      id: 'about',
      icon: <IconAbout />, tint: T.primaryLight, color: T.primary,
      title: "C'est quoi La Place du Village ?",
      body: (
        <>
          <InfoP>
            La Place du Village, c&apos;est le bouche-à-oreille local…{' '}
            <strong style={{ color: T.texte, fontWeight: 800 }}>tout bien organisé</strong>.
          </InfoP>
          <InfoP>
            Un événement vous passe sous les yeux ? Prenez l&apos;affiche en photo,
            publiez-la, et l&apos;application l&apos;ajoute sur la carte du village.
          </InfoP>
          <InfoP>
            Un nouveau commerce ouvre ? Une brocante, un concert, une annonce,
            un producteur, un bon plan ? Tout le monde peut participer.
          </InfoP>
          <InfoP>
            <strong style={{ color: T.texte, fontWeight: 800 }}>Le but :</strong>{' '}
            créer un endroit vivant et simple où les habitants retrouvent ce qui se passe
            autour d&apos;eux, sans devoir chercher partout.
          </InfoP>

          {!user && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: T.primaryLight, border: '1px solid #C5DCC9', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.primary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconCheck />
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: T.primary, letterSpacing: '-0.01em' }}>
                  Avec un compte (gratuit)
                </span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  'Voir tous les événements près de chez toi',
                  'Débloquer les bons plans des commerçants',
                  'Publier annonces, dons et trocs',
                  'Sauvegarder tes favoris et suivre tes producteurs',
                ].map((it, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: T.texte, lineHeight: 1.5 }}>
                    <span style={{ flexShrink: 0, marginTop: 7, width: 3, height: 3, borderRadius: '50%', background: T.primary }} />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleCreateAccount}
                style={{ width: '100%', marginTop: 10, padding: '9px 14px', borderRadius: 10, background: T.primary, color: '#fff', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
              >
                Créer mon compte gratuit <IconArrow />
              </button>
            </div>
          )}

          <p style={{ margin: '14px 0 0', fontStyle: 'italic', color: T.primary, background: T.cremeDeep, padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.5 }}>
            Une application à nous tous !
          </p>
        </>
      ),
    },
    {
      id: 'how',
      icon: <IconHow />, tint: '#FFF0E5', color: T.accent,
      title: 'Comment ça marche ?',
      body: (
        <>
          <InfoSubH>Habitants — tout ce qu&apos;on peut faire</InfoSubH>
          <InfoBullets items={[
            'Découvrir les événements, commerces et producteurs autour de chez soi',
            'Publier un événement en prenant simplement une photo de l\'affiche',
            'Acheter, vendre, donner ou échanger via les annonces locales',
            'Profiter des bons plans et promotions des commerces du village',
            'Proposer ou rejoindre un covoiturage entre voisins (gratuit, sans intermédiaire)',
            'Écrire un article pour le journal du village — partager ce qui vous tient à cœur',
            'Suivre ses commerces, producteurs et événements favoris',
            'Recevoir une notif quand un producteur sort un nouveau panier',
            'Partager une trouvaille locale d\'un tap (WhatsApp, SMS, mail…)',
          ]} />

          <InfoSubH>Commerces &amp; artisans</InfoSubH>
          <InfoBullets items={[
            'Revendiquer sa fiche et gagner en visibilité locale',
            'Diffuser événements et actualités aux voisins',
            'Créer des promotions réservées aux habitants connectés',
            'Mettre en avant un événement ou une promo dans le hub du village',
          ]} />
          <InfoP style={{ fontSize: 11, color: T.texteDoux, lineHeight: 1.5 }}>
            <strong style={{ color: T.texte, fontWeight: 800 }}>Validation en main :</strong> l&apos;habitant
            vous montre son écran avec la promo activée, vous validez d&apos;un tap
            depuis votre tableau de bord. Pas de QR code, pas de matériel.
          </InfoP>
          <InfoP style={{ fontSize: 11, color: T.texteDoux, lineHeight: 1.5 }}>
            <strong style={{ color: T.texte, fontWeight: 800 }}>Stats de rentabilité :</strong> nombre
            de promos utilisées, période la plus active, comparatif semaine /
            mois. Vous voyez en un coup d&apos;œil ce qui marche.
          </InfoP>

          <InfoSubH>Producteurs</InfoSubH>
          <InfoP>
            Dictez vos produits disponibles en vocal — l&apos;application crée
            automatiquement vos fiches produits et vous positionne sur la carte pour que
            les habitants viennent acheter directement chez vous.
          </InfoP>
        </>
      ),
    },
    {
      id: 'pricing',
      icon: <IconPricing />, tint: '#EAF3E6', color: '#5B8A4A',
      title: 'Combien ça coûte ?',
      body: (
        <>
          <InfoP>
            <strong style={{ color: T.texte, fontWeight: 800 }}>L&apos;application est
            entièrement accessible gratuitement.</strong> Le cœur de la plateforme
            (publier, lire, profiter, échanger) reste libre pour tous.
          </InfoP>

          <InfoSubH>Habitants — options premium en bonus</InfoSubH>
          <InfoBullets items={[
            'Promotions et annonces illimitées',
            'Accès anticipé aux enchères inversées',
            'Avantages réservés aux abonnés (cafés offerts, bons plans…)',
            'Soutien direct au développement local',
          ]} />
          <InfoP style={{ fontSize: 11, color: T.texteDoux, lineHeight: 1.5 }}>
            Un abonnement pensé pour être rentabilisé dès les premières offres
            utilisées chez les commerçants partenaires.
          </InfoP>

          <button
            onClick={handleGoPremium}
            style={{ width: '100%', marginTop: 6, padding: '11px 14px', borderRadius: 12, background: T.primary, color: '#fff', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 3px 12px rgba(45,90,61,0.25)', fontFamily: 'inherit' }}
          >
            <IconHeart /> Devenir Habitant premium <IconArrow />
          </button>

          <InfoSubH>Commerces — outils Pro</InfoSubH>
          <InfoP>
            Quelques fonctionnalités avancées (visibilité locale, mise en avant,
            marketplace) font l&apos;objet d&apos;un abonnement simple et accessible pour les
            acteurs économiques du territoire.
          </InfoP>

          <button
            onClick={handleGoPremium}
            style={{ width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 12, background: '#F0EBE3', color: '#7C5C3B', border: '1px solid #E0D8CE', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
          >
            Découvrir les outils Pro <IconChev />
          </button>
        </>
      ),
    },
    {
      id: 'legal',
      icon: <IconLegal />, tint: '#F0EBE3', color: '#7C5C3B',
      title: 'Mentions légales',
      body: (
        <>
          <InfoP>
            La Place du Village est une application communautaire locale permettant aux
            habitants, associations, commerces, producteurs et acteurs du territoire de
            partager informations, événements, annonces et initiatives locales.
          </InfoP>
          <InfoP>
            <strong style={{ color: T.texte, fontWeight: 800 }}>Vos données ne sont jamais
            revendues à des tiers.</strong> Elles servent uniquement au fonctionnement
            de l&apos;application.
          </InfoP>
          <InfoP>
            L&apos;application est un outil local indépendant qui ne repose pas sur les
            grands réseaux sociaux ou plateformes publicitaires — pour permettre aux
            habitants de s&apos;organiser librement entre eux.
          </InfoP>
          <InfoP>
            Chaque utilisateur reste responsable de ses publications. Les contenus
            illégaux, frauduleux ou nuisibles peuvent être supprimés pour préserver
            l&apos;esprit de la plateforme.
          </InfoP>
          <InfoP style={{ fontSize: 11, color: T.texteDoux }}>
            Pour toute demande concernant vos données, utilisez le formulaire de contact
            ci-dessous.
          </InfoP>

          {/* Liens vers pages légales complètes */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.bordSoft}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a
              href="/mentions-legales"
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, color: T.texte, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              Mentions légales complètes
              <span style={{ color: T.texteDoux }}><IconArrow /></span>
            </a>
            <a
              href="/politique-confidentialite"
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, color: T.texte, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              Politique de confidentialité (RGPD)
              <span style={{ color: T.texteDoux }}><IconArrow /></span>
            </a>
            <a
              href="/cgu"
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, color: T.texte, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              Conditions générales d&apos;utilisation
              <span style={{ color: T.texteDoux }}><IconArrow /></span>
            </a>
          </div>
        </>
      ),
    },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: 'var(--font-body), sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 480, maxHeight: '92dvh',
          background: T.white, borderRadius: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Close top-right */}
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
            border: `1px solid ${T.bordSoft}`, color: T.texteDoux, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <IconClose />
        </button>

        {/* Hero village illustration */}
        <div
          style={{
            background: 'linear-gradient(135deg, #FBF3E6 0%, #F8EDD8 100%)',
            padding: '20px 22px 16px',
            flexShrink: 0,
          }}
        >
          <Image
            src="/village-illustration.png" alt=""
            width={420} height={210} priority
            style={{ width: '70%', height: 'auto', display: 'block', margin: '0 auto 10px', mixBlendMode: 'multiply', userSelect: 'none' }}
          />
          <h2 style={{
            margin: 0, textAlign: 'center',
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: 24, color: T.primary, letterSpacing: '-0.01em', lineHeight: 1.0,
          }}>
            La Place du Village
          </h2>
          <div style={{ width: 36, height: 3, borderRadius: 999, backgroundColor: T.accent, margin: '8px auto 8px' }} />
          <p style={{
            margin: 0, textAlign: 'center',
            fontFamily: 'var(--font-hand), Caveat, cursive', fontWeight: 500,
            fontSize: 17, color: T.texteDoux, lineHeight: 1.05,
          }}>
            L&apos;application dont vous êtes le hérault
          </p>
        </div>

        {/* Scroll zone */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* Accordion */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {sections.map(s => {
              const isOpen = openId === s.id
              return (
                <div
                  key={s.id}
                  ref={el => { sectionRefs.current[s.id] = el }}
                  style={{ background: T.white, border: `1px solid ${T.bordSoft}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
                >
                  <button
                    onClick={() => {
                      const next = isOpen ? '' : s.id
                      setOpenId(next)
                      if (next) {
                        // Au tick suivant : scroll l'accordéon ouvert dans le viewport
                        setTimeout(() => {
                          sectionRefs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }, 50)
                      }
                    }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: 'none', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}
                  >
                    <span style={{ flexShrink: 0, color: s.color, width: 36, height: 36, borderRadius: 10, background: s.tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.icon}
                    </span>
                    <span style={{ flex: 1, fontWeight: 800, fontSize: 14, color: T.texte, letterSpacing: '-0.01em' }}>
                      {s.title}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.texteDoux} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${T.bordSoft}` }}>
                      <div style={{ paddingTop: 14 }}>{s.body}</div>
                    </div>
                  )}
                  {/* Espace tampon en bas du dernier accordéon ouvert pour que
                      le scrollIntoView aligne bien sans coller au bord */}
                  {isOpen && <div aria-hidden style={{ height: 60 }} />}
                </div>
              )
            })}
          </div>

          {/* Contact form */}
          <div style={{ borderTop: `1px solid ${T.bordSoft}`, paddingTop: 14, marginBottom: 4 }}>
            {!contactOpen ? (
              <button
                onClick={() => setContactOpen(true)}
                style={{ width: '100%', padding: '13px 14px', borderRadius: 14, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: T.white, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconChat />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.texte, letterSpacing: '-0.01em' }}>
                    Contacter l&apos;équipe
                  </div>
                  <div style={{ fontSize: 11, color: T.texteDoux, marginTop: 2 }}>
                    Question, bug, suggestion ? Écrivez-nous.
                  </div>
                </div>
                <span style={{ color: T.texteDoux, display: 'inline-flex' }}><IconChev /></span>
              </button>
            ) : (
              <div style={{ padding: 14, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, borderRadius: 14 }}>
                <div style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: T.texte, letterSpacing: '-0.01em' }}>
                  <span style={{ color: T.primary, display: 'inline-flex' }}><IconChat /></span>
                  Contacter l&apos;équipe
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Bonjour, j'aurais besoin d'aide pour…"
                  rows={4}
                  maxLength={2000}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${T.primary}`, background: T.white, fontSize: 13, color: T.texte, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ marginTop: 6, fontSize: 10, color: T.texteTresDoux, textAlign: 'right' }}>
                  {message.length}/2000
                </div>
                {error && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#C0392B' }}>{error}</p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => { setContactOpen(false); setMessage(''); setError(null) }}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: T.white, border: `1px solid ${T.bord}`, color: T.texteDoux, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={sendContact}
                    disabled={!message.trim() || sending}
                    style={{ flex: 2, padding: '10px 14px', borderRadius: 10, background: message.trim() && !sending ? T.primary : '#D8D0C8', color: '#fff', border: 'none', fontSize: 12, fontWeight: 800, cursor: message.trim() && !sending ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
                  >
                    <IconSend /> {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 10, color: T.texteTresDoux, textAlign: 'center', fontStyle: 'italic' }}>
                  Vous recevrez une notification dès que l&apos;équipe vous répond.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA bottom */}
        <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${T.bordSoft}`, background: T.white, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: 14, borderRadius: 14, background: T.primary, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-body), sans-serif' }}
          >
            <IconCheck /> C&apos;est compris !
          </button>
        </div>
      </div>
    </div>
  )
}
