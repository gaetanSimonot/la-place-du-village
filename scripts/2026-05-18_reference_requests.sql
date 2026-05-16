-- =====================================================================
-- Référencement étendu — commerces & producteurs
-- Date : 2026-05-18
--
-- Objectif : permettre à un user connecté de soumettre une demande
-- de référencement complète (avec adresse Google Places, description,
-- photos) qui sera validée par un admin et créera directement une fiche.
--
--   - Étend `commerce_requests` avec les champs nécessaires
--   - Crée `producer_requests` (table miroir pour les producteurs)
--   - Bucket Storage "reference-photos" pour les photos uploadées
-- =====================================================================

-- =====================================================================
-- 1. ALTER commerce_requests
-- =====================================================================
ALTER TABLE public.commerce_requests
  ADD COLUMN IF NOT EXISTS type             text,         -- 'restaurant_bar' | 'hebergement' | 'artisan_service' | 'sante_bien_etre' | 'activite'
  ADD COLUMN IF NOT EXISTS adresse          text,
  ADD COLUMN IF NOT EXISTS lat              double precision,
  ADD COLUMN IF NOT EXISTS lng              double precision,
  ADD COLUMN IF NOT EXISTS place_id_google  text,
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS site_web         text,
  ADD COLUMN IF NOT EXISTS horaires         text,
  ADD COLUMN IF NOT EXISTS photos           text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.commerce_requests.type IS 'restaurant_bar | hebergement | artisan_service | sante_bien_etre | activite';

-- =====================================================================
-- 2. CREATE producer_requests
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.producer_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nom               text NOT NULL,
  description       text,
  contact           text,
  site_web          text,
  horaires          text,
  adresse           text,
  commune           text,
  lat               double precision,
  lng               double precision,
  place_id_google   text,
  produit_categories text[] DEFAULT '{}'::text[],
  photos            text[] DEFAULT '{}'::text[],
  message           text,
  traite            boolean NOT NULL DEFAULT false,
  producer_id       uuid REFERENCES public.producers(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.producer_requests.produit_categories IS 'fruits_legumes | viandes | fromages_laitages | oeufs | pain | miel | panier | plantes | huiles | boissons | artisanat | autre';

CREATE INDEX IF NOT EXISTS idx_producer_requests_user   ON public.producer_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_producer_requests_traite ON public.producer_requests (traite);
CREATE INDEX IF NOT EXISTS idx_producer_requests_created ON public.producer_requests (created_at DESC);

ALTER TABLE public.producer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS producer_requests_select ON public.producer_requests;
CREATE POLICY producer_requests_select ON public.producer_requests
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- =====================================================================
-- 3. Bucket Storage "reference-photos"
-- =====================================================================
-- Créé manuellement côté Dashboard si pas existant (public bucket).
-- Policies storage.objects :
DO $$
BEGIN
  -- INSERT : tout user authentifié peut uploader dans son propre dossier
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'reference_photos_insert'
  ) THEN
    CREATE POLICY reference_photos_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'reference-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  -- SELECT : public (bucket public)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'reference_photos_select'
  ) THEN
    CREATE POLICY reference_photos_select ON storage.objects
      FOR SELECT USING (bucket_id = 'reference-photos');
  END IF;

  -- DELETE : owner seulement
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'reference_photos_delete'
  ) THEN
    CREATE POLICY reference_photos_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'reference-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- =====================================================================
-- Vérifications post-execution :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='commerce_requests' AND column_name IN ('type','adresse','lat','lng','place_id_google','description','site_web','horaires','photos');
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='producer_requests';
--
--   -- Créer bucket "reference-photos" comme PUBLIC depuis le Dashboard Storage si pas existant.
-- =====================================================================
