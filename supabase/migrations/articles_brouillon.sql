-- Ajout du statut 'brouillon' pour les articles journal :
-- l'utilisateur peut sauvegarder un article incomplet sans le soumettre.

ALTER TABLE articles_journal
  DROP CONSTRAINT IF EXISTS articles_journal_statut_check;

ALTER TABLE articles_journal
  ADD CONSTRAINT articles_journal_statut_check
    CHECK (statut IN ('brouillon', 'en_attente', 'valide', 'refuse', 'publie'));
