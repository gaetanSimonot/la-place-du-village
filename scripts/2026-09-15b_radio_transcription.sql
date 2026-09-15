-- ════════════════════════════════════════════════════════════════════════
-- RADIO — garder la transcription
--
-- Transcrire une émission coûte un appel payant et une trentaine de secondes.
-- La jeter après usage obligerait à la repayer à chaque fois qu'on veut
-- relancer la détection des rendez-vous — or on la relancera : c'est en
-- relisant ce que le modèle a compris qu'on corrige.
--
-- La garder sert aussi à autre chose : quand une mention paraît fausse, le
-- texte dit ce qui a RÉELLEMENT été prononcé. Sans lui, il faut réécouter.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

alter table radio_emissions
  add column if not exists transcription text,
  add column if not exists transcrit_le  timestamptz;

comment on column radio_emissions.transcription is
  'Texte de l''émission, produit par la transcription automatique. Sert à détecter les rendez-vous cités et à vérifier une mention douteuse sans réécouter.';

-- ── Rollback ────────────────────────────────────────────────────────────
-- alter table radio_emissions drop column if exists transcription;
-- alter table radio_emissions drop column if exists transcrit_le;
