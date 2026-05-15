-- =====================================================================
-- API RATE LIMITS — 2026-05-15
-- =====================================================================
-- Table d'audit pour les appels API coûteux ou abusables.
-- Une ligne par appel. On compte les appels récents pour décider d'autoriser
-- ou non un nouvel appel.
--
-- Actions tracées :
--   - 'ai_extract'   : /api/transcribe (Whisper) + /api/extract (Claude)
--                      combinés. Plafond 10 / heure / user.
--   - 'create_event' : POST /api/evenements. Plafond 20 / jour / user.
--   - 'create_annonce': POST /api/annonces. Plafond 10 / semaine pour basic,
--                      illimité pour pro/max (donc on log mais on ne bloque pas).
--
-- Service role écrit. Lecture RLS bloquée par défaut (les API routes
-- utilisent service role). User ne voit pas son propre historique pour
-- l'instant (peut être ajouté plus tard si besoin).
--
-- Cleanup : un cron quotidien supprime les lignes > 30 jours.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  called_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_lookup
  ON public.api_rate_limits (user_id, action, called_at DESC);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Pas de policy SELECT/INSERT publique : seul le service role écrit (les API
-- routes). Si un jour on veut exposer l'historique au user, on ajoutera une
-- policy SELECT WHERE auth.uid() = user_id.

-- =====================================================================
-- Cleanup : purge les lignes > 30 jours (chaque nuit à 00:30)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.api_rate_limits_cleanup()
RETURNS void AS $$
BEGIN
  DELETE FROM public.api_rate_limits
  WHERE called_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.api_rate_limits_cleanup() FROM PUBLIC, anon, authenticated;

-- Schedule (idempotent : unschedule d'abord si existe)
DO $$
BEGIN
  PERFORM cron.unschedule('api_rate_limits_cleanup');
EXCEPTION WHEN OTHERS THEN
  -- rien : le job n'existait pas
  NULL;
END $$;

SELECT cron.schedule(
  'api_rate_limits_cleanup',
  '30 0 * * *',
  $$SELECT public.api_rate_limits_cleanup();$$
);

-- Vérifs :
-- SELECT to_regclass('public.api_rate_limits');
-- SELECT jobname FROM cron.job WHERE jobname = 'api_rate_limits_cleanup';
