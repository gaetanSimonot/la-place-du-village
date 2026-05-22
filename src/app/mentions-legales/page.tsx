'use client'
import LegalPageLayout, { LegalSection, LegalP } from '@/components/legal/LegalPageLayout'

export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout title="Mentions légales" updated="22 mai 2026">
      <LegalSection title="Éditeur de l'application">
        <LegalP>
          <strong>La Place du Village</strong> est une application communautaire locale, mise à
          disposition gratuitement pour les habitants, associations, commerces, producteurs et
          acteurs du territoire.
        </LegalP>
        <LegalP>
          Pour toute demande relative à l&apos;éditeur, à un signalement, ou à une question
          technique, utilise le <a href="/support" className="font-bold text-primary underline">formulaire de
          contact intégré à l&apos;application</a> — aucune adresse personnelle n&apos;est publiée
          ici par souci de protection de la vie privée des contributeurs.
        </LegalP>
      </LegalSection>

      <LegalSection title="Hébergement">
        <LegalP>
          L&apos;application est hébergée sur <strong>Vercel Inc.</strong> (440 N Barranca Ave
          #4133, Covina, CA 91723, USA — <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">vercel.com</a>).
        </LegalP>
        <LegalP>
          La base de données et l&apos;authentification sont opérées par <strong>Supabase Inc.</strong>{' '}
          (<a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">supabase.com</a>),
          stockées dans des centres de données situés dans l&apos;Union européenne.
        </LegalP>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <LegalP>
          Les contenus publiés par les utilisateurs (annonces, événements, posts, fiches commerce,
          photos, etc.) restent la propriété de leurs auteurs. En les publiant, l&apos;utilisateur
          accorde à l&apos;application une licence non exclusive d&apos;affichage et de diffusion
          au sein de la plateforme.
        </LegalP>
        <LegalP>
          La marque, les visuels d&apos;interface, le code source et les illustrations propres à
          La Place du Village sont protégés et ne peuvent être réutilisés sans autorisation.
        </LegalP>
      </LegalSection>

      <LegalSection title="Limitation de responsabilité">
        <LegalP>
          La Place du Village est un outil de mise en relation locale. <strong>L&apos;application
          ne saurait être tenue responsable</strong> des contenus publiés par les utilisateurs,
          des échanges entre eux, des transactions privées, ni de l&apos;exactitude des
          informations diffusées par des tiers (événements, horaires, prix, descriptions).
        </LegalP>
        <LegalP>
          Chaque utilisateur reste seul responsable de ses publications et de l&apos;usage qu&apos;il
          fait de l&apos;application. L&apos;équipe se réserve le droit de supprimer tout contenu
          illégal, frauduleux, diffamatoire ou contraire à l&apos;esprit de la plateforme.
        </LegalP>
      </LegalSection>

      <LegalSection title="Signalement de contenu">
        <LegalP>
          Tout utilisateur peut signaler un contenu inapproprié via le menu ⋯ présent sur les
          publications, ou en passant par le <a href="/support" className="font-bold text-primary underline">formulaire
          de contact</a>. Les signalements sont traités dans les meilleurs délais.
        </LegalP>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <LegalP>
          Le traitement des données personnelles est détaillé dans notre{' '}
          <a href="/politique-confidentialite" className="font-bold text-primary underline">Politique
          de confidentialité</a>.
        </LegalP>
      </LegalSection>

      <LegalSection title="Conditions d'utilisation">
        <LegalP>
          L&apos;usage de l&apos;application est soumis aux <a href="/cgu" className="font-bold text-primary underline">Conditions
          générales d&apos;utilisation</a>.
        </LegalP>
      </LegalSection>
    </LegalPageLayout>
  )
}
