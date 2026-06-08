-- Annonces : fin de l'expiration par le temps — 2026-06-08
-- ============================================================================
-- Décision produit : une annonce ne disparaît QUE si elle est vendue (statut
-- 'vendu') ou supprimée. Plus d'expiration automatique au bout de 3 semaines
-- (basic) / 1 mois (pro). Les dons (don_final) restent visibles.
--
-- À lancer dans le SQL editor Supabase. Sans danger (remplace 2 fonctions cron
-- par des no-op + réactive les annonces déjà expirées).
-- ============================================================================

-- 1. Le cron d'expiration ne fait plus rien
CREATE OR REPLACE FUNCTION public.annonces_cron_expirer()
RETURNS void AS $$
BEGIN
  -- Volontairement vide : plus d'expiration automatique par le temps.
  -- Les annonces restent 'active' jusqu'à vente ou suppression.
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Plus de notif "expire bientôt" (elle serait fausse : rien n'expire plus)
CREATE OR REPLACE FUNCTION public.annonces_cron_notif_expiration()
RETURNS void AS $$
BEGIN
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ré-active les annonces déjà passées en 'expiree' (récupère le djembé & co)
UPDATE public.annonces SET statut = 'active' WHERE statut = 'expiree';

-- Vérif (optionnel) :
--   SELECT statut, count(*) FROM public.annonces GROUP BY statut;
