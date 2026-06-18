-- ════════════════════════════════════════════════════════════════════════
-- Corrections proposées par les utilisateurs sur les événements
-- ════════════════════════════════════════════════════════════════════════
-- Remplace le "signalement texte" par une proposition d'édition structurée :
-- l'utilisateur édite lui-même la fiche (modal d'édition), sa proposition est
-- stockée ici en attente, et l'admin la valide/rejette depuis une notif.
--
-- changes        : draft complet proposé (mêmes clés que le PATCH event)
-- changed_fields : liste des champs qui diffèrent de l'event actuel
--                  (pour surligner dans le modal de revue admin)
-- statut         : en_attente | validee | rejetee
--
-- Accès : exclusivement via API service-role (RLS activé, aucune policy →
-- anon/authenticated bloqués, le service role bypass RLS). Pattern du projet.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.event_corrections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evenement_id   uuid NOT NULL REFERENCES public.evenements(id) ON DELETE CASCADE,
  proposeur_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proposeur_nom  text,
  changes        jsonb NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  statut         text NOT NULL DEFAULT 'en_attente',
  created_at     timestamptz NOT NULL DEFAULT now(),
  traite_at      timestamptz,
  traite_par     uuid
);

-- Index sur les corrections en attente d'un event (revue admin)
CREATE INDEX IF NOT EXISTS event_corrections_pending_idx
  ON public.event_corrections (evenement_id)
  WHERE statut = 'en_attente';

ALTER TABLE public.event_corrections ENABLE ROW LEVEL SECURITY;
