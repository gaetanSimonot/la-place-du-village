-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-03 — Ménage : l'affiche « Cours de yoga 2026/27 » (Yoga sous le figuier)
-- ════════════════════════════════════════════════════════════════════════
--
-- CE QUI S'EST PASSÉ (mesuré en production le 03/09/2026)
--   Une affiche de planning reçue par WhatsApp a produit 319 événements, tous
--   publiés, tous en « santé bien-être ». Derrière : 86 créneaux réels et
--   233 doublons purs — même titre, même date, même heure, jusqu'à 22 fois.
--
--   Cause déjà corrigée dans le code (commit 394c68b, 03/09) : la route
--   d'extraction était coupée avant la fin, le collector ne recevait pas de
--   réponse, ne mémorisait pas l'identifiant du message et le renvoyait toutes
--   les 30 minutes. 67 messages entrants pour une seule affiche.
--
--   S'y ajoutent 78 événements posés sur un jour ou une heure ABSENTS de
--   l'affiche (décalage d'un jour d'une relecture à l'autre), et « Atelier
--   yoga » matérialisé 32 fois alors que l'affiche dit « 1 samedi / mois ».
--
-- CE QUE FAIT CE SCRIPT
--   Il ARCHIVE, il ne supprime pas. `statut = 'archive'` retire l'événement de
--   l'agenda, de la carte et des tuiles, mais la ligne reste en base : une
--   erreur de ciblage se rattrape avec le ROLLBACK en bas. On supprimera pour
--   de bon plus tard, une fois le résultat constaté.
--
-- CIBLAGE
--   Trois conditions cumulatives, pour ne rien emporter d'étranger :
--     • un titre de la liste exacte ci-dessous ;
--     • source = 'whatsapp' ;
--     • créé entre le 26/08 et le 04/09/2026, la fenêtre de la boucle.
--   Vérifié le 03/09 : les 32 lignes « Atelier yoga » satisfont les trois.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. AVANT : compter ce qui va être touché (attendu : 319) ───────────
SELECT count(*) AS a_archiver, min(created_at)::date AS du, max(created_at)::date AS au
FROM evenements
WHERE source = 'whatsapp'
  AND created_at >= '2026-08-26' AND created_at < '2026-09-04'
  AND titre IN (
    'Hatha yoga - Célia',  'Hatha Yoga - Célia',
    'Hatha yoga - Béryl',  'Hatha Yoga - Béryl',
    'Yoga Pilates - Béryl',
    'Yin yoga - Célia',
    'Yoga adapté - Béryl', 'Yoga adapté - Célia',
    'Yoga enfant - Célia',
    'Vinyasa - Célia',
    'Atelier yoga'
  );

-- ─── 2. Le ménage ───────────────────────────────────────────────────────
UPDATE evenements
SET statut = 'archive',
    raison_statut = 'Doublons du planning Yoga sous le figuier — voir scripts/2026-09-03_menage_planning_yoga.sql'
WHERE source = 'whatsapp'
  AND created_at >= '2026-08-26' AND created_at < '2026-09-04'
  AND titre IN (
    'Hatha yoga - Célia',  'Hatha Yoga - Célia',
    'Hatha yoga - Béryl',  'Hatha Yoga - Béryl',
    'Yoga Pilates - Béryl',
    'Yin yoga - Célia',
    'Yoga adapté - Béryl', 'Yoga adapté - Célia',
    'Yoga enfant - Célia',
    'Vinyasa - Célia',
    'Atelier yoga'
  );

-- ─── 3. APRÈS : l'agenda doit retomber d'environ 654 à 335 ──────────────
SELECT count(*) FILTER (WHERE statut = 'publie')  AS publies_a_venir,
       count(*) FILTER (WHERE categorie = 'sante_bien_etre' AND statut = 'publie') AS dont_sante
FROM evenements
WHERE date_debut >= current_date;

-- ─── ROLLBACK (si le ciblage a emporté quelque chose de travers) ────────
--   UPDATE evenements SET statut = 'publie', raison_statut = NULL
--   WHERE raison_statut LIKE 'Doublons du planning Yoga sous le figuier%';
-- ════════════════════════════════════════════════════════════════════════
