-- =====================================================================
-- PLAN HABITANTS + suppression du plan Max — 2026-05-15
-- =====================================================================
-- Nouveau modèle d'abonnement :
--   - 'basic'      : Villageois (gratuit)
--   - 'habitants'  : Avantages Habitants (4,99€/mois, nouveau)
--   - 'pro'        : Partenaire Local (9€/mois, label UI uniquement,
--                    l'id interne reste 'pro' pour ne rien casser côté
--                    Stripe et code existant)
--
-- Le plan 'max' disparaît : les users qui l'avaient sont migrés en 'pro'.
--
-- ORDRE STRICT : UPDATE d'abord, ALTER ensuite. Sinon Postgres refuse
-- la nouvelle CHECK parce que des 'max' violent encore la contrainte.
-- =====================================================================

-- 1. Migration des 'max' → 'pro' AVANT toute modif de contrainte
UPDATE public.profiles       SET plan = 'pro' WHERE plan = 'max';
UPDATE public.etablissements SET plan = 'pro' WHERE plan = 'max';

-- 2. Mettre la nouvelle CHECK constraint sur profiles.plan
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IS NULL OR plan IN ('basic', 'habitants', 'pro'));

-- 3. Idem etablissements.plan
ALTER TABLE public.etablissements
  DROP CONSTRAINT IF EXISTS etablissements_plan_check;
ALTER TABLE public.etablissements
  ADD CONSTRAINT etablissements_plan_check
  CHECK (plan IS NULL OR plan IN ('basic', 'habitants', 'pro'));

-- =====================================================================
-- Vérifs après run :
--   SELECT plan, count(*) FROM profiles GROUP BY plan;
--   SELECT plan, count(*) FROM etablissements GROUP BY plan;
--   → doit retourner uniquement basic / habitants / pro (+ NULL éventuel)
-- =====================================================================
