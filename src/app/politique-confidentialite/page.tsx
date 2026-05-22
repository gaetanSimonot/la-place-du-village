'use client'
import LegalPageLayout, { LegalSection, LegalP, LegalUL } from '@/components/legal/LegalPageLayout'

export default function PolitiqueConfidentialitePage() {
  return (
    <LegalPageLayout title="Politique de confidentialité" updated="22 mai 2026">
      <LegalSection title="En résumé">
        <LegalP>
          <strong>Tes données ne sont jamais revendues à des tiers.</strong> Elles servent
          uniquement au fonctionnement de l&apos;application et à la création de lien entre les
          habitants. Tu peux à tout moment consulter, modifier ou supprimer ton compte depuis
          tes Réglages.
        </LegalP>
      </LegalSection>

      <LegalSection title="Responsable du traitement">
        <LegalP>
          Le responsable du traitement des données est l&apos;éditeur de La Place du Village. Pour
          toute demande relative à tes données personnelles (accès, rectification, suppression,
          portabilité, opposition), utilise le <a href="/support" className="font-bold text-primary underline">formulaire
          de contact intégré</a>.
        </LegalP>
      </LegalSection>

      <LegalSection title="Données collectées">
        <LegalP>Les données suivantes peuvent être collectées :</LegalP>
        <LegalUL items={[
          <><strong>Identité</strong> : nom d&apos;affichage, email (chiffré côté Supabase Auth), avatar et bannière de profil (optionnels).</>,
          <><strong>Profil</strong> : bio, ville/localisation textuelle, lien externe (optionnels).</>,
          <><strong>Contenus publiés</strong> : annonces, événements, posts du mur, commentaires, photos, messages privés.</>,
          <><strong>Interactions</strong> : favoris, abonnements (follows), demandes d&apos;ami, likes.</>,
          <><strong>Préférences</strong> : paramètres d&apos;affichage du profil, thème, notifications.</>,
          <><strong>Données techniques</strong> : journaux d&apos;erreur anonymisés (Vercel), aucune publicité ou tracker externe.</>,
        ]} />
      </LegalSection>

      <LegalSection title="Finalité du traitement">
        <LegalP>Les données collectées servent à :</LegalP>
        <LegalUL items={[
          'Faire fonctionner l\'application (afficher le contenu, authentifier l\'utilisateur, envoyer les notifications).',
          'Créer du lien entre les habitants (annuaire des gens, messagerie, suggestions).',
          'Permettre aux commerces de gérer leur fiche et leurs promotions.',
          'Modérer les contenus signalés.',
        ]} />
        <LegalP>
          <strong>Aucune donnée n&apos;est utilisée à des fins publicitaires ou de profilage
          commercial.</strong>
        </LegalP>
      </LegalSection>

      <LegalSection title="Durée de conservation">
        <LegalUL items={[
          'Données de compte : conservées tant que le compte est actif.',
          'Contenus publiés : conservés tant qu\'ils restent en ligne (ou jusqu\'à suppression par l\'auteur).',
          'Messages privés : conservés tant que la conversation existe.',
          'Sauvegardes Supabase : conservées maximum 30 jours après suppression.',
        ]} />
      </LegalSection>

      <LegalSection title="Tes droits (RGPD)">
        <LegalP>
          Conformément au Règlement Général sur la Protection des Données (UE 2016/679), tu disposes
          des droits suivants :
        </LegalP>
        <LegalUL items={[
          <><strong>Accès</strong> : consulter tes données depuis ton profil et tes Réglages.</>,
          <><strong>Rectification</strong> : modifier ton nom, bio, photo, etc. à tout moment dans Réglages.</>,
          <><strong>Suppression</strong> : supprimer ton compte définitivement depuis Réglages &gt; Compte. Les données sont effacées immédiatement.</>,
          <><strong>Portabilité</strong> : sur demande via le formulaire support, recevoir un export de tes contenus au format JSON.</>,
          <><strong>Opposition / limitation</strong> : nous écrire via le formulaire support pour toute demande spécifique.</>,
          <><strong>Réclamation</strong> : tu peux déposer une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">cnil.fr</a>).</>,
        ]} />
      </LegalSection>

      <LegalSection title="Cookies et stockage local">
        <LegalP>
          L&apos;application utilise du stockage local (<code>localStorage</code>, IndexedDB) pour :
        </LegalP>
        <LegalUL items={[
          'Maintenir la session utilisateur après connexion.',
          'Sauvegarder les favoris des utilisateurs non connectés (jusqu\'à leur prochaine connexion).',
          'Mémoriser tes préférences d\'affichage (thème, zone géographique).',
        ]} />
        <LegalP>
          <strong>Aucun cookie publicitaire ou de tracking tiers n&apos;est utilisé.</strong>
        </LegalP>
      </LegalSection>

      <LegalSection title="Partage avec des tiers">
        <LegalP>
          Tes données ne sont partagées qu&apos;avec nos sous-traitants techniques nécessaires au
          fonctionnement :
        </LegalP>
        <LegalUL items={[
          <><strong>Supabase</strong> (base de données + auth, conforme RGPD, hébergement UE).</>,
          <><strong>Vercel</strong> (hébergement applicatif).</>,
          <><strong>Stripe</strong> (paiements abonnements premium, conforme RGPD, données minimisées).</>,
          <><strong>Google Maps</strong> (affichage de la carte uniquement, aucune donnée perso transmise).</>,
        ]} />
        <LegalP>
          <strong>Aucun revente ou transfert commercial à des tiers.</strong>
        </LegalP>
      </LegalSection>

      <LegalSection title="Sécurité">
        <LegalP>
          Les mots de passe sont chiffrés (bcrypt) par Supabase Auth et jamais accessibles en clair.
          Les communications sont chiffrées TLS de bout en bout. Les accès admin sont protégés par
          une liste blanche serveur (<code>admin_emails</code>) et un code PIN à 4 chiffres.
        </LegalP>
      </LegalSection>
    </LegalPageLayout>
  )
}
