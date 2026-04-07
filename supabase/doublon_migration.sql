-- Migration : champ doublon_verifie + statut archive/a_verifier
-- À exécuter dans l'éditeur SQL Supabase

ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS doublon_verifie BOOLEAN DEFAULT FALSE;

-- Le champ statut est un TEXT, donc on supporte simplement les nouvelles valeurs
-- 'archive'    : doublon détecté à l'import, caché du public
-- 'a_verifier' : Claude a jugé qu'il manque des infos, en attente admin
-- Les valeurs existantes 'publie', 'en_attente', 'rejete' restent valides
