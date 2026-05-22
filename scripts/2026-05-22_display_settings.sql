-- =====================================================================
-- Profil hybride V3 — colonne display_settings JSONB sur profiles
-- Date : 2026-05-22
--
-- Contexte
-- --------
-- Refonte de l'onglet Profil (PR 1 — Shell + Réglages). Le nouvel écran
-- /reglages expose 6 toggles "Affichage de mon profil" qui permettent à
-- l'utilisateur de masquer indépendamment chaque bloc (bannière, bio,
-- fiche pro, module utile, pages suivies, publications) sur sa propre
-- fiche publique.
--
-- On stocke ces 6 toggles dans une seule colonne JSONB pour éviter une
-- explosion de colonnes booléennes et faciliter l'ajout futur de nouveaux
-- blocs sans migration.
--
-- Note privacy : on garde les 2 booléens existants (is_public + searchable)
-- qui contrôlent la DÉCOUVRABILITÉ (annuaire + recherche). display_settings
-- contrôle seulement l'AFFICHAGE des blocs sur la fiche publique pour les
-- visiteurs qui y arrivent via le lien direct ou la recherche.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_settings jsonb NOT NULL DEFAULT '{
    "banner": true,
    "bio": true,
    "fiche_pro": true,
    "module_utile": true,
    "pages_suivies": false,
    "publications": true
  }'::jsonb;

-- Vérification :
--   SELECT user_id, display_settings FROM public.profiles LIMIT 5;
--   -- Doit retourner le JSONB par défaut pour tous les profils existants.
