-- Table notes admin : idées et améliorations
CREATE TABLE notes_admin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
