-- ════════════════════════════════════════════════════════════════════════
-- Newsletter : abonner par défaut quand l'opt-in n'est PAS fourni au signup
-- ════════════════════════════════════════════════════════════════════════
-- Avant : COALESCE(metadata.newsletter_optin, FALSE). Les inscriptions Google
-- (et magic-link) ne passent pas de métadonnée → jamais abonnés.
-- Après : COALESCE(metadata.newsletter_optin, TRUE).
--   - Signup email : passe explicitement true/false (la case) → respecté.
--   - Google / magic-link (pas de métadonnée) → abonné par défaut.
-- Reste du corps identique à 2026-06-23_newsletter.sql.
-- ════════════════════════════════════════════════════════════════════════

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
    COALESCE((NEW.raw_user_meta_data->>'newsletter_optin')::boolean, true)
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
