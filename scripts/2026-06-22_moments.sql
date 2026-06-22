-- ════════════════════════════════════════════════════════════════════════
-- « En ce moment » — moments éphémères (reels/stories) visibles 24h
-- ════════════════════════════════════════════════════════════════════════
-- Publication réservée aux plans habitants / pro / admin (vérifié côté API
-- via can(ctx, 'publish_moment')). Lecture publique via API service-role.
-- Médias dans le bucket Storage 'moments' (photo ≤10 Mo, vidéo ≤50 Mo, 60s).
-- Accès tables : RLS activée sans policy → tout passe par les routes API
-- (supabaseAdmin / service role), pattern du projet.
-- ════════════════════════════════════════════════════════════════════════

-- ── Table principale ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.moments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auteur_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auteur_nom       text,
  lieu_id          uuid REFERENCES public.lieux(id) ON DELETE SET NULL,
  evenement_id     uuid REFERENCES public.evenements(id) ON DELETE SET NULL,
  etablissement_id uuid REFERENCES public.etablissements(id) ON DELETE SET NULL,
  media_kind       text NOT NULL CHECK (media_kind IN ('video', 'photo')),
  media_url        text NOT NULL,
  poster_url       text,                         -- vignette (photo = media_url, vidéo = 1ère frame si dispo)
  duree_sec        int,                          -- vidéo : 1..60
  legende          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL          -- = created_at + 24h
);
CREATE INDEX IF NOT EXISTS moments_expires_idx ON public.moments (expires_at);
CREATE INDEX IF NOT EXISTS moments_auteur_idx  ON public.moments (auteur_id);

-- ── Vues (un moment est "non vu" si pas de ligne pour l'user courant) ──────
CREATE TABLE IF NOT EXISTS public.moment_vues (
  moment_id uuid REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  vu_le     timestamptz DEFAULT now(),
  PRIMARY KEY (moment_id, user_id)
);

-- ── Likes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.moment_likes (
  moment_id  uuid REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (moment_id, user_id)
);

-- ── Commentaires ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.moment_commentaires (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id  uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  auteur_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auteur_nom text,
  texte      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moment_comm_idx ON public.moment_commentaires (moment_id, created_at);

-- ── RLS : activée sans policy → accès via API service-role uniquement ──────
ALTER TABLE public.moments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_vues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_commentaires  ENABLE ROW LEVEL SECURITY;

-- ── Bucket Storage 'moments' (public en lecture, upload via signed URL) ────
-- photo ≤10 Mo, vidéo ≤50 Mo → on cale la limite bucket à 50 Mo, la limite
-- photo plus stricte est imposée côté route signed-upload-url.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moments', 'moments', true, 52428800,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
