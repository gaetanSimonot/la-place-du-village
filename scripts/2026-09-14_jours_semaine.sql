-- ═══════════════════════════════════════════════════════════════════════
-- LES JOURS D'UN RENDEZ-VOUS QUI REVIENT
--
-- Depuis le 03/09/2026, un planning hebdomadaire ne se déplie plus en trente
-- fiches : il donne UN événement couvrant la période, la grille en
-- description. C'était le bon choix — 11 créneaux donnaient 44 fiches par
-- passage et évinçaient de vrais événements de l'agenda.
--
-- Mais « Atelier clown, tous les jeudis » est alors stocké comme un événement
-- continu du 10 septembre au 31 décembre, et la vue « Aujourd'hui » retient
-- tout ce qui chevauche la date du jour — une règle écrite exprès pour que les
-- expositions restent visibles pendant toute leur durée. Un lundi, l'atelier
-- du jeudi s'affichait donc comme s'il avait lieu. Mesuré le 14/09/2026 :
-- 9 événements sur les 32 « installés » du jour ne concernaient pas ce lundi.
--
-- Rien dans les données ne distinguait « ouvert tous les jours » de « le
-- jeudi » : le jour n'existait qu'en toutes lettres dans la description.
-- Cette colonne le rend lisible par la machine.
--
-- CONVENTION ISO 8601 : 1 = lundi … 7 = dimanche.
--   NULL  → aucune récurrence connue. L'événement reste visible tous les jours
--           de sa période, exactement comme avant : c'est le défaut sûr, et
--           c'est la bonne réponse pour une exposition ouverte en continu.
--   {4}   → le jeudi seulement.
--   {1,3} → lundi et mercredi.
--
-- À JOUER AVANT LE DÉPLOIEMENT : la route agenda lit cette colonne, et une
-- colonne absente fait échouer la requête entière — donc la carte avec elle.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS jours_semaine smallint[];

COMMENT ON COLUMN evenements.jours_semaine IS
  'Jours de la semaine où l''événement a réellement lieu, ISO 8601 (1=lundi, 7=dimanche). NULL = pas de récurrence connue, visible tous les jours de sa période. Renseigné à l''extraction pour les plannings récurrents.';

-- Un garde-fou : la colonne n'accepte que des jours réels. Une valeur hors
-- bornes ferait disparaître l'événement de tous les jours à la fois, sans que
-- rien ne le signale.
ALTER TABLE evenements
  DROP CONSTRAINT IF EXISTS evenements_jours_semaine_valides;

ALTER TABLE evenements
  ADD CONSTRAINT evenements_jours_semaine_valides
  CHECK (
    jours_semaine IS NULL
    OR (
      array_length(jours_semaine, 1) BETWEEN 1 AND 7
      AND jours_semaine <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
    )
  );
