-- ============================================================================
-- Scraping de sources RÉCURRENTES (marchés hebdomadaires, permanences…)
-- 2026-08-11
--
-- Principe : une page comme cevinside.fr/marches-cevennes ne contient AUCUNE
-- date — c'est une table de récurrences. On ne stocke donc pas « le marché de
-- Sumène du 19 août » mais « Sumène, mercredi », et on matérialise les N
-- prochaines semaines. Un index unique garantit qu'un re-scrape ne peut PAS
-- recréer une occurrence déjà présente.
--
-- 100 % additif : aucune colonne existante modifiée, aucune donnée touchée.
-- Rollback en bas de fichier.
-- ============================================================================

-- ── 1. evenements : l'étiquette de série + le verrou anti-doublon ────────────

-- serie_cle : identifiant stable d'une série récurrente, ex "marche:sumene-mercredi".
-- NULL pour tous les événements existants et pour tout ce qui n'est pas récurrent.
ALTER TABLE evenements ADD COLUMN IF NOT EXISTS serie_cle text;

COMMENT ON COLUMN evenements.serie_cle IS
  'Identifiant stable d''une série récurrente (ex "marche:sumene-mercredi"). '
  'NULL = événement ponctuel. Couplé à date_debut par un index unique : '
  'garantit qu''un re-scrape ne duplique jamais une occurrence.';

-- Le verrou. En Postgres deux NULL ne sont jamais « égaux » : les événements
-- ponctuels (serie_cle NULL) ne se gênent donc pas entre eux, même à la même
-- date. Seules les séries sont contraintes.
CREATE UNIQUE INDEX IF NOT EXISTS evenements_serie_cle_date_uniq
  ON evenements (serie_cle, date_debut);

-- ── 2. sources : type de source + réglages propres à chaque source ───────────

-- 'evenements' = comportement historique (liste d'événements datés)
-- 'recurrent'  = table de récurrences (marchés…) → nouveau pipeline
ALTER TABLE sources ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'evenements';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sources_type_check'
  ) THEN
    ALTER TABLE sources ADD CONSTRAINT sources_type_check
      CHECK (type IN ('evenements', 'recurrent'));
  END IF;
END $$;

-- Rayon d'insertion propre à la source, en km. NULL = on retombe sur le
-- réglage global config.rayon_insertion_km (100 km aujourd'hui).
-- Indispensable ici : à 100 km, une page « marchés des Cévennes » importe
-- Alès, Florac et Les Vans, qui ne sont pas le monde des habitants.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS rayon_km integer;

-- Horizon de matérialisation, en jours. NULL = 42 (6 semaines).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS horizon_jours integer;

-- Contexte géographique ajouté aux requêtes de géocodage, à la place de
-- "France". Google Places Text Search ignore les paramètres de biais
-- (locationbias, location+radius : vérifié, sans effet) ; le seul levier qui
-- marche est l'indice dans la requête elle-même.
-- Mesuré sur 12 communes : "Cévennes, France" corrige Bréau (518→12 km),
-- Saint-Martial (113→12), Rochegude (96→58), Ste Claire (434→0), sans dégrader
-- un seul cas déjà correct. NULL = "France" = comportement historique.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS indice_geo text;

-- Publier directement, sans passer par la file de validation. La validation
-- d'une source récurrente se fait UNE FOIS sur les règles (via l'aperçu),
-- pas à chaque occurrence — sinon 25 marchés × 6 semaines = 150 lignes à
-- valider une par une, ce qui n'a aucun sens.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS publier_auto boolean NOT NULL DEFAULT false;

-- ── 3. Le prompt d'extraction des règles ────────────────────────────────────
-- Éditable ensuite depuis /admin/prompts comme les autres.

INSERT INTO prompts_ia (id, nom, description, systeme) VALUES (
  'scrape_recurrent',
  'Scraping — récurrences (marchés)',
  'Extrait des RÈGLES de récurrence (commune + jour + saison) au lieu d''événements datés. Utilisé par les sources de type « récurrent ». Réécrit les descriptions au lieu de les recopier.',
$PROMPT$Tu analyses une page web qui liste des rendez-vous RÉCURRENTS : marchés hebdomadaires, marchés nocturnes d'été, marchés de producteurs, permanences.

Ta sortie est un tableau JSON de RÈGLES DE RÉCURRENCE. Jamais d'événements datés.

RÈGLE D'OR : cette page ne contient pas de dates. Ne les invente pas. Tu décris QUAND ÇA REVIENT, pas quand ça a lieu.

Pour chaque rendez-vous récurrent trouvé, produis un objet :

{
  "cle": slug stable, minuscules, sans accent ni espace : "<commune>-<jour>" et un
         qualificatif si nécessaire. Ex : "sumene-mercredi", "ales-lundi-forain",
         "le-vigan-mercredi-nocturne".
         IMPORTANT : deux rendez-vous DIFFÉRENTS dans la même commune le même jour
         doivent avoir des clés différentes. Ajoute alors le qualificatif :
         -forain, -alimentaire, -nocturne, -producteurs, -puces, -bio.
         Une commune qui a un marché le mardi ET le vendredi donne deux règles
         distinctes : c'est normal, ce sont deux marchés.

  "titre": court et naturel. "Marché de Sumène", "Marché nocturne d'Anduze",
           "Marché paysan du Vigan", "Marché aux puces d'Alès".

  "description": UNE à DEUX phrases courtes, ÉCRITES PAR TOI. Trois interdits :

           1. NE RECOPIE JAMAIS une formule de la page source, même partiellement.
              Ses tournures marquantes — "le grand rendez-vous de la vallée des
              Gardons", "l'un des grands marchés du piémont", "le terroir de la
              vallée en condensé" — appartiennent à son auteur. Si tu ne peux dire
              la chose qu'avec ses mots à lui, alors dis autre chose.

           2. NE RÉPÈTE PAS le jour ni l'heure. Ils sont déjà enregistrés à part
              et affichés au-dessus de la description. "Marché du matin qui se
              tient le dimanche" n'apporte rien à personne.

           3. N'invente aucun détail absent de la page.

           Dis plutôt : l'endroit précis dans le village, ce qu'on y trouve, la
           taille. Exemple — la page dit : "le matin, place des Halles, de 8 h à
           13 h. Le « petit » marché de la semaine (le grand, c'est le vendredi)."
           Tu écris : "Sur la place des Halles. Le plus petit des deux marchés
           hebdomadaires."

           Si la page ne dit rien de plus que "le matin", contente-toi du lieu, ou
           laisse description à null. Une description vide vaut mieux qu'une
           paraphrase de l'auteur.

  "commune": le nom exact de la commune.

  "lieu_nom": la place, la halle, le lieu-dit si la page le précise
              ("place des Halles", "Halles de l'Abbaye"), sinon null.

  "jour": "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi"
          | "dimanche" | "tous_les_jours"

  "heure": heure de DÉBUT au format "HH:MM".
           Si la page donne une heure, utilise-la ("de 8 h à 13 h" → "08:00").
           Sinon applique ces conventions :
             "le matin"                        → "08:00"
             "fin de journée", "fin d'après-midi" → "17:00"
             "nocturne", "marché de nuit"      → "18:00"
           Si aucune indication d'aucune sorte → null.

  "periode_debut" et "periode_fin": bornes de saison au format "MM-DD", ou null
           si le rendez-vous a lieu toute l'année. Pas d'année : la règle se
           répète chaque année.
             "toute l'année" ou aucune mention → null et null
             "juillet – août"                  → "07-01" et "08-31"
             "5 mai – 30 septembre"            → "05-05" et "09-30"
             "mi-juin – mi-septembre"          → "06-15" et "09-15"
             "avril – mi-octobre"              → "04-01" et "10-15"
             "Pâques – Toussaint"              → "04-01" et "11-01"
             "du printemps à septembre"        → "04-01" et "09-30"

  "periode_texte": le libellé de période EXACTEMENT tel qu'il apparaît sur la
           page ("mi-juin – mi-septembre"), ou null s'il n'y en a pas. Il sera
           affiché tel quel : c'est plus honnête qu'une fausse précision.

  "regulier": true si le rendez-vous revient chaque semaine (ou chaque jour) de
           façon prévisible. false si la récurrence est irrégulière :
           "le dernier samedi du mois", "les 15, 22 et 29 juillet",
           "certains jeudis", "un dimanche sur deux".

  "note_irreguliere": si regulier vaut false, recopie la formulation de
           récurrence telle quelle pour qu'un humain puisse la traiter.
           Sinon null.
}

À IGNORER complètement : encarts publicitaires, liens vers d'autres pages du
site, blocs d'inscription à une newsletter, mentions légales, et surtout la FAQ
en bas de page — elle ne fait que résumer la liste, tout y est déjà. N'en extrais
aucune règle, tu créerais des doublons.

Réponds UNIQUEMENT avec le tableau JSON. Pas de texte avant, pas de texte après,
pas de balise de code markdown.

Aujourd'hui : {{today}}$PROMPT$
)
ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom,
      description = EXCLUDED.description,
      systeme = EXCLUDED.systeme;


-- ============================================================================
-- ROLLBACK — à garder sous la main
-- ============================================================================
-- DROP INDEX IF EXISTS evenements_serie_cle_date_uniq;
-- ALTER TABLE evenements DROP COLUMN IF EXISTS serie_cle;
-- ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
-- ALTER TABLE sources DROP COLUMN IF EXISTS type;
-- ALTER TABLE sources DROP COLUMN IF EXISTS rayon_km;
-- ALTER TABLE sources DROP COLUMN IF EXISTS horizon_jours;
-- ALTER TABLE sources DROP COLUMN IF EXISTS indice_geo;
-- ALTER TABLE sources DROP COLUMN IF EXISTS publier_auto;
-- DELETE FROM prompts_ia WHERE id = 'scrape_recurrent';
--
-- Et pour effacer les occurrences créées par une source récurrente :
-- DELETE FROM evenements WHERE serie_cle LIKE 'marche:%';
-- ============================================================================
