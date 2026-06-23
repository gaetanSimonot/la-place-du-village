-- ════════════════════════════════════════════════════════════════════════
-- Reels : séparer "sur le mur" (toujours) de "sur l'accueil du village" (24h)
-- ════════════════════════════════════════════════════════════════════════
-- Nouveau modèle :
--   - tout le monde peut publier un reel sur SON mur (gratuit : 1/mois) ;
--   - les comptes payants (habitants/pro) peuvent en plus le PROMOUVOIR sur
--     l'accueil du village pendant 24h, un seul à la fois.
-- `sur_accueil` = ce reel est-il poussé sur le fil d'accueil ? Le fil d'accueil
-- ne montre que `sur_accueil = true AND expires_at > now()`. Le mur montre tout.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS sur_accueil boolean NOT NULL DEFAULT false;

-- Index pour le fil d'accueil (reels promus encore actifs)
CREATE INDEX IF NOT EXISTS moments_accueil_idx
  ON public.moments (expires_at)
  WHERE sur_accueil = true;
