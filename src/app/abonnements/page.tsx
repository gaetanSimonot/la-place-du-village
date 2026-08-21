'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import SubscriptionModal from '@/components/SubscriptionModal'

/**
 * /abonnements — l'écran des trois plans, avec une adresse.
 *
 * Rigoureusement le même composant qu'ailleurs dans l'app, sans la moindre
 * retouche visuelle : il se dessine déjà en panneau plein écran. La seule
 * différence est ce que fait la fermeture — ici il n'y a pas de modale à
 * refermer, donc on revient en arrière.
 *
 * Pourquoi cette page existe : après connexion, l'app ramène toujours
 * l'utilisateur sur un CHEMIN (`openAuthModal('/annonces/nouvelle')` et une
 * dizaine d'autres). Sans adresse, l'écran des plans était le seul endroit où
 * l'on ne pouvait ramener personne — un visiteur sans compte qui voulait
 * s'abonner se perdait juste après s'être inscrit.
 *
 * Bénéfice au passage : une URL à mettre dans l'hebdo, la newsletter ou un
 * mail à un commerçant.
 */
export default function AbonnementsPage() {
  const router = useRouter()
  const { profile } = useAuth()

  function retour() {
    // Arrivé par un lien externe (newsletter, mail) : il n'y a pas de page
    // précédente dans l'app, on renvoie à l'accueil plutôt que de sortir.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/')
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF5' }}>
      <SubscriptionModal
        context={{ kind: 'generic' }}
        currentPlan={(profile?.plan as 'basic' | 'habitants' | 'pro') ?? 'basic'}
        onClose={retour}
      />
    </div>
  )
}
