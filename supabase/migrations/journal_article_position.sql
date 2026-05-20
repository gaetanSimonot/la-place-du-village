-- Position de la section article dans le journal (où la placer dans le flow)
-- 1 = en haut (juste après le cover/billet)
-- 2 = entre spotlight et agenda
-- 3 = entre agenda et bons plans (default, comportement actuel)
-- 4 = entre bons plans et petites annonces
-- 5 = en bas (juste avant le saviez-vous)
ALTER TABLE journaux_hebdo
  ADD COLUMN IF NOT EXISTS article_position int DEFAULT 3
    CHECK (article_position BETWEEN 1 AND 5);
