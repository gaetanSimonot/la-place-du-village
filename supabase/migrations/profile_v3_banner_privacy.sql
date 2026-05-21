-- ============================================================================
-- PROFILE V3 — Bannière + Paramètres de confidentialité
-- ============================================================================
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE). À lancer une fois dans
-- Supabase Dashboard → SQL Editor.
-- Reversible (cf. rollback en fin de fichier).
--
-- Couvre :
--   1. profiles.banner_url       : URL de bannière custom (1 par user, tous plans)
--   2. profiles.is_public        : apparaître sur la page "Les gens" (default true)
--   3. profiles.searchable       : apparaître dans la barre de recherche (default true)
--   4. Vue profiles_public_listing  : forge l'enforcement pour la future page Les gens
--   5. Vue profiles_searchable      : forge l'enforcement pour la future recherche
--
-- ENFORCEMENT RLS — APPROCHE PRAGMATIQUE
--   La policy SELECT actuelle sur `profiles` est publique (USING true) et reste
--   ainsi : c'est nécessaire pour les jointures techniques (affichage du nom
--   d'un conducteur covoit, d'un vendeur d'annonce, d'un commenteur d'event,
--   etc.). Restreindre cette policy casserait beaucoup de fonctionnalités.
--
--   L'enforcement se fait au niveau des VUES dédiées :
--     - profiles_public_listing → filtre WHERE is_public = true AND banned = false
--     - profiles_searchable      → filtre WHERE searchable = true AND banned = false
--
--   Les vues utilisent `security_invoker = true` : la RLS sous-jacente de
--   profiles s'applique (publique). Mais le WHERE de la vue est INVIOLABLE :
--   impossible de récupérer un profile is_public=false via la vue.
--
--   → La page "Les gens" et la recherche (futures PRs) doivent UTILISER ces
--     vues et JAMAIS faire `SELECT * FROM profiles` direct. C'est la
--     discipline d'utilisation qui complète l'enforcement DB.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- 1) Colonnes profiles
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banner_url  TEXT,
  ADD COLUMN IF NOT EXISTS is_public   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS searchable  BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.banner_url IS
  'URL publique de la bannière du profil (bucket avatars, path banners/{userId}.ext).';
COMMENT ON COLUMN profiles.is_public IS
  'Si false, le user n''apparaît PAS dans la page "Les gens". Filtre enforced via vue profiles_public_listing.';
COMMENT ON COLUMN profiles.searchable IS
  'Si false, le user n''apparaît PAS dans la barre de recherche. Filtre enforced via vue profiles_searchable.';


-- ──────────────────────────────────────────────────────────────────────────
-- 2) Vue profiles_public_listing
--    Utilisée par la future page "Les gens".
--    `security_invoker = true` → respecte la RLS de profiles (publique).
--    Le WHERE de la vue est INVIOLABLE : un profil is_public=false n'apparaît
--    JAMAIS via cette vue, peu importe la query.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW profiles_public_listing
  WITH (security_invoker = true) AS
SELECT
  user_id,
  display_name,
  avatar_url,
  banner_url,
  bio,
  ville,
  genre,
  is_verified,
  plan
FROM profiles
WHERE is_public = true
  AND banned    = false;

COMMENT ON VIEW profiles_public_listing IS
  'Liste publique des profils. Filtré is_public=true AND banned=false. La page Les gens DOIT lire cette vue, jamais profiles direct.';


-- ──────────────────────────────────────────────────────────────────────────
-- 3) Vue profiles_searchable
--    Utilisée par la future barre de recherche.
--    Même principe : WHERE searchable = true inviolable.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW profiles_searchable
  WITH (security_invoker = true) AS
SELECT
  user_id,
  display_name,
  avatar_url,
  ville
FROM profiles
WHERE searchable = true
  AND banned     = false;

COMMENT ON VIEW profiles_searchable IS
  'Profils retournables par recherche par nom/ville. Filtré searchable=true AND banned=false. La recherche DOIT lire cette vue.';


-- ──────────────────────────────────────────────────────────────────────────
-- 4) Storage : permettre upload bannière via path banners/{userId}.ext
--    Le bucket `avatars` existe déjà (utilisé pour les avatars users) et est
--    public. Le pattern signed-URL côté API (/api/storage/signed-upload-url)
--    génère un path sous le contrôle du serveur (= jamais user-controlled),
--    donc pas besoin de policies storage spécifiques additionnelles côté DB :
--    le service_role (utilisé par /api/storage/signed-upload-url) bypasse RLS
--    pour générer le signed URL, puis l'upload PUT direct est autorisé par
--    le token signé pour le path précis et la durée précise.
-- ──────────────────────────────────────────────────────────────────────────


-- ============================================================================
-- ROLLBACK (à exécuter manuellement si besoin)
-- ============================================================================
-- DROP VIEW IF EXISTS profiles_searchable;
-- DROP VIEW IF EXISTS profiles_public_listing;
-- ALTER TABLE profiles
--   DROP COLUMN IF EXISTS banner_url,
--   DROP COLUMN IF EXISTS is_public,
--   DROP COLUMN IF EXISTS searchable;
