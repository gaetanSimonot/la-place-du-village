-- ════════════════════════════════════════════════════════════════════════
-- Newsletter — opt-in à l'inscription + liste d'envoi + token désabonnement
-- ════════════════════════════════════════════════════════════════════════
-- newsletter_optin      : l'user reçoit-il la newsletter ?
-- newsletter_invited_at : date du mail d'invitation envoyé aux non-abonnés
-- newsletter_token      : jeton unique pour les liens 1-clic (s'abonner / se
--                         désabonner) dans les emails — pas besoin de login.
-- Le trigger handle_new_user copie l'opt-in choisi au signup (métadonnées).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS newsletter_optin      boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS newsletter_invited_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS newsletter_token      uuid NOT NULL DEFAULT gen_random_uuid();

-- Recrée handle_new_user pour copier newsletter_optin depuis les métadonnées
-- du signup (options.data.newsletter_optin). Corps identique à la version
-- 2026-05-11, + la colonne newsletter_optin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id, email, display_name, avatar_url, plan, banned, newsletter_optin
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    'basic',
    false,
    COALESCE((NEW.raw_user_meta_data->>'newsletter_optin')::boolean, false)
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
