-- ============================================================================
-- BACKFILL etablissements.plan depuis profiles.plan — 2026-05-12
-- ============================================================================
-- Contexte : avant ce fix, le claim validate cote admin ne mettait a jour
-- que etablissements.user_id, pas etablissements.plan. Resultat : les fiches
-- revendiquees par un user Pro/Max restaient affichees en 'basic' dans
-- "Mon espace" (ProfilView).
--
-- Ce script aligne etablissements.plan sur profiles.plan du proprietaire
-- pour toutes les fiches qui ont un user_id et un plan basic en stale.
--
-- Idempotent.
-- ============================================================================

UPDATE public.etablissements e
SET
  plan = p.plan,
  is_featured = (p.plan = 'pro' OR p.plan = 'max')
FROM public.profiles p
WHERE e.user_id = p.user_id
  AND e.plan = 'basic'
  AND p.plan IN ('pro', 'max');

-- Verification :
-- SELECT e.id, e.nom, e.plan, p.plan as user_plan
-- FROM etablissements e LEFT JOIN profiles p ON p.user_id = e.user_id
-- WHERE e.user_id IS NOT NULL AND e.plan != COALESCE(p.plan, 'basic');
-- → doit retourner 0 lignes (sauf cas spéciaux : cancel Stripe où on veut
--   etab plan basic même si profile était Pro/Max)
