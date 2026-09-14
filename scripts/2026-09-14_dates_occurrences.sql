-- ═══════════════════════════════════════════════════════════════════════
-- LES DATES PLUTÔT QU'UNE RÈGLE
--
-- Ce matin, `jours_semaine` a réglé le cas du rendez-vous du jeudi affiché le
-- lundi. Mais une règle ne saura jamais dire « tous les jeudis SAUF le 25
-- décembre », ni décrire les Puces de Ganges, qui sont mensuelles et
-- irrégulières — six samedis entre juin et octobre, pas un rythme.
--
-- Or la réalité locale est irrégulière : les ateliers s'arrêtent aux vacances,
-- une séance saute un jour férié, un marché de Noël remplace celui du samedi.
-- Une règle demande alors un mécanisme d'exceptions, c'est-à-dire… une liste
-- de dates. Autant partir des dates.
--
-- CE QUI CHANGE DE NATURE : `jours_semaine` cesse d'être la vérité et devient
-- le PARAMÈTRE DE GÉNÉRATION — ce qu'on rejoue pour prolonger une saison.
-- C'est `dates` qui fait foi. Une seule source de vérité, et surtout une
-- source VISIBLE : on voit les dates publiées au lieu de les déduire.
--
--   dates NULL ou vide → l'événement vaut sur toute sa période, comme avant.
--   dates renseigné    → il n'a lieu QUE ces jours-là, point.
--
-- L'HISTORIQUE RESTE. Les dates passées ne sont pas élaguées : un atelier
-- garde la trace des douze fois où il a eu lieu. Seul l'AFFICHAGE ne montre
-- que l'avenir.
--
-- `date_debut` et `date_fin` restent le premier et le dernier jour de la
-- liste : toute la sélection SQL existante continue de fonctionner sans être
-- touchée, et le filtre fin se fait ensuite sur les dates.
--
-- À JOUER AVANT LE DÉPLOIEMENT : la route agenda lit cette colonne, et une
-- colonne absente fait échouer la requête entière — donc la carte avec elle.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS dates date[];

COMMENT ON COLUMN evenements.dates IS
  'Les jours où l''événement a réellement lieu, un par un. NULL ou vide = il vaut sur toute sa période (date_debut..date_fin), comportement historique. Renseigné = il n''a lieu QUE ces jours-là. Les dates passées sont conservées ; seul l''affichage ne montre que l''avenir. date_debut/date_fin restent le min et le max de la liste.';

-- Un garde-fou sur la taille : une saison scolaire fait ~40 dates, un
-- quotidien sur deux ans en ferait 700. Au-delà de 400, c'est une erreur de
-- génération, pas une programmation — et un tableau qui enfle ralentit chaque
-- lecture de l'agenda.
ALTER TABLE evenements
  DROP CONSTRAINT IF EXISTS evenements_dates_raisonnables;

ALTER TABLE evenements
  ADD CONSTRAINT evenements_dates_raisonnables
  CHECK (dates IS NULL OR array_length(dates, 1) <= 400);
