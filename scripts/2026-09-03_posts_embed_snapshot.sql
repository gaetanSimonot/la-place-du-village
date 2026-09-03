-- 2026-09-03 — Figer la vignette de l'élément joint à une publication
--
-- PROBLÈME
--   Une publication ne gardait qu'une référence vers l'élément du village
--   qu'elle annonçait (embed_kind + embed_ref_id) et le rechargeait à chaque
--   affichage. Or ces éléments ont une durée de vie : /api/admin/cleanup
--   SUPPRIME définitivement un événement deux jours après sa fin.
--
--   Le jour venu, la publication affiche « Élément supprimé » et perd tout son
--   sens. Constaté sur le post annonçant le concert de Stellar Jungle : la
--   ligne de l'événement n'existe plus nulle part, elle est irrécupérable.
--
-- CORRECTIF
--   Une copie figée de la vignette (titre, sous-titre, photo) est enregistrée
--   AU MOMENT de la publication. Tant que l'élément vit, l'affichage utilise
--   les données fraîches — une date corrigée doit se voir. Quand il disparaît,
--   la copie prend le relais : la carte reste lisible, simplement plus
--   cliquable, avec une mention adaptée au type (« Événement passé » plutôt
--   que « supprimé », qui laissait croire à une modération).
--
--   Voir src/lib/embedSnapshot.ts.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS embed_snapshot jsonb;

COMMENT ON COLUMN public.posts.embed_snapshot IS
  'Copie figée de la vignette de l''élément joint {t,s,p,at}, prise à la publication. Sert de repli quand l''élément a été supprimé du village.';

-- ─────────────────────────────────────────────────────────────────────────
-- RATTRAPAGE des publications déjà en ligne dont l'élément vit encore.
-- Celles dont l'élément a déjà disparu ne peuvent pas être rattrapées : la
-- donnée n'existe plus. Elles afficheront la mention adaptée à leur type.
-- ─────────────────────────────────────────────────────────────────────────

-- Événements
UPDATE posts p
SET embed_snapshot = jsonb_build_object(
      't', e.titre, 's', l.commune, 'p', e.image_url, 'at', now())
FROM evenements e
LEFT JOIN lieux l ON l.id = e.lieu_id
WHERE p.embed_kind = 'event' AND p.embed_ref_id = e.id::text
  AND p.embed_snapshot IS NULL;

-- Établissements
UPDATE posts p
SET embed_snapshot = jsonb_build_object(
      't', e.nom, 's', e.commune, 'p', e.photos[1], 'at', now())
FROM etablissements e
WHERE p.embed_kind = 'etab' AND p.embed_ref_id = e.id::text
  AND p.embed_snapshot IS NULL;

-- Producteurs
UPDATE posts p
SET embed_snapshot = jsonb_build_object(
      't', pr.nom, 's', pr.commune, 'p', pr.photos[1], 'at', now())
FROM producers pr
WHERE p.embed_kind = 'producer' AND p.embed_ref_id = pr.id::text
  AND p.embed_snapshot IS NULL;

-- Annonces
UPDATE posts p
SET embed_snapshot = jsonb_build_object(
      't', a.titre, 's', coalesce(a.categorie, a.type), 'p', a.photos[1], 'at', now())
FROM annonces a
WHERE p.embed_kind = 'annonce' AND p.embed_ref_id = a.id::text
  AND p.embed_snapshot IS NULL;

-- Promotions
UPDATE posts p
SET embed_snapshot = jsonb_build_object(
      't', coalesce(pm.title, 'Promotion'), 's', NULL, 'p', pm.image_url, 'at', now())
FROM promotions pm
WHERE p.embed_kind = 'promo' AND p.embed_ref_id = pm.id::text
  AND p.embed_snapshot IS NULL;

-- Articles du Journal
UPDATE posts p
SET embed_snapshot = jsonb_build_object(
      't', ar.titre, 's', NULL, 'p', ar.photo_url, 'at', now())
FROM articles_journal ar
WHERE p.embed_kind = 'article' AND p.embed_ref_id = ar.id::text
  AND p.embed_snapshot IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- CONTRÔLE — ce qui a été rattrapé, et ce qui restera sans copie
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  embed_kind,
  count(*)                                   AS publications,
  count(embed_snapshot)                      AS avec_copie,
  count(*) - count(embed_snapshot)           AS sans_copie_irrecuperable
FROM posts
WHERE embed_kind IS NOT NULL
GROUP BY embed_kind
ORDER BY embed_kind;
