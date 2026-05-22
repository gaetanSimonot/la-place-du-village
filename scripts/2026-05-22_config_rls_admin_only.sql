-- =====================================================================
-- RLS config — restreindre UPDATE aux admins uniquement
-- Date : 2026-05-22
--
-- Avant : policy "config_write" autorisait tout user authentifié
--   (auth.role() = 'authenticated') → n'importe quel user connecté
--   pouvait modifier la config de l'app.
--
-- Après : "config_write" autorise UPDATE seulement si public.is_admin()
--   est vrai. Le service_role bypass RLS (comme toujours) → les routes
--   API admin qui utilisent supabaseAdmin continuent de marcher.
--
-- Ne touche PAS à la policy SELECT de config (lecture publique inchangée).
-- =====================================================================

DROP POLICY IF EXISTS "config_write" ON public.config;

CREATE POLICY "config_write" ON public.config
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
