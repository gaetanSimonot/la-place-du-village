-- =====================================================================
-- Policies RLS pour le bucket Storage "annonces"
--
-- Le flag "public" du bucket ne gère QUE la lecture (SELECT) via getPublicUrl.
-- L'INSERT (upload) nécessite une policy explicite sur storage.objects,
-- sinon l'upload échoue silencieusement.
--
-- Convention path : `${user_id}/${timestamp}-${i}.${ext}`
-- → chaque user ne peut écrire/modifier/supprimer que dans son dossier.
-- =====================================================================

-- INSERT : un user authentifié peut uploader dans son propre dossier
DROP POLICY IF EXISTS annonces_storage_insert ON storage.objects;
CREATE POLICY annonces_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'annonces'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE : un user peut modifier ses propres fichiers
DROP POLICY IF EXISTS annonces_storage_update ON storage.objects;
CREATE POLICY annonces_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'annonces'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE : un user peut supprimer ses propres fichiers
DROP POLICY IF EXISTS annonces_storage_delete ON storage.objects;
CREATE POLICY annonces_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'annonces'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT : lecture publique (le bucket est déjà "public" mais on peut être
-- explicite pour ne pas dépendre uniquement du flag bucket)
DROP POLICY IF EXISTS annonces_storage_select ON storage.objects;
CREATE POLICY annonces_storage_select
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'annonces');

-- Vérif :
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE tablename = 'objects' AND policyname LIKE 'annonces_storage_%';
