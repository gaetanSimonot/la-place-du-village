-- Enchère inversée : le seuil devient un PLANCHER (ne devient plus gratuit) — 2026-06-08
-- ============================================================================
-- Nouvelle règle :
--   - AVEC seuil : le prix baisse chaque jour puis S'ARRÊTE au seuil. L'annonce
--     reste une enchère active, vendable à ce prix. Elle ne devient JAMAIS un don.
--   - SANS seuil : le prix descend jusqu'à ~0 (< 1 €) puis devient un DON gratuit.
--
-- À lancer dans le SQL editor Supabase.
-- ============================================================================

-- 1. Nouveau cron de baisse
CREATE OR REPLACE FUNCTION public.annonces_cron_baisse_encheres()
RETURNS void AS $$
DECLARE
  r record;
  nouveau_prix numeric(10,2);
BEGIN
  FOR r IN
    SELECT id, user_id, prix_actuel, prix_seuil, taux_baisse_pct, titre
    FROM public.annonces
    WHERE type = 'enchere_inversee'
      AND statut = 'active'
      AND taux_baisse_pct IS NOT NULL
      AND prix_actuel IS NOT NULL
  LOOP
    nouveau_prix := round(r.prix_actuel * (1 - r.taux_baisse_pct / 100.0), 2);

    IF r.prix_seuil IS NOT NULL THEN
      -- AVEC seuil : plancher. Le prix s'arrête au seuil, l'annonce reste active.
      IF nouveau_prix <= r.prix_seuil THEN
        IF r.prix_actuel <> r.prix_seuil THEN
          UPDATE public.annonces SET prix_actuel = r.prix_seuil WHERE id = r.id;
        END IF;
        -- déjà au plancher → rien à faire (on ne descend plus)
      ELSE
        UPDATE public.annonces SET prix_actuel = nouveau_prix WHERE id = r.id;
      END IF;
    ELSE
      -- SANS seuil : descend jusqu'à ~0 puis devient un don gratuit.
      IF nouveau_prix < 1 THEN
        UPDATE public.annonces
        SET statut = 'don_final', prix_actuel = 0, type = 'don'
        WHERE id = r.id;
        INSERT INTO public.notifications (user_id, type, actor_name, target_type, target_id, lu)
        VALUES (r.user_id, 'annonce_devient_don', 'Système', 'annonce', r.id, false);
      ELSE
        UPDATE public.annonces SET prix_actuel = nouveau_prix WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Récupère les enchères AVEC seuil devenues gratuites par erreur :
--    on les remet en enchère active, au prix de leur seuil.
UPDATE public.annonces
SET statut = 'active', type = 'enchere_inversee', prix_actuel = prix_seuil
WHERE statut = 'don_final'
  AND prix_seuil IS NOT NULL
  AND prix_seuil > 0;

-- Vérif (optionnel) :
--   SELECT titre, type, statut, prix_seuil, prix_actuel FROM public.annonces
--   WHERE type='enchere_inversee' OR statut='don_final';
