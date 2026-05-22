'use client'
import LegalPageLayout, { LegalSection, LegalP, LegalUL } from '@/components/legal/LegalPageLayout'

export default function CguPage() {
  return (
    <LegalPageLayout title="Conditions générales d'utilisation" updated="22 mai 2026">
      <LegalSection title="Objet">
        <LegalP>
          Les présentes Conditions générales d&apos;utilisation (« CGU ») régissent l&apos;accès et
          l&apos;usage de l&apos;application <strong>La Place du Village</strong>. En utilisant
          l&apos;application, tu acceptes ces CGU sans réserve.
        </LegalP>
      </LegalSection>

      <LegalSection title="Accès au service">
        <LegalP>
          L&apos;accès à l&apos;application est <strong>gratuit</strong>. La création d&apos;un
          compte (gratuit) débloque la publication d&apos;annonces, le suivi de favoris,
          l&apos;accès au mur communautaire et la messagerie entre amis.
        </LegalP>
        <LegalP>
          Des fonctionnalités premium optionnelles sont accessibles via abonnement payant (plans
          Avantages Habitants et Partenaire Local).
        </LegalP>
      </LegalSection>

      <LegalSection title="Création de compte">
        <LegalUL items={[
          'Pour créer un compte, tu dois être âgé de 15 ans minimum (ou disposer de l\'autorisation parentale).',
          'Tu garantis l\'exactitude des informations fournies (email valide, nom d\'affichage non trompeur).',
          'Un seul compte par personne. Les comptes multiples ou usurpation d\'identité peuvent être suspendus sans préavis.',
          'Tu es responsable de la confidentialité de tes identifiants.',
        ]} />
      </LegalSection>

      <LegalSection title="Contenus utilisateurs">
        <LegalP>
          En publiant un contenu (annonce, événement, post, photo, commentaire, message), tu
          déclares :
        </LegalP>
        <LegalUL items={[
          'En être l\'auteur ou disposer des droits nécessaires.',
          'Que ton contenu n\'enfreint aucun droit d\'auteur, droit à l\'image, droit des marques.',
          'Qu\'il ne contient rien d\'illégal, diffamatoire, haineux, frauduleux, raciste, sexiste, pornographique ou contraire à l\'ordre public.',
          'Accorder à La Place du Village une licence non exclusive de diffusion au sein de la plateforme.',
        ]} />
        <LegalP>
          <strong>Tu restes propriétaire de tes contenus</strong> et peux les supprimer à tout
          moment.
        </LegalP>
      </LegalSection>

      <LegalSection title="Comportements interdits">
        <LegalP>Il est notamment interdit de :</LegalP>
        <LegalUL items={[
          'Publier des contenus illicites, haineux, harcelants ou sexuellement explicites.',
          'Spammer, faire de la publicité non sollicitée ou détourner la plateforme à des fins commerciales sans autorisation.',
          'Usurper l\'identité d\'une autre personne ou d\'un commerce.',
          'Tenter de contourner les limites techniques (rate limits, quotas, paiements).',
          'Scraper, copier en masse ou détourner le contenu d\'autres utilisateurs.',
          'Diffuser des malwares, du code malveillant ou perturber le fonctionnement du service.',
        ]} />
      </LegalSection>

      <LegalSection title="Modération">
        <LegalP>
          Tout contenu signalé ou contraire aux présentes CGU peut être supprimé sans préavis par
          l&apos;équipe. En cas d&apos;abus répété, le compte peut être suspendu ou supprimé
          définitivement.
        </LegalP>
        <LegalP>
          Les signalements se font via le menu ⋯ sur les publications ou via le{' '}
          <a href="/support" className="font-bold text-primary underline">formulaire de contact</a>.
        </LegalP>
      </LegalSection>

      <LegalSection title="Abonnements payants">
        <LegalP>
          Les abonnements (Avantages Habitants 4,99€/mois, Partenaire Local 9€/mois) sont gérés via
          Stripe. Le paiement est récurrent mensuel, sans engagement. Tu peux annuler à tout moment
          depuis Réglages &gt; Mon plan.
        </LegalP>
        <LegalP>
          Aucun remboursement n&apos;est dû pour les périodes déjà entamées, sauf cas exceptionnel
          (bug bloquant, double facturation) — nous écrire via le formulaire support.
        </LegalP>
      </LegalSection>

      <LegalSection title="Limitation de responsabilité">
        <LegalP>
          La Place du Village est un service de mise en relation entre habitants. <strong>L&apos;application
          ne saurait être tenue responsable :</strong>
        </LegalP>
        <LegalUL items={[
          'Des contenus publiés par les utilisateurs.',
          'Des litiges, transactions privées ou conflits entre utilisateurs.',
          'Des inexactitudes (horaires, prix, descriptions) communiquées par les annonceurs.',
          'D\'éventuelles interruptions de service, pertes de données accidentelles ou dommages indirects.',
        ]} />
        <LegalP>
          Tu utilises l&apos;application à tes propres risques. Pour tes transactions privées
          (achats d&apos;annonces, covoiturages, échanges), reste prudent et applique les règles de
          bon sens.
        </LegalP>
      </LegalSection>

      <LegalSection title="Suppression du compte">
        <LegalP>
          Tu peux supprimer ton compte à tout moment depuis Réglages &gt; Compte &gt; Supprimer mon
          compte. La suppression est définitive et immédiate : tes annonces, événements, posts,
          messages et fiche pro sont effacés. Les établissements gérés deviennent « à revendiquer »
          (l&apos;infrastructure du village reste).
        </LegalP>
      </LegalSection>

      <LegalSection title="Évolution des CGU">
        <LegalP>
          Les présentes CGU peuvent être modifiées à tout moment. La date de mise à jour est
          indiquée en haut de cette page. Les modifications majeures te seront notifiées via
          l&apos;application.
        </LegalP>
      </LegalSection>

      <LegalSection title="Droit applicable">
        <LegalP>
          Les présentes CGU sont régies par le droit français. Tout litige relèvera des tribunaux
          compétents, après tentative de résolution amiable via le formulaire support.
        </LegalP>
      </LegalSection>
    </LegalPageLayout>
  )
}
