-- 2026-08-29 — Quota : 3 établissements soumis par personne
--
-- CONTEXTE
--   La soumission d'un établissement est auto-publiée (l'utilisateur choisit
--   son adresse dans Google, la fiche part en ligne sans relecture). Ce
--   comportement est conservé — on lui ajoute seulement une limite de débit.
--
-- RÈGLE
--   3 établissements maximum par personne. Au-delà, la soumission est refusée
--   (429) et l'écran propose d'écrire à la messagerie support pour en demander
--   davantage. Les admins ne sont pas limités.
--
--   Ce qui compte dans le quota (voir /api/commerce-request) :
--     - les fiches créées par la personne   (etablissement_id renseigné)
--     - ses demandes encore en attente      (traite = false)
--   Ce qui NE compte PAS :
--     - les revendications de fiche existante   (type_commerce = 'claim',
--       elles ont déjà leur propre quota de 3/mois dans la route claim)
--     - les doublons Google, quand la fiche existait déjà : la personne n'a
--       rien ajouté (type_commerce = 'doublon', posé par le même commit)
--     - les demandes rejetées par l'admin : le quota se libère
--
--   Aucune colonne nouvelle n'est nécessaire pour ce comptage : il réutilise
--   `type_commerce`, déjà employé comme discriminant par le quota des
--   revendications.
--
-- CE SCRIPT
--   Ajoute le SEUL élément manquant : une dérogation par personne, pour que la
--   demande faite au support puisse aboutir à quelque chose.

-- Dérogation individuelle. NULL = quota par défaut (3, constante QUOTA_ETAB_DEFAUT
-- dans src/app/api/commerce-request/route.ts).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS etab_quota integer;

COMMENT ON COLUMN public.profiles.etab_quota IS
  'Nombre max d''établissements que cette personne peut soumettre. NULL = quota par défaut (3). Relevé à la main après une demande au support.';

-- ─────────────────────────────────────────────────────────────────────────
-- ACCORDER UNE DÉROGATION (à jouer au cas par cas, après une demande support)
--
--   UPDATE profiles SET etab_quota = 10 WHERE user_id = '<uuid de la personne>';
--
-- Remettre au quota par défaut :
--   UPDATE profiles SET etab_quota = NULL WHERE user_id = '<uuid>';
--
-- Retrouver l'uuid depuis un nom affiché :
--   SELECT user_id, display_name, email, etab_quota FROM profiles
--   WHERE display_name ILIKE '%…%';
-- ─────────────────────────────────────────────────────────────────────────

-- Où en est chacun aujourd'hui (personnes ayant déjà soumis au moins 1 fiche)
SELECT
  cr.user_id,
  p.display_name,
  count(*)                                   AS etablissements_soumis,
  coalesce(p.etab_quota, 3)                  AS quota
FROM commerce_requests cr
LEFT JOIN profiles p ON p.user_id = cr.user_id
WHERE cr.user_id IS NOT NULL
  AND cr.type_commerce IS NULL
  AND (cr.etablissement_id IS NOT NULL OR cr.traite = false)
GROUP BY cr.user_id, p.display_name, p.etab_quota
ORDER BY etablissements_soumis DESC;
