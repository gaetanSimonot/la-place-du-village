-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-03 — Extraction : un planning n'est plus deplie en N evenements
-- ════════════════════════════════════════════════════════════════════════
--
-- POURQUOI
--   Le prompt `extract_multiple` disait, mot pour mot :
--
--     « Si tu tombes sur par exemple "tous les vendredi" ou "tous les lundis
--       de mars" tu dois creer au minimum les rendez vous pour 1 mois. »
--
--   Le modele a obei. Une affiche de planning de cours de yoga (11 creneaux
--   hebdomadaires, 2 professeures, 4 communes) a donc produit 44 evenements
--   par passage. Le message ayant ete renvoye 67 fois par le collector (cause
--   distincte, corrigee dans le commit 394c68b), on a atteint 319 evenements
--   publies pour une seule affiche — 233 doublons purs, et pres de la moitie
--   de l'agenda a venir.
--
--   Mesure du 03/09/2026 : 654 evenements a venir, dont 408 en sante
--   bien-etre, dont 319 venant de cette seule image.
--
-- CE QUE FAIT CE SCRIPT
--   Il remplace ce paragraphe par la regle inverse : un planning recurrent
--   donne UN evenement couvrant la periode, avec la grille en description.
--   C'est la forme que prennent deja les expositions et les permanences dans
--   la base (42 evenements a cheval sur plusieurs mois au 03/09), et l'affiche
--   elle-meme sert d'illustration.
--
--   Le reste du prompt n'est pas touche : `replace()` n'agit que sur ce
--   paragraphe. Si le texte a ete edite entre-temps dans /admin, la requete
--   de controle ci-dessous renverra 0 et il n'y aura AUCUNE modification.
--
-- GARDE-FOU COMPLEMENTAIRE (deja dans le code, pas dans ce script)
--   src/app/api/extract/route.ts : au-dela de 8 evenements tires d'un meme
--   message, plus rien n'est publie automatiquement — tout part en
--   `a_verifier`. Le prompt peut echouer ; ce seuil, non.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. AVANT : le paragraphe est-il bien present ? (attendu : 1) ───────
SELECT count(*) AS a_modifier
FROM prompts_ia
WHERE id = 'extract_multiple'
  AND systeme LIKE '%tu dois creer au minimum les rendez vous pour 1 mois%'
   OR (id = 'extract_multiple'
       AND systeme LIKE '%tu dois cr' || chr(233) || 'er au minimum les rendez vous pour 1 mois%');

-- ─── 2. Le remplacement ─────────────────────────────────────────────────
UPDATE prompts_ia
SET systeme = replace(systeme, $ancien$Si tu tombes sur par exemple "tous les vendredi" ou "tous les lundis de mars" tu dois créer au minimum les rendez vous pour 1 mois. En prenant en compte les dates que tu peut déduire à partir de {{today}} et pour l'année en cours.$ancien$, $nouveau$PLANNING RECURRENT — REGLE ABSOLUE
Si le document est un PLANNING d'activites regulieres (grille de jours de la semaine, tableau de cours, horaires d'ateliers hebdomadaires, programme d'une saison, ou la mention "tous les mercredis" / "tous les vendredis"), tu ne dois PAS creer un evenement par seance.
Tu retournes UN SEUL evenement :
- titre : le nom de l'activite suivi de l'organisateur, ex. "Cours de yoga — Yoga sous le figuier"
- date_debut : le premier jour indique, sinon {{today}}
- date_fin : le dernier jour indique ; si aucune fin n'est donnee, la fin de la saison annoncee, sinon {{today}} + 3 mois
- heure : null (il y en a plusieurs)
- description : la grille COMPLETE, une ligne par creneau, avec le jour, l'horaire, l'intitule, l'intervenant et la commune
Une seance hebdomadaire n'est pas un evenement : on ne la "rate" pas, elle revient la semaine suivante. Et l'affiche elle-meme porte deja le planning en image.

EXCEPTION — des dates DISTINCTES restent des evenements distincts : un festival avec trois concerts trois soirs differents, ou trois conferences sur trois sujets differents, donnent bien un evenement par date. La difference tient a la repetition : si c'est la meme chose qui revient a l'identique, c'est un planning ; si chaque date a son propre contenu, ce sont des evenements.

DANS LE DOUTE : un seul evenement couvrant la periode. Il vaut mieux une fiche a completer que trente a supprimer.$nouveau$)
WHERE id = 'extract_multiple';

-- ─── 3. APRES : la nouvelle regle est-elle en place ? (attendu : 1 et 0) ─
SELECT
  count(*) FILTER (WHERE systeme LIKE '%PLANNING RECURRENT%')                    AS regle_posee,
  count(*) FILTER (WHERE systeme LIKE '%au minimum les rendez vous pour 1 mois%') AS ancienne_restante
FROM prompts_ia
WHERE id = 'extract_multiple';

-- ─── ROLLBACK ───────────────────────────────────────────────────────────
--   Le prompt est editable dans /admin (Reglages > Prompts IA). Pour revenir
--   en arriere, remplacer le bloc « PLANNING RECURRENT » par la phrase
--   d'origine citee en tete de ce fichier.
-- ════════════════════════════════════════════════════════════════════════
