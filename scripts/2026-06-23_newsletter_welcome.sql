-- ════════════════════════════════════════════════════════════════════════
-- Newsletter — édition active + envoi auto aux nouveaux abonnés
-- ════════════════════════════════════════════════════════════════════════
-- newsletter_welcomed_at : date à laquelle l'abonné a reçu l'édition courante.
-- Un nouvel abonné (welcomed_at NULL ou < date d'envoi de l'édition courante)
-- reçoit automatiquement la dernière newsletter envoyée (« édition active »),
-- une seule fois. L'édition active est stockée dans config('newsletter_current').
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS newsletter_welcomed_at timestamptz;

ALTER TABLE public.newsletter_extra_emails
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;
