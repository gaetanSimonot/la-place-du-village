'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import CadreBienvenue, { VERT, ORANGE, manuscrit, Surtitre, Avantage, BoutonPlein } from '@/components/CadreBienvenue'
import { EcrivezNous, Signature } from '@/components/BienvenueHabitantModal'

/**
 * LE MESSAGE DE BIENVENUE PARTENAIRE LOCAL, DANS L'APP — ouvert par la
 * notification `bienvenue_partenaire` (liste, ou push via
 * /?tab=notifs&post=bienvenue-partenaire).
 *
 * Version app du mail de Gaëtan (gabaritBienvenuePartenaire) : mêmes textes,
 * mêmes liens (« Créer ma première promotion » ouvre le circuit bon plan,
 * « Compléter ma fiche » sa fiche). Un changement dans le mail se reporte ici.
 */

export const CLE_BIENVENUE_PARTENAIRE = 'bienvenue-partenaire'

const INCLUS = [
  { emoji: '🔎', fond: '#FCE3EC', titre: 'Plus de visibilité', texte: 'Une mise en avant dans les résultats de recherche, une meilleure visibilité dans vos catégories, et des mises en avant dans notre newsletter locale.' },
  { emoji: '🎁', fond: '#FFE4D6', titre: 'Des promotions locales illimitées', texte: 'Publiez autant d’offres que vous le souhaitez pour attirer les habitants.' },
  { emoji: '🏪', fond: '#E3EFE6', titre: 'Une fiche plus riche', texte: 'Davantage de possibilités pour enrichir et personnaliser votre fiche, et l’accès complet aux fonctionnalités de l’application.' },
  { emoji: '🎨', fond: '#FFF0C9', titre: 'Un kit de création', texte: 'Des outils pour réaliser facilement votre communication.' },
  { emoji: '📰', fond: '#E2ECFB', titre: 'Votre voix dans le Journal Local', texte: 'Proposez vos articles et actualités, et profitez d’autres outils réservés aux Partenaires Locaux.' },
]

export default function BienvenuePartenaireModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { user, profile } = useAuth()
  const aller = (href: string) => { onClose(); router.push(href) }

  // Sa fiche : le nom du « Bonjour », et la destination de « Compléter ma fiche ».
  const [fiche, setFiche] = useState<{ id: string; nom: string } | null>(null)
  useEffect(() => {
    if (!user) return
    supabase.from('etablissements').select('id, nom').eq('user_id', user.id).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setFiche(data as { id: string; nom: string }) })
  }, [user])
  const nom = fiche?.nom ?? profile?.display_name ?? null

  return (
    <CadreBienvenue libelle="Bienvenue parmi les Partenaires Locaux" onClose={onClose} action={{ texte: 'Créer ma promotion →', onClick: () => aller('/promotions?nouveau=1') }}>
      <p style={{ ...manuscrit, fontSize: 24, marginBottom: 2 }}>Bonjour{nom ? ` ${nom}` : ''}&nbsp;!</p>
      <h2 style={{ margin: '0 0 12px', fontSize: 28, lineHeight: 1.12, fontWeight: 900, letterSpacing: '-.02em', color: VERT }}>
        Bienvenue parmi les Partenaires Locaux de <span style={{ color: ORANGE }}>La Place</span>&nbsp;!
      </h2>
      <p style={{ margin: '0 0 10px', fontSize: 16, lineHeight: 1.6 }}>
        Merci pour votre confiance. Votre abonnement <strong style={{ color: '#1A1209' }}>Partenaire Local</strong> est actif dès maintenant.
      </p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>
        Votre établissement bénéficie dès aujourd’hui de plus de visibilité sur La Place, et de nouveaux outils pour faire connaître votre activité auprès des habitants.
      </p>

      <Surtitre petit="Concrètement 👇" grand="Ce que vous débloquez" marge="26px 0 2px" />
      {INCLUS.map(a => <Avantage key={a.titre} {...a} />)}

      {/* Étape 1 : promotion */}
      <div style={{ background: '#FFF1E7', borderRadius: 18, padding: '22px 20px 20px', margin: '14px 0 0' }}>
        <p style={{ ...manuscrit, fontSize: 22, marginBottom: 2 }}>Pour bien commencer</p>
        <p style={{ margin: '0 0 12px', fontSize: 23, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.015em', color: VERT }}>Créez votre première promotion</p>
        <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.65 }}>
          Une remise sur une prestation, un petit cadeau, une offre découverte, un avantage réservé aux habitants… <strong style={{ color: '#1A1209', background: '#FFD9C4', padding: '0 3px' }}>même une offre toute simple peut vous apporter immédiatement plus de visibilité.</strong>
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.65 }}>
          Dès sa publication, votre offre apparaît dans l’onglet <strong style={{ color: '#1A1209' }}>Promotions</strong>, l’un des espaces les plus consultés de La Place après la carte des événements.
        </p>
        <BoutonPlein couleur={ORANGE} onClick={() => aller('/promotions?nouveau=1')}>Créer ma première promotion&nbsp;→</BoutonPlein>
      </div>

      {/* Étape 2 : fiche */}
      <div style={{ background: '#F1F6F2', borderRadius: 18, padding: '22px 20px 20px', margin: '14px 0 0' }}>
        <p style={{ ...manuscrit, fontSize: 22, marginBottom: 2 }}>Et ensuite</p>
        <p style={{ margin: '0 0 12px', fontSize: 23, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.015em', color: VERT }}>Faites vivre votre fiche</p>
        <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.65 }}>
          Ajoutez vos plus belles photos, vérifiez vos horaires, présentez votre activité et mettez régulièrement vos informations à jour.
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.65 }}>
          Une fiche complète permet aux habitants de mieux vous connaître, et vous aide à <strong style={{ color: '#1A1209' }}>profiter au maximum des mises en avant</strong> incluses dans votre abonnement.
        </p>
        <BoutonPlein couleur={VERT} onClick={() => aller(fiche ? `/etablissement/${fiche.id}` : '/')}>Compléter ma fiche&nbsp;→</BoutonPlein>
      </div>

      <div style={{ borderTop: '2px dashed #EAE2D6', margin: '30px 0 0' }} />
      <Surtitre petit="Grâce à vous" grand="Le territoire se montre un peu plus" marge="24px 0 2px" />
      <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.65 }}>
        Merci de participer à cette aventure locale. En rejoignant les Partenaires Locaux, vous contribuez à rendre plus visibles les commerces, services, producteurs, associations et initiatives qui font vivre notre territoire au quotidien.
      </p>
      <div style={{ background: '#FFF8E6', borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
        <p style={{ ...manuscrit, fontSize: 20, marginBottom: 4 }}>🚧 La Place évolue avec vous</p>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>
          La Place est en constante évolution. Nous ajoutons régulièrement de nouvelles fonctionnalités pour <strong style={{ color: '#1A1209' }}>mieux mettre en valeur les acteurs locaux</strong> et faciliter les échanges avec les habitants.
        </p>
      </div>
      <EcrivezNous onClick={() => aller('/support')} avant="Une question, une difficulté, une idée pour améliorer la plateforme ?" texte="vos retours nous aident directement à faire évoluer La Place." />
      <Signature />
    </CadreBienvenue>
  )
}
