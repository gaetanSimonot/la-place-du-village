-- ═══════════════════════════════════════════════════════════════════════
-- ASSISTANT VILLAGE — la recherche de lieux, en vrai
--
-- Constat en base : chercher « électricien » ne renvoyait RIEN, alors que le
-- village compte au moins cinq électriciens. Deux raisons cumulées.
--
--   1. Les accents. `ilike '%électricien%'` ne trouve pas « Electricité » :
--      pour Postgres, « é » et « e » sont deux caractères différents.
--   2. Le métier ne s'écrit jamais comme on le cherche. Les fiches disent
--      « Electricité », « Plomberie », « Pizzeria » ; les gens tapent
--      « électricien », « plombier », « pizza ».
--
-- D'où ces deux fonctions : elles désaccentuent des DEUX côtés et cherchent
-- dans le nom ET les descriptions. La troncature au radical (« electr ») est
-- faite côté serveur, en cascade, quand le mot entier ne donne rien.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ── Les établissements ─────────────────────────────────────────────────
-- SETOF etablissements : la fonction renvoie les LIGNES ENTIÈRES, donc les
-- cartes de l'assistant affichent exactement ce que la base contient.
CREATE OR REPLACE FUNCTION assistant_etablissements(
  terme           text DEFAULT NULL,
  type_filtre     text DEFAULT NULL,
  commune_filtre  text DEFAULT NULL,
  lim             int  DEFAULT 12
)
RETURNS SETOF etablissements
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT e.*
    FROM etablissements e
   WHERE (type_filtre IS NULL OR e.type = type_filtre)
     AND (commune_filtre IS NULL
          OR unaccent(coalesce(e.commune, '')) ILIKE '%' || unaccent(commune_filtre) || '%')
     AND (terme IS NULL
          OR unaccent(coalesce(e.nom, ''))                ILIKE '%' || unaccent(terme) || '%'
          OR unaccent(coalesce(e.description_courte, '')) ILIKE '%' || unaccent(terme) || '%'
          OR unaccent(coalesce(e.description_longue, '')) ILIKE '%' || unaccent(terme) || '%')
   -- Les mises en avant passent devant, puis la note. Le classement ne dit
   -- rien de la qualité : l'assistant a pour consigne de NOMMER la mise en
   -- avant, jamais de la traduire en jugement.
   ORDER BY (e.is_featured OR e.plan = 'pro') DESC,
            e.note_google DESC NULLS LAST,
            e.nom
   LIMIT greatest(1, least(coalesce(lim, 12), 30));
$$;

-- ── Les producteurs ────────────────────────────────────────────────────
-- Table séparée dans ce projet, mais un producteur EST un commerce local :
-- « où acheter du fromage » doit le trouver.
CREATE OR REPLACE FUNCTION assistant_producteurs(
  terme           text DEFAULT NULL,
  commune_filtre  text DEFAULT NULL,
  lim             int  DEFAULT 6
)
RETURNS SETOF producers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p.*
    FROM producers p
   WHERE (commune_filtre IS NULL
          OR unaccent(coalesce(p.commune, '')) ILIKE '%' || unaccent(commune_filtre) || '%')
     AND (terme IS NULL
          OR unaccent(coalesce(p.nom, ''))                ILIKE '%' || unaccent(terme) || '%'
          OR unaccent(coalesce(p.description_courte, '')) ILIKE '%' || unaccent(terme) || '%'
          OR unaccent(coalesce(p.description_longue, '')) ILIKE '%' || unaccent(terme) || '%')
   ORDER BY p.nom
   LIMIT greatest(1, least(coalesce(lim, 6), 20));
$$;

-- Lecture publique : ces deux tables sont déjà consultables sans compte
-- dans l'app. Les fonctions n'ouvrent donc rien de nouveau.
GRANT EXECUTE ON FUNCTION assistant_etablissements(text, text, text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assistant_producteurs(text, text, int)          TO anon, authenticated, service_role;
