-- Journal hebdo — articles libres + flag annonce + extensions.
-- Suite de journaux_hebdo.sql.

-- 0. Extensions journaux_hebdo : ajout sélections article + spotlight etab
ALTER TABLE journaux_hebdo
  ADD COLUMN IF NOT EXISTS selection_article_id uuid,
  ADD COLUMN IF NOT EXISTS spotlight_etab_id    uuid;

-- 1. Flag sur annonces : "publier aussi dans le journal de la semaine"
ALTER TABLE annonces
  ADD COLUMN IF NOT EXISTS publier_dans_journal boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS annonces_publier_journal_idx
  ON annonces (publier_dans_journal)
  WHERE publier_dans_journal = true;

-- 2. Table articles_journal — articles rédactionnels libres soumis par
--    les Habitants / Pro pour le journal hebdo.
CREATE TABLE IF NOT EXISTS articles_journal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titre         text NOT NULL,
  corps         text NOT NULL,
  photo_url     text,
  statut        text DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'valide', 'refuse', 'publie')),
  refus_motif   text,
  journal_id    uuid REFERENCES journaux_hebdo(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_journal_statut_idx ON articles_journal (statut, created_at DESC);
CREATE INDEX IF NOT EXISTS articles_journal_user_idx ON articles_journal (user_id, created_at DESC);

ALTER TABLE articles_journal ENABLE ROW LEVEL SECURITY;

-- Le propriétaire voit ses propres articles
DROP POLICY IF EXISTS articles_owner_read ON articles_journal;
CREATE POLICY articles_owner_read ON articles_journal
  FOR SELECT USING (auth.uid() = user_id);

-- Tout le monde voit les articles publiés (un article = bien public une fois en kiosque)
DROP POLICY IF EXISTS articles_public_read_publie ON articles_journal;
CREATE POLICY articles_public_read_publie ON articles_journal
  FOR SELECT USING (statut = 'publie');

-- Le propriétaire crée son article (en_attente forcé via API)
DROP POLICY IF EXISTS articles_owner_insert ON articles_journal;
CREATE POLICY articles_owner_insert ON articles_journal
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Le propriétaire édite son article tant qu'il n'est pas publié
DROP POLICY IF EXISTS articles_owner_update ON articles_journal;
CREATE POLICY articles_owner_update ON articles_journal
  FOR UPDATE USING (auth.uid() = user_id AND statut <> 'publie');

-- Service role (admin) full access
DROP POLICY IF EXISTS articles_admin_all ON articles_journal;
CREATE POLICY articles_admin_all ON articles_journal
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_articles_journal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_journal_updated_at ON articles_journal;
CREATE TRIGGER articles_journal_updated_at
  BEFORE UPDATE ON articles_journal
  FOR EACH ROW EXECUTE FUNCTION update_articles_journal_updated_at();

-- 3. RPC : tirer un établissement au sort pour le spotlight journal
CREATE OR REPLACE FUNCTION spotlight_etablissement_random()
RETURNS TABLE (
  id uuid, nom text, commune text, type text, photos text[], description_courte text
)
LANGUAGE sql STABLE AS $$
  SELECT e.id, e.nom, e.commune, e.type, e.photos, e.description_courte
  FROM etablissements e
  WHERE e.nom IS NOT NULL
  ORDER BY random()
  LIMIT 1;
$$;
