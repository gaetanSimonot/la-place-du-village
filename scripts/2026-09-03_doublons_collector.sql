-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-03 — Doublons du collector : tous sujets, pas seulement le yoga
-- ════════════════════════════════════════════════════════════════════════
--
-- POURQUOI
--   La boucle de renvoi du collector (route coupée avant la fin → le message
--   revenait toutes les 30 minutes ; corrigée dans le commit 394c68b) n'a pas
--   frappé que l'affiche de yoga. Mesuré le 03/09/2026 sur les événements
--   PUBLIÉS restants, après le premier ménage :
--
--     x13  Forum des associations — Saint-Hippolyte-du-Fort   07/09
--     x13  Atelier parents - enfants                          12/09
--      x9  Tout feu tout flamme                               26/09
--      x8  Putain de soirée                                   25/09
--      x7  Le petit charivari                                 27/09
--      ... 29 groupes en tout
--
-- COMMENT LA LISTE A ÉTÉ ÉTABLIE
--   Pas par une requête approximative : les identifiants ci-dessous ont été
--   calculés puis relus un par un. Deux événements sont considérés identiques
--   si, après normalisation, ils ont le même titre, la même date et la même
--   heure — ET la même commune.
--
--   La normalisation compte : « St-Hippolyte-du-Fort », « St Hippolyte du
--   Fort » et « Saint-Hippolyte-du-Fort » sont trois orthographes du même
--   lieu. Sans elle, on aurait gardé trois exemplaires du même forum.
--   Accents retirés, ponctuation ignorée, « st » lu « saint ».
--
--   Les lignes dont la commune est vide rejoignent le groupe majoritaire :
--   le géocodage renseignait la commune une fois sur deux pour un lieu
--   pourtant identique (mêmes coordonnées au mètre près).
--
-- CE QUI EST VOLONTAIREMENT ÉPARGNÉ
--   Deux groupes portent le même titre le même jour dans des communes
--   RÉELLEMENT différentes. Ils restent tels quels — mieux vaut un doublon
--   de trop qu'un événement effacé :
--     • « Putain de soirée », 25/09 — Avèze et Le Vigan
--     • « L'art d'accommoder les restes », 10/09 — St-Romain-de-Codières et Ganges
--
--   Dans chaque groupe fusionné, c'est le PLUS ANCIEN qui reste : c'est celui
--   qui a été vu et éventuellement corrigé en premier.
--
-- CE QUE FAIT CE SCRIPT
--   Il ARCHIVE, il ne supprime pas. Les lignes restent en base et le ROLLBACK
--   en bas les remet en ligne.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. AVANT : ces identifiants sont-ils bien publiés ? (attendu : 92) ──
SELECT count(*) AS a_archiver FROM evenements
WHERE statut = 'publie' AND id IN (
  '3f0853ed-f28a-45ea-b037-127d5776fda2',
  'd70d2c40-4a84-45aa-9a91-a0c762e8d9da',
  'e7ace9e0-3baf-4c6a-8b9c-7fad0b55b71f',
  '7507db78-e019-4ea2-884e-135433187936',
  '087fcbaa-2a4e-4ee4-b6e6-51522e7e3a82',
  '12980eaf-05a7-44fa-97d5-ca6da749aee4',
  'd1c002a2-769c-48f5-9122-c71bdcb81683',
  'b32e40ed-7667-40d4-b385-4e807fc7e23b',
  '75876de3-aa41-4b9e-b879-603d247e3000',
  '500158e0-4090-47cc-b2bd-253fe7eaf981',
  'fba7c4cd-dd35-498f-b513-4675c344a500',
  'df4572ce-52c8-46f4-bfcc-177f3cb67717',
  '72e3e0da-5ac6-4457-8a50-28d1819dc250',
  'bc443cb3-7c2b-4ce7-8e99-13a50474f0d9',
  '4e61b7c9-fcf3-482b-b2d4-13f3550b426c',
  '43788208-b8e0-4d2f-b3be-f36c3b4a6fcf',
  '6be10a40-d729-4826-b2ac-1167f3e1ae61',
  '0f13ea90-f0e4-409b-95a7-1ea6da560cab',
  'b409a546-d24c-4dbf-b09b-fe748d86d961',
  '4273108f-5eda-4c42-9959-470ff35c0b2d',
  '2a08f4cc-bf02-43b0-8f72-61222ad2c096',
  '0f33b025-0dfe-46da-9654-e51868b314e4',
  'e1df1a6e-8602-4e4c-b21f-5ac9fa781f43',
  'f6852066-8669-43fe-bf64-087626e681c3',
  'f6ae72d1-8090-44cb-a0b7-ddc296009bce',
  '51400575-1407-48f0-8747-44e4b64fee83',
  'b67819c2-c3ef-4dd5-936b-d0969b6ef7ce',
  'b2eeb41d-5dbe-45aa-95b4-1a8e08db18cd',
  'b902b829-daf4-4bde-9059-bb1c6de8d7c0',
  'c7d835ab-d5f8-430a-8462-a112c24b2d03',
  '63c26de5-a17d-4e39-8ea7-f04105f6fd59',
  'c13ca3e0-e116-4100-a16b-523b78b38587',
  '66ac784e-64c0-4e1d-9311-e8bec96e73e4',
  '01a011f0-f1b1-4ebe-a825-0c469b2d7580',
  'd152d13e-2d8b-4415-8852-e5c1251eb77f',
  '91568c27-0eca-4e1a-bf5d-0ee005258ca4',
  'bfba5b8d-91a8-465b-855e-55c562c87c90',
  'f91d82ff-2116-4565-bb39-a79877f520ba',
  '32e1fbdc-6ceb-401d-adbf-d830969307a2',
  '0c9e3a6d-c451-48c1-9a04-d8e0dca52240',
  '55411aaa-72d4-4b36-b92f-61bb6c3be6f5',
  '26bb97a0-32fd-4392-8613-a98724f7b7d6',
  'd4193617-99ea-43fd-be15-9d2132b74446',
  '1696b971-8369-47dc-930f-5d5c7fb7df3a',
  '60264ed2-d67c-446a-aea5-573f8d50cfaf',
  '8876b095-be99-4395-9993-bbf926d2f04c',
  'f30a5805-1368-43a1-a823-37b2f4358da4',
  '93f1f62a-6897-42f4-83ea-67a3ddb5bce0',
  '33f737c9-1a2b-4b96-bae7-b2adf25369ee',
  'cf5ebc14-521c-4988-8f19-cf550139a919',
  'db921104-9585-4a64-a1ec-808317f4015f',
  'e7d2d619-39e1-4c1d-aabb-8d534f7df281',
  '924555ee-5c39-42da-88f3-319ca941d205',
  '49448b12-8133-49fb-81d6-7d5d54e23db9',
  '50c60883-fcc5-4d44-8e8a-03dcc5c102a9',
  '91f6e977-7626-41a7-86e2-9a032a83a638',
  '8e70b5a7-994e-467c-a705-37512012e676',
  '7e5dc473-0d7a-4c0e-8fca-5fa7f1f7aff4',
  '48e68fab-515b-4ea1-a545-665a3660cb0d',
  'd963774c-5407-4b92-8dd7-f8a42023c09a',
  'c1bb3c60-f47a-4eb7-ae30-a670c2672e63',
  '452b2820-b48d-42bb-a5d0-5c144c5db43d',
  '3da3b1f4-a67e-4f29-9370-fa2bfc764159',
  '5b635748-0de3-4206-9844-8aa5a09d5555',
  'b8b5d8df-c18f-465f-9b4b-950a69d1fe1d',
  '59408a97-08f2-49b4-9647-b180915505cb',
  'fb4ddbbc-e389-4775-8d48-cafcb1ee3a4a',
  'a0e12d86-ff63-4262-8a3f-9db2696b0bb6',
  'b0253dcf-c63e-4459-82b8-74e938410b40',
  '03ab3f42-0862-4430-b084-eb8c6a07fb5b',
  'ae578914-45f5-4035-a9d6-20c03be9742c',
  '7c8d9505-268b-489a-9498-581d1a77d172',
  '1d645674-e301-4eb3-aa97-e5953a2d3769',
  'cf9d1a7e-a7c9-49d0-95f5-d4412c0bb56a',
  '7c6cc589-ffe3-497c-94e7-1882d6e69dff',
  'f79f3430-5824-456a-b405-68731918b004',
  '01f22795-692f-455f-a318-12068c06db4d',
  'e4678f6b-2ace-43e8-af3c-1fd9d530cb1c',
  '199977b4-e6ac-48e6-a8f6-bcc115cc3f36',
  'f39ca38e-bd23-4813-892a-d7790a915cf3',
  'c75e1bdf-00bc-4ab7-a5b8-1601cbdc1c31',
  'ef400b9d-c4a6-40d0-bf49-80bafbf2a6ae',
  'f7ba8c90-3b90-4666-bed6-8b78cad57743',
  'c78faddd-5c7b-4a4f-b23b-a8194347b0ab',
  'f4213c7a-c27a-476e-a1d8-40b253df4d32',
  '095b3b72-009a-4d42-8c1d-abcd83bd76e4',
  '0e9378e5-7c7d-4b99-8122-28994f57a21b',
  '19d3b5af-c0fb-44f9-9fce-9390e2df44b9',
  '84085790-0edf-4afa-a841-b36536c2fe1e',
  'c7888f68-58cb-4b1b-93c1-8be42de306f4',
  'dd96fd4d-3a89-44c9-b42c-0408618703fc',
  '3d950793-2498-46cc-9a37-f207628726c0'
);

-- ─── 2. Le ménage ───────────────────────────────────────────────────────
UPDATE evenements
SET statut = 'archive',
    raison_statut = 'Doublon du collector (boucle de renvoi) — voir scripts/2026-09-03_doublons_collector.sql'
WHERE statut = 'publie' AND id IN (
  '3f0853ed-f28a-45ea-b037-127d5776fda2',
  'd70d2c40-4a84-45aa-9a91-a0c762e8d9da',
  'e7ace9e0-3baf-4c6a-8b9c-7fad0b55b71f',
  '7507db78-e019-4ea2-884e-135433187936',
  '087fcbaa-2a4e-4ee4-b6e6-51522e7e3a82',
  '12980eaf-05a7-44fa-97d5-ca6da749aee4',
  'd1c002a2-769c-48f5-9122-c71bdcb81683',
  'b32e40ed-7667-40d4-b385-4e807fc7e23b',
  '75876de3-aa41-4b9e-b879-603d247e3000',
  '500158e0-4090-47cc-b2bd-253fe7eaf981',
  'fba7c4cd-dd35-498f-b513-4675c344a500',
  'df4572ce-52c8-46f4-bfcc-177f3cb67717',
  '72e3e0da-5ac6-4457-8a50-28d1819dc250',
  'bc443cb3-7c2b-4ce7-8e99-13a50474f0d9',
  '4e61b7c9-fcf3-482b-b2d4-13f3550b426c',
  '43788208-b8e0-4d2f-b3be-f36c3b4a6fcf',
  '6be10a40-d729-4826-b2ac-1167f3e1ae61',
  '0f13ea90-f0e4-409b-95a7-1ea6da560cab',
  'b409a546-d24c-4dbf-b09b-fe748d86d961',
  '4273108f-5eda-4c42-9959-470ff35c0b2d',
  '2a08f4cc-bf02-43b0-8f72-61222ad2c096',
  '0f33b025-0dfe-46da-9654-e51868b314e4',
  'e1df1a6e-8602-4e4c-b21f-5ac9fa781f43',
  'f6852066-8669-43fe-bf64-087626e681c3',
  'f6ae72d1-8090-44cb-a0b7-ddc296009bce',
  '51400575-1407-48f0-8747-44e4b64fee83',
  'b67819c2-c3ef-4dd5-936b-d0969b6ef7ce',
  'b2eeb41d-5dbe-45aa-95b4-1a8e08db18cd',
  'b902b829-daf4-4bde-9059-bb1c6de8d7c0',
  'c7d835ab-d5f8-430a-8462-a112c24b2d03',
  '63c26de5-a17d-4e39-8ea7-f04105f6fd59',
  'c13ca3e0-e116-4100-a16b-523b78b38587',
  '66ac784e-64c0-4e1d-9311-e8bec96e73e4',
  '01a011f0-f1b1-4ebe-a825-0c469b2d7580',
  'd152d13e-2d8b-4415-8852-e5c1251eb77f',
  '91568c27-0eca-4e1a-bf5d-0ee005258ca4',
  'bfba5b8d-91a8-465b-855e-55c562c87c90',
  'f91d82ff-2116-4565-bb39-a79877f520ba',
  '32e1fbdc-6ceb-401d-adbf-d830969307a2',
  '0c9e3a6d-c451-48c1-9a04-d8e0dca52240',
  '55411aaa-72d4-4b36-b92f-61bb6c3be6f5',
  '26bb97a0-32fd-4392-8613-a98724f7b7d6',
  'd4193617-99ea-43fd-be15-9d2132b74446',
  '1696b971-8369-47dc-930f-5d5c7fb7df3a',
  '60264ed2-d67c-446a-aea5-573f8d50cfaf',
  '8876b095-be99-4395-9993-bbf926d2f04c',
  'f30a5805-1368-43a1-a823-37b2f4358da4',
  '93f1f62a-6897-42f4-83ea-67a3ddb5bce0',
  '33f737c9-1a2b-4b96-bae7-b2adf25369ee',
  'cf5ebc14-521c-4988-8f19-cf550139a919',
  'db921104-9585-4a64-a1ec-808317f4015f',
  'e7d2d619-39e1-4c1d-aabb-8d534f7df281',
  '924555ee-5c39-42da-88f3-319ca941d205',
  '49448b12-8133-49fb-81d6-7d5d54e23db9',
  '50c60883-fcc5-4d44-8e8a-03dcc5c102a9',
  '91f6e977-7626-41a7-86e2-9a032a83a638',
  '8e70b5a7-994e-467c-a705-37512012e676',
  '7e5dc473-0d7a-4c0e-8fca-5fa7f1f7aff4',
  '48e68fab-515b-4ea1-a545-665a3660cb0d',
  'd963774c-5407-4b92-8dd7-f8a42023c09a',
  'c1bb3c60-f47a-4eb7-ae30-a670c2672e63',
  '452b2820-b48d-42bb-a5d0-5c144c5db43d',
  '3da3b1f4-a67e-4f29-9370-fa2bfc764159',
  '5b635748-0de3-4206-9844-8aa5a09d5555',
  'b8b5d8df-c18f-465f-9b4b-950a69d1fe1d',
  '59408a97-08f2-49b4-9647-b180915505cb',
  'fb4ddbbc-e389-4775-8d48-cafcb1ee3a4a',
  'a0e12d86-ff63-4262-8a3f-9db2696b0bb6',
  'b0253dcf-c63e-4459-82b8-74e938410b40',
  '03ab3f42-0862-4430-b084-eb8c6a07fb5b',
  'ae578914-45f5-4035-a9d6-20c03be9742c',
  '7c8d9505-268b-489a-9498-581d1a77d172',
  '1d645674-e301-4eb3-aa97-e5953a2d3769',
  'cf9d1a7e-a7c9-49d0-95f5-d4412c0bb56a',
  '7c6cc589-ffe3-497c-94e7-1882d6e69dff',
  'f79f3430-5824-456a-b405-68731918b004',
  '01f22795-692f-455f-a318-12068c06db4d',
  'e4678f6b-2ace-43e8-af3c-1fd9d530cb1c',
  '199977b4-e6ac-48e6-a8f6-bcc115cc3f36',
  'f39ca38e-bd23-4813-892a-d7790a915cf3',
  'c75e1bdf-00bc-4ab7-a5b8-1601cbdc1c31',
  'ef400b9d-c4a6-40d0-bf49-80bafbf2a6ae',
  'f7ba8c90-3b90-4666-bed6-8b78cad57743',
  'c78faddd-5c7b-4a4f-b23b-a8194347b0ab',
  'f4213c7a-c27a-476e-a1d8-40b253df4d32',
  '095b3b72-009a-4d42-8c1d-abcd83bd76e4',
  '0e9378e5-7c7d-4b99-8122-28994f57a21b',
  '19d3b5af-c0fb-44f9-9fce-9390e2df44b9',
  '84085790-0edf-4afa-a841-b36536c2fe1e',
  'c7888f68-58cb-4b1b-93c1-8be42de306f4',
  'dd96fd4d-3a89-44c9-b42c-0408618703fc',
  '3d950793-2498-46cc-9a37-f207628726c0'
);

-- ─── 3. APRÈS : plus aucun doublon de titre+date+heure ──────────────────
SELECT count(*) AS publies_a_venir
FROM evenements WHERE statut = 'publie' AND date_debut >= current_date;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────
--   UPDATE evenements SET statut = 'publie', raison_statut = NULL
--   WHERE raison_statut LIKE 'Doublon du collector%';
-- ════════════════════════════════════════════════════════════════════════
