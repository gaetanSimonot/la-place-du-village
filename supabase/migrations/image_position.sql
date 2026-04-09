-- Ajout du champ image_position pour le cadrage custom (object-position CSS)
ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS image_position TEXT DEFAULT '50% 50%';
