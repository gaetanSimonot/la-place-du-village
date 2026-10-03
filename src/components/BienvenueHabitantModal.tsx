'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import CadreBienvenue, { VERT, ORANGE, manuscrit, Surtitre, Avantage, BoutonPlein } from '@/components/CadreBienvenue'

/**
 * LE MESSAGE DE BIENVENUE HABITANT, DANS L'APP — ouvert par la notification
 * `bienvenue_habitant` (liste des notifications, ou push du téléphone via
 * /?tab=notifs&post=bienvenue-habitant).
 *
 * C'est la version app du mail de Gaëtan (gabaritBienvenueHabitant) : même
 * bannière, mêmes textes, mêmes couleurs. Un changement de texte dans le
 * mail doit être reporté ici.
 */

export const CLE_BIENVENUE_HABITANT = 'bienvenue-habitant'

const AUSSI = [
  { emoji: '⏱️', fond: '#FCE3EC', titre: 'Les enchères, 12 h avant tout le monde', texte: 'Vous voyez les enchères inversées dès leur publication, et pouvez les saisir avant qu’elles ne s’ouvrent à tous.' },
  { emoji: '📣', fond: '#E3EFE6', titre: 'Des annonces illimitées', texte: 'Vente, troc ou enchère : publiez autant d’annonces que vous voulez (sans abonnement, c’est 3 par mois ; les dons restent libres pour tous).' },
  { emoji: '📸', fond: '#FFF0C9', titre: 'Vos moments en page d’accueil', texte: 'Partagez une photo ou une courte vidéo dans « En ce moment » : elle reste visible 24 h pour tout le village.' },
  { emoji: '✨', fond: '#E2ECFB', titre: 'Toute l’application, sans compter', texte: 'Créer un événement à partir d’une simple affiche, mettre vos textes en forme, chercher un car à la voix : vous en profitez bien plus souvent, chaque jour.' },
]

export default function BienvenueHabitantModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { profile } = useAuth()
  const prenom = (profile?.display_name ?? '').trim().split(/\s+/)[0] || null
  const aller = (href: string) => { onClose(); router.push(href) }

  return (
    <CadreBienvenue libelle="Bienvenue parmi les Habitants" onClose={onClose} action={{ texte: 'Voir les bons plans →', onClick: () => aller('/promotions') }}>
      <p style={{ ...manuscrit, fontSize: 24, marginBottom: 2 }}>C’est parti&nbsp;!</p>
      <h2 style={{ margin: '0 0 12px', fontSize: 30, lineHeight: 1.12, fontWeight: 900, letterSpacing: '-.02em', color: VERT }}>
        Bienvenue sur <span style={{ color: ORANGE }}>La Place</span>{prenom ? `, ${prenom}` : ''}&nbsp;!
      </h2>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
        Merci de soutenir cette aventure locale. Votre abonnement <strong style={{ color: '#1A1209' }}>Habitant</strong> est actif dès maintenant.
      </p>

      {/* Bons plans */}
      <div style={{ background: '#FFF1E7', borderRadius: 18, padding: '22px 20px 20px', margin: '24px 0 0' }}>
        <p style={{ ...manuscrit, fontSize: 22, marginBottom: 2 }}>Le meilleur de l’abonnement&nbsp;👇</p>
        <p style={{ margin: '0 0 12px', fontSize: 23, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.015em', color: VERT }}>Les bons plans, sans limite</p>
        <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.65 }}>
          Profitez de toutes les offres de nos Partenaires Locaux, <strong style={{ color: '#1A1209' }}>autant de fois que vous le souhaitez</strong>, dans les conditions fixées par chacun d’eux. Sans abonnement, c’est une par mois.
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.65 }}>
          Un verre offert, une remise, une séance découverte… <strong style={{ color: '#1A1209', background: '#FFD9C4', padding: '0 3px' }}>une seule offre suffit souvent à rembourser votre mois.</strong> Toutes les suivantes, c’est du bonus&nbsp;!
        </p>
        <BoutonPlein couleur={ORANGE} onClick={() => aller('/promotions')}>Voir les bons plans&nbsp;→</BoutonPlein>
      </div>

      <Surtitre petit="Et ce n’est pas tout…" grand="Ce que vous débloquez aussi" />
      {AUSSI.map(a => <Avantage key={a.titre} {...a} />)}
      <BoutonPlein couleur={VERT} onClick={() => aller('/annonces')}>Voir les annonces&nbsp;→</BoutonPlein>

      <div style={{ borderTop: '2px dashed #EAE2D6', margin: '30px 0 0' }} />
      <Surtitre petit="Grâce à vous" grand="Le village vit un peu plus" marge="24px 0 2px" />
      <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.65 }}>
        Votre abonnement permet à La Place de rester indépendante et de mettre en lumière les commerces, producteurs, associations et initiatives de notre territoire.
      </p>
      <div style={{ background: '#FFF8E6', borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
        <p style={{ ...manuscrit, fontSize: 20, marginBottom: 4 }}>🚧 Et ce n’est que le début…</p>
        <p style={{ margin: '0 0 8px', fontSize: 14.5, lineHeight: 1.65 }}>
          La Place évolue en permanence. De nombreux chantiers sont en cours, et nous sommes <strong style={{ color: '#1A1209' }}>très fiers de ce qui arrive ensuite</strong>&nbsp;: vous serez parmi les premiers à le découvrir.
        </p>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>Merci d’avoir embarqué avec nous dans l’aventure, dès maintenant. ⛵</p>
      </div>
      <EcrivezNous onClick={() => aller('/support')} texte="vos retours font directement évoluer l’application." />
      <div style={{ background: '#F1F6F2', borderLeft: `4px solid ${ORANGE}`, borderRadius: '0 14px 14px 0', padding: '16px 20px', marginBottom: 22 }}>
        <p style={{ ...manuscrit, fontSize: 20, marginBottom: 4 }}>Le bouche à oreille, c’est vous&nbsp;!</p>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>Plus il y a d’habitants sur La Place, plus il y a de bons plans et de partenaires. Parlez-en autour de vous&nbsp;!</p>
      </div>
      <Signature />
    </CadreBienvenue>
  )
}

export function EcrivezNous({ onClick, texte, avant = 'Une question, une idée, une suggestion ?' }: { onClick: () => void; texte: string; avant?: string }) {
  return (
    <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.65 }}>
      {avant}{' '}
      <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, color: VERT, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>Écrivez-nous</button>
      {' '}: {texte}
    </p>
  )
}

export function Signature() {
  return (
    <>
      <p style={{ margin: 0, fontSize: 15 }}>À très bientôt sur La Place,</p>
      <p style={{ ...manuscrit, fontSize: 24, color: VERT, margin: '2px 0 0' }}>L’équipe de La Place</p>
    </>
  )
}
