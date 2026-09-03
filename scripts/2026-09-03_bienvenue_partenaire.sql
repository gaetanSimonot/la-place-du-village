-- 2026-09-03 — E-mail de bienvenue Partenaire Local
--
-- POURQUOI UNE COLONNE
--   Quand quelqu'un devient Partenaire Local, il reçoit un e-mail de
--   bienvenue. Deux chemins y mènent — le paiement Stripe et l'attribution
--   manuelle depuis /admin/membres — et il ne faut l'envoyer QU'UNE FOIS,
--   quel que soit le chemin.
--
--   Se fier au seul passage basic → pro ne suffit pas : l'écran admin
--   réenregistre le profil pour d'autres raisons (changer un nom affiché),
--   et un abonnement peut être résilié puis repris. Cette date est donc la
--   mémoire de l'envoi : renseignée, on n'envoie plus.
--
--   Même principe que profiles.newsletter_welcomed_at, déjà en place.
--
-- LECTURE
--   Cette colonne n'est PAS ajoutée au GRANT public de
--   2026-09-03_profiles_lecture_par_colonne.sql : elle est interne au serveur,
--   aucun écran client n'en a besoin. C'est le bon défaut.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partenaire_bienvenue_at timestamptz;

COMMENT ON COLUMN public.profiles.partenaire_bienvenue_at IS
  'Date d''envoi de l''e-mail de bienvenue Partenaire Local. NULL = jamais envoyé. Sert de garde-fou anti-doublon entre le webhook Stripe et l''attribution admin.';

-- ─────────────────────────────────────────────────────────────────────────
-- LES PARTENAIRES DÉJÀ EN PLACE
--
-- 7 comptes sont déjà en plan 'pro' au moment de ce script. Ils n'ont jamais
-- reçu cet e-mail puisqu'il n'existait pas.
--
-- Par défaut ils le RECEVRONT à la prochaine occasion où leur profil est
-- touché — ce qui n'arrivera peut-être jamais, et serait de toute façon un
-- message tardif et déroutant pour quelqu'un installé depuis mai.
--
-- Choix par défaut : on les marque comme déjà accueillis. Ils ne recevront
-- rien. Décommente si tu préfères au contraire le leur envoyer plus tard à la
-- main (dans ce cas, laisse la colonne à NULL et déclenche l'envoi toi-même).
UPDATE profiles
SET partenaire_bienvenue_at = now()
WHERE plan = 'pro'
  AND partenaire_bienvenue_at IS NULL;

-- Contrôle
SELECT display_name, plan, partenaire_bienvenue_at
FROM profiles
WHERE plan = 'pro'
ORDER BY display_name;
