-- ═══════════════════════════════════════════════════════════════════════
-- ASSISTANT VILLAGE — la recherche, en vrai
--
-- Constat en base : chercher « électricien » ne renvoyait RIEN, alors que le
-- village en compte dix-huit. Deux raisons cumulées.
--
--   1. Les accents. `ilike '%électricien%'` ne trouve pas « Electricité » :
--      pour Postgres, « é » et « e » sont deux caractères différents.
--   2. Le mot cherché n'est jamais le mot écrit. Les enseignes disent
--      « Electricité », « V.elec », « PIC ELEC », « Fred'elec » ; les gens
--      disent « électricien ». Et « manger italien » ne se trouve sous aucun
--      de ces deux mots : ça s'appelle « Pizzeria », « Trattoria », « Pasta ».
--
-- La réponse au 1. est ici : on désaccentue des DEUX côtés, et on cherche
-- dans le nom ET les descriptions.
--
-- La réponse au 2. n'est pas dans le SQL — aucune troncature ne fera le lien
-- entre « italien » et « gnocchi ». C'est l'assistant qui élargit : il donne
-- une LISTE de mots tels qu'ils apparaissent sur les enseignes, et ces
-- fonctions retiennent une fiche dès qu'UN de ces mots colle. Le classement
-- se fait ensuite, côté serveur, selon combien de mots ont répondu.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ── Normaliser, une fois pour toutes ───────────────────────────────────
-- « saint bauzille » ne trouvait pas « Saint-Bauzille-de-Putois » : le tiret
-- suffisait à tout bloquer. On aplatit donc de la même façon les deux côtés
-- de la comparaison — accents, casse, tirets, apostrophes droites et
-- courbes, points. « st-jean » et « St Jean » deviennent la même chose.
CREATE OR REPLACE FUNCTION assistant_norm(v text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT lower(translate(unaccent(coalesce(v, '')), '-''’.', '    '))
$$;

-- Les signatures changent (un mot → une liste) : CREATE OR REPLACE ne sait
-- pas modifier des types de paramètres, il faut retirer les anciennes.
DROP FUNCTION IF EXISTS assistant_etablissements(text, text, text, int);
DROP FUNCTION IF EXISTS assistant_producteurs(text, text, int);
DROP FUNCTION IF EXISTS assistant_evenements(text, text, text, text[], text, int);
DROP FUNCTION IF EXISTS assistant_evenements(text, text, text[], text[], text, int);

-- ── Les établissements ─────────────────────────────────────────────────
-- SETOF etablissements : la fonction renvoie les LIGNES ENTIÈRES, donc les
-- cartes de l'assistant affichent exactement ce que la base contient.
CREATE OR REPLACE FUNCTION assistant_etablissements(
  termes          text[] DEFAULT NULL,
  type_filtre     text   DEFAULT NULL,
  commune_filtre  text   DEFAULT NULL,
  lim             int    DEFAULT 30
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
          OR assistant_norm(e.commune) LIKE '%' || assistant_norm(commune_filtre) || '%')
     AND (termes IS NULL OR cardinality(termes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(termes) AS t
            WHERE assistant_norm(e.nom)                LIKE '%' || assistant_norm(t) || '%'
               OR assistant_norm(e.description_courte) LIKE '%' || assistant_norm(t) || '%'
               OR assistant_norm(e.description_longue) LIKE '%' || assistant_norm(t) || '%'))
   -- Sans mot cherché, les mises en avant ouvrent la liste. Dès qu'il y a un
   -- mot, c'est le serveur qui reclasse par pertinence : une fiche qui répond
   -- vraiment passe avant une fiche mise en avant qui répond de loin.
   ORDER BY (e.is_featured OR e.plan = 'pro') DESC,
            e.note_google DESC NULLS LAST,
            e.nom
   LIMIT greatest(1, least(coalesce(lim, 30), 60));
$$;

-- ── Les producteurs ────────────────────────────────────────────────────
-- Table séparée dans ce projet, mais un producteur EST un commerce local :
-- « du fromage de chèvre » doit le trouver.
CREATE OR REPLACE FUNCTION assistant_producteurs(
  termes          text[] DEFAULT NULL,
  commune_filtre  text   DEFAULT NULL,
  lim             int    DEFAULT 10
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
          OR assistant_norm(p.commune) LIKE '%' || assistant_norm(commune_filtre) || '%')
     AND (termes IS NULL OR cardinality(termes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(termes) AS t
            WHERE assistant_norm(p.nom)                LIKE '%' || assistant_norm(t) || '%'
               OR assistant_norm(p.description_courte) LIKE '%' || assistant_norm(t) || '%'
               OR assistant_norm(p.description_longue) LIKE '%' || assistant_norm(t) || '%'))
   ORDER BY p.nom
   LIMIT greatest(1, least(coalesce(lim, 10), 30));
$$;

-- ── Les événements ─────────────────────────────────────────────────────
-- Même mal, même remède : « théâtre » ne trouvait pas « Theatre », et la
-- recherche ne regardait que le titre alors que le nom d'un groupe ou d'un
-- artiste est le plus souvent dans la description.
--
-- Les dates sont comparées en texte : la colonne peut être une date ou du
-- texte selon l'historique, et « AAAA-MM-JJ » se compare bien dans les deux
-- cas. Un événement est retenu s'il CHEVAUCHE la fenêtre — une expo commencée
-- en juin court encore en août.
CREATE OR REPLACE FUNCTION assistant_evenements(
  du              text,
  au              text,
  termes          text[]  DEFAULT NULL,
  cats            text[]  DEFAULT NULL,
  commune_filtre  text    DEFAULT NULL,
  continus        boolean DEFAULT false,
  lim             int     DEFAULT 40
)
RETURNS SETOF evenements
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT e.*
    FROM evenements e
    LEFT JOIN lieux l ON l.id = e.lieu_id
   WHERE e.statut = 'publie'
     AND e.date_debut::text <= au
     AND coalesce(e.date_fin, e.date_debut)::text >= du
     -- LE FILTRE QUI COMPTE : un rendez-vous daté, ou quelque chose qui dure ?
     -- 73 événements chevauchent un week-end donné, dont une exposition
     -- ouverte depuis 346 jours. Triés par date de début, les permanences
     -- occupaient les douze premières places et les vraies sorties du samedi
     -- n'atteignaient jamais l'assistant. La durée se tranche donc ICI, avant
     -- la limite — la trancher après revient à ne rien trancher.
     AND (CASE WHEN continus
               THEN (coalesce(e.date_fin, e.date_debut)::date - e.date_debut::date) >= 7
               ELSE (coalesce(e.date_fin, e.date_debut)::date - e.date_debut::date) <  7
          END)
     AND (cats IS NULL OR cardinality(cats) = 0
          OR coalesce(e.categories, ARRAY[e.categorie]) && cats)
     AND (commune_filtre IS NULL
          OR assistant_norm(l.commune) LIKE '%' || assistant_norm(commune_filtre) || '%')
     AND (termes IS NULL OR cardinality(termes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(termes) AS t
            WHERE assistant_norm(e.titre)       LIKE '%' || assistant_norm(t) || '%'
               OR assistant_norm(e.description) LIKE '%' || assistant_norm(t) || '%'))
   ORDER BY e.date_debut
   LIMIT greatest(1, least(coalesce(lim, 40), 80));
$$;

-- Lecture publique : ces tables sont déjà consultables sans compte dans
-- l'app. Les fonctions n'ouvrent donc rien de nouveau.
GRANT EXECUTE ON FUNCTION assistant_norm(text)                                       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assistant_etablissements(text[], text, text, int)          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assistant_producteurs(text[], text, int)                   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assistant_evenements(text, text, text[], text[], text, boolean, int) TO anon, authenticated, service_role;
