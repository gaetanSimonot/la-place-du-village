-- =====================================================================
-- Module Petites Annonces & Enchères — La Place du Village
-- Date : 2026-05-12
--
-- Pré-requis Supabase Dashboard :
--   - Database > Extensions > activer pg_cron
--   - Storage > créer le bucket "annonces" (public, image/*, 10 MB max)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================================
-- 1. TABLE PRINCIPALE : annonces
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contenu
  type              text NOT NULL,                  -- 'vente' | 'troc' | 'don' | 'enchere_inversee'
  titre             text NOT NULL,
  description       text,
  categorie         text NOT NULL,                  -- défini app-side
  photos            text[] NOT NULL DEFAULT '{}',   -- URLs Supabase Storage bucket "annonces"

  -- Prix
  prix_initial      numeric(10,2),                  -- vente / enchere_inversee
  prix_actuel       numeric(10,2),                  -- enchere : décroît, sinon = prix_initial
  prix_seuil        numeric(10,2),                  -- enchere_inversee : prix min avant bascule en don
  taux_baisse_pct   numeric(5,2),                   -- enchere_inversee : % de baisse par jour

  -- Contact (choix posteur, peut être NULL)
  contact_tel       text,
  contact_email     text,

  -- Localisation
  ville             text,
  lat               double precision,
  lng               double precision,

  -- Cycle de vie
  statut            text NOT NULL DEFAULT 'active', -- 'active' | 'vendu' | 'expiree' | 'don_final'
  expires_at        timestamptz NOT NULL,
  vendu_at          timestamptz,

  -- Sponsoring
  sponsored         boolean NOT NULL DEFAULT false,
  sponsored_until   timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.annonces.type   IS 'vente | troc | don | enchere_inversee';
COMMENT ON COLUMN public.annonces.statut IS 'active | vendu | expiree | don_final';

CREATE INDEX IF NOT EXISTS idx_annonces_statut     ON public.annonces (statut);
CREATE INDEX IF NOT EXISTS idx_annonces_user_id    ON public.annonces (user_id);
CREATE INDEX IF NOT EXISTS idx_annonces_type       ON public.annonces (type);
CREATE INDEX IF NOT EXISTS idx_annonces_categorie  ON public.annonces (categorie);
CREATE INDEX IF NOT EXISTS idx_annonces_sponsored  ON public.annonces (sponsored, sponsored_until) WHERE sponsored = true;
CREATE INDEX IF NOT EXISTS idx_annonces_expires_at ON public.annonces (expires_at) WHERE statut = 'active';
CREATE INDEX IF NOT EXISTS idx_annonces_created_at ON public.annonces (created_at DESC);

-- =====================================================================
-- 2. INTÉRÊTS (clic "ça m'intéresse")
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces_interets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id   uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (annonce_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_annonces_interets_annonce ON public.annonces_interets (annonce_id);
CREATE INDEX IF NOT EXISTS idx_annonces_interets_user    ON public.annonces_interets (user_id);

-- =====================================================================
-- 3. ENCHÈRES PRISES (premier-servi via UNIQUE annonce_id)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.annonces_encheres_prises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id   uuid NOT NULL UNIQUE REFERENCES public.annonces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,
  prix_pris    numeric(10,2) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encheres_prises_user ON public.annonces_encheres_prises (user_id);

-- =====================================================================
-- 4. TRIGGERS — updated_at + expires_at automatique selon le plan
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annonces_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_annonces_updated_at ON public.annonces;
CREATE TRIGGER trg_annonces_updated_at
  BEFORE UPDATE ON public.annonces
  FOR EACH ROW EXECUTE FUNCTION public.annonces_set_updated_at();

-- Basic : 3 semaines | Pro/Max : 1 mois
CREATE OR REPLACE FUNCTION public.annonces_set_expires_at()
RETURNS trigger AS $$
DECLARE
  user_plan text;
BEGIN
  IF NEW.expires_at IS NULL THEN
    SELECT plan INTO user_plan FROM public.profiles WHERE user_id = NEW.user_id;
    IF user_plan IN ('pro', 'max') THEN
      NEW.expires_at = now() + interval '1 month';
    ELSE
      NEW.expires_at = now() + interval '3 weeks';
    END IF;
  END IF;

  IF NEW.type = 'enchere_inversee' AND NEW.prix_actuel IS NULL THEN
    NEW.prix_actuel = NEW.prix_initial;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_annonces_set_expires_at ON public.annonces;
CREATE TRIGGER trg_annonces_set_expires_at
  BEFORE INSERT ON public.annonces
  FOR EACH ROW EXECUTE FUNCTION public.annonces_set_expires_at();

-- =====================================================================
-- 5. CRON — Baisse quotidienne des enchères inversées
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annonces_cron_baisse_encheres()
RETURNS void AS $$
DECLARE
  r record;
  nouveau_prix numeric(10,2);
BEGIN
  FOR r IN
    SELECT id, user_id, prix_actuel, prix_seuil, taux_baisse_pct, titre
    FROM public.annonces
    WHERE type = 'enchere_inversee'
      AND statut = 'active'
      AND taux_baisse_pct IS NOT NULL
      AND prix_actuel IS NOT NULL
  LOOP
    nouveau_prix := round(r.prix_actuel * (1 - r.taux_baisse_pct / 100.0), 2);

    IF r.prix_seuil IS NOT NULL AND nouveau_prix <= r.prix_seuil THEN
      UPDATE public.annonces
      SET statut = 'don_final',
          prix_actuel = 0,
          type = 'don'
      WHERE id = r.id;

      INSERT INTO public.notifications (user_id, type, actor_name, target_type, target_id, lu)
      VALUES (r.user_id, 'annonce_devient_don', 'Système', 'annonce', r.id, false);
    ELSE
      UPDATE public.annonces
      SET prix_actuel = nouveau_prix
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 6. CRON — Expiration des annonces
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annonces_cron_expirer()
RETURNS void AS $$
BEGIN
  UPDATE public.annonces
  SET statut = 'expiree'
  WHERE statut = 'active'
    AND expires_at <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 7. CRON — Désactivation du sponsoring expiré
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annonces_cron_sponsoring()
RETURNS void AS $$
BEGIN
  UPDATE public.annonces
  SET sponsored = false,
      sponsored_until = NULL
  WHERE sponsored = true
    AND sponsored_until IS NOT NULL
    AND sponsored_until <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 8. CRON — Notification J-2 avant expiration
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annonces_cron_notif_expiration()
RETURNS void AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.id, a.user_id, a.titre
    FROM public.annonces a
    WHERE a.statut = 'active'
      AND a.expires_at BETWEEN now() + interval '47 hours' AND now() + interval '49 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = a.user_id
          AND n.target_id = a.id
          AND n.type = 'annonce_expire_bientot'
          AND n.created_at > now() - interval '7 days'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, actor_name, target_type, target_id, lu)
    VALUES (r.user_id, 'annonce_expire_bientot', 'Système', 'annonce', r.id, false);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 9. JOBS PG_CRON (chaque nuit, espacés de 5 min)
--
-- Si tu re-runs ce script, désinscris d'abord les jobs existants :
--   SELECT cron.unschedule('annonces_baisse_encheres');
--   SELECT cron.unschedule('annonces_expirer');
--   SELECT cron.unschedule('annonces_sponsoring');
--   SELECT cron.unschedule('annonces_notif_expiration');
-- =====================================================================

SELECT cron.schedule(
  'annonces_baisse_encheres',
  '0 0 * * *',
  $$SELECT public.annonces_cron_baisse_encheres();$$
);

SELECT cron.schedule(
  'annonces_expirer',
  '5 0 * * *',
  $$SELECT public.annonces_cron_expirer();$$
);

SELECT cron.schedule(
  'annonces_sponsoring',
  '10 0 * * *',
  $$SELECT public.annonces_cron_sponsoring();$$
);

SELECT cron.schedule(
  'annonces_notif_expiration',
  '15 0 * * *',
  $$SELECT public.annonces_cron_notif_expiration();$$
);

-- =====================================================================
-- 9bis. SÉCURITÉ — retirer EXECUTE aux fonctions cron à anon/authenticated
-- Sans ça, n'importe qui peut les appeler via PostgREST RPC et déclencher
-- des baisses de prix / expirations manuellement.
-- Les jobs pg_cron tournent en tant que postgres → non impactés.
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.annonces_cron_baisse_encheres()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonces_cron_expirer()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonces_cron_sponsoring()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annonces_cron_notif_expiration()   FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 10. RLS — Lecture publique des annonces visibles, écritures via supabaseAdmin
-- =====================================================================
ALTER TABLE public.annonces                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonces_interets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonces_encheres_prises ENABLE ROW LEVEL SECURITY;

-- annonces : lecture publique des annonces visibles
DROP POLICY IF EXISTS annonces_select_public ON public.annonces;
CREATE POLICY annonces_select_public ON public.annonces
  FOR SELECT
  USING (statut IN ('active', 'don_final'));

-- Posteur voit toujours ses propres annonces (vendu/expiree inclus)
DROP POLICY IF EXISTS annonces_select_owner ON public.annonces;
CREATE POLICY annonces_select_owner ON public.annonces
  FOR SELECT
  USING (auth.uid() = user_id);

-- annonces_interets : posteur de l'annonce voit qui s'intéresse + user voit les siens
DROP POLICY IF EXISTS interets_select_owner ON public.annonces_interets;
CREATE POLICY interets_select_owner ON public.annonces_interets
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.annonces WHERE id = annonce_id)
  );

-- annonces_encheres_prises : posteur + preneur uniquement
DROP POLICY IF EXISTS encheres_prises_select_owner ON public.annonces_encheres_prises;
CREATE POLICY encheres_prises_select_owner ON public.annonces_encheres_prises
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.annonces WHERE id = annonce_id)
  );

-- Toutes les écritures passent par les API routes via supabaseAdmin (service role).
-- Pas de policy INSERT/UPDATE/DELETE : RLS bloque par défaut, le service role bypasse.
