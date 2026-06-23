-- ════════════════════════════════════════════════════════════════════════
-- Newsletter — emails abonnés ajoutés à la main (sans compte)
-- ════════════════════════════════════════════════════════════════════════
-- Permet à l'admin d'ajouter manuellement des adresses à la liste d'envoi
-- (tests, abonnés rencontrés hors-ligne…). Les abonnés "avec compte" restent
-- gérés par profiles.newsletter_optin ; cette table couvre les autres.
-- token = lien de désabonnement 1-clic (comme profiles.newsletter_token).
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.newsletter_extra_emails (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  token      uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_extra_emails ENABLE ROW LEVEL SECURITY;
