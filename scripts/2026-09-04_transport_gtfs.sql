-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-04 — Mode « Transport » : les horaires de bus liO
-- ════════════════════════════════════════════════════════════════════════
--
-- SOURCE
--   GTFS du réseau interurbain liO (Région Occitanie), publié sur
--   transport.data.gouv.fr sous licence ODbL. Fichier public, URL stable,
--   aucune clé de notre côté, aucune facturation. Rien n'est scrapé.
--   https://transport.data.gouv.fr/datasets/reseau-lio-occitanie
--
-- PÉRIMÈTRE
--   On n'importe QUE les lignes dont on a besoin — la 608
--   (Montpellier – Ganges – Le Vigan) pour commencer. Le réseau entier fait
--   309 lignes et 75 Mo de tracés ; la 608 seule, c'est 98 arrêts,
--   89 courses, 2 056 passages et 51 tracés. Mesuré le 04/09/2026.
--
-- POURQUOI DES TABLES ET PAS DU GTFS BRUT
--   Le fichier fait 24 Mo compressés. Le relire à chaque affichage de la
--   carte serait absurde. Un cron le rapatrie, en extrait les lignes
--   retenues, et remplit ces tables — qui, elles, se lisent en millisecondes.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Les lignes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transport_lignes (
  route_id      text PRIMARY KEY,
  nom_court     text,
  nom_long      text,
  couleur       text,
  couleur_texte text,
  maj           timestamptz NOT NULL DEFAULT now()
);

-- ─── Les arrêts ─────────────────────────────────────────────────────────
-- lat/lng sont indispensables : sans eux, pas de point sur la carte. Les
-- 98 arrêts de la 608 en ont tous.
CREATE TABLE IF NOT EXISTS public.transport_arrets (
  stop_id text PRIMARY KEY,
  nom     text NOT NULL,
  lat     double precision NOT NULL,
  lng     double precision NOT NULL
);

-- ─── Les tracés ─────────────────────────────────────────────────────────
-- La géométrie de la ligne, telle que le bus la parcourt — pas une droite
-- entre deux arrêts. Un tracé = une ligne du tableau, ses points dans un
-- seul jsonb : [[lng, lat], …]. 51 tracés pour la 608, 55 000 points en tout.
CREATE TABLE IF NOT EXISTS public.transport_traces (
  shape_id text PRIMARY KEY,
  points   jsonb NOT NULL
);

-- ─── Les calendriers de service ─────────────────────────────────────────
-- Quels jours de la semaine une course circule, et entre quelles dates.
CREATE TABLE IF NOT EXISTS public.transport_services (
  service_id text PRIMARY KEY,
  lundi bool NOT NULL DEFAULT false,
  mardi bool NOT NULL DEFAULT false,
  mercredi bool NOT NULL DEFAULT false,
  jeudi bool NOT NULL DEFAULT false,
  vendredi bool NOT NULL DEFAULT false,
  samedi bool NOT NULL DEFAULT false,
  dimanche bool NOT NULL DEFAULT false,
  debut date NOT NULL,
  fin   date NOT NULL
);

-- Les exceptions : un jour férié qui supprime le service, un renfort qui en
-- ajoute un. Sans elles, on annoncerait des bus qui ne roulent pas.
CREATE TABLE IF NOT EXISTS public.transport_services_exceptions (
  service_id text NOT NULL,
  jour       date NOT NULL,
  ajoute     bool NOT NULL,   -- true = service ajouté, false = supprimé
  PRIMARY KEY (service_id, jour)
);

-- ─── Les courses ────────────────────────────────────────────────────────
-- Un aller précis : la ligne, le calendrier qui dit quels jours il roule, le
-- tracé qu'il emprunte, et son sens.
CREATE TABLE IF NOT EXISTS public.transport_courses (
  trip_id     text PRIMARY KEY,
  route_id    text NOT NULL REFERENCES public.transport_lignes(route_id) ON DELETE CASCADE,
  service_id  text NOT NULL,
  shape_id    text,
  sens        smallint,
  destination text
);
CREATE INDEX IF NOT EXISTS transport_courses_route_idx ON public.transport_courses(route_id);
CREATE INDEX IF NOT EXISTS transport_courses_service_idx ON public.transport_courses(service_id);

-- ─── Les passages ───────────────────────────────────────────────────────
-- Le cœur : à quelle heure telle course passe à tel arrêt, et dans quel
-- ordre. C'est ce qui permet de dire « depart avant arrivee » sur la même
-- course, donc de construire un trajet.
--
-- Les heures sont du TEXTE et pas du `time` : le GTFS écrit « 25:10:00 »
-- pour un bus de 1h10 du matin rattaché au service de la veille. Postgres
-- refuserait. La comparaison alphabétique sur « HH:MM:SS » donne le même
-- ordre que la comparaison horaire, zéros de tête compris.
CREATE TABLE IF NOT EXISTS public.transport_passages (
  trip_id text NOT NULL REFERENCES public.transport_courses(trip_id) ON DELETE CASCADE,
  ordre   integer NOT NULL,
  stop_id text NOT NULL,
  arrivee text,
  depart  text,
  PRIMARY KEY (trip_id, ordre)
);
CREATE INDEX IF NOT EXISTS transport_passages_stop_idx ON public.transport_passages(stop_id);
CREATE INDEX IF NOT EXISTS transport_passages_trip_idx ON public.transport_passages(trip_id);

-- ─── Lecture publique ───────────────────────────────────────────────────
-- Ce sont des horaires de bus publics sous licence ouverte : tout le monde
-- les lit, personne ne les écrit. Les écritures passent par le cron, en
-- service_role, qui n'est pas soumis à RLS.
ALTER TABLE public.transport_lignes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_arrets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_traces                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_services              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_services_exceptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_passages              ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transport_lignes','transport_arrets','transport_traces','transport_services',
    'transport_services_exceptions','transport_courses','transport_passages'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lecture', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_lecture', t);
  END LOOP;
END $$;

-- ─── VÉRIFICATION ───────────────────────────────────────────────────────
--   SELECT nom_court, nom_long FROM transport_lignes;
--   SELECT count(*) FROM transport_arrets;    -- attendu ~98 après le 1er import
--   SELECT count(*) FROM transport_passages;  -- attendu ~2056
-- ════════════════════════════════════════════════════════════════════════
