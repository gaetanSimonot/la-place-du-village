-- ═══════════════════════════════════════════════════════════════════════
-- CINÉMA — un identifiant de lien pour Le Palace
--
-- Le cinéma du Vigan n'avait pas de `slug`. Sans lui, impossible de lui
-- donner une adresse lisible (/cinema?cinema=vigan pour un QR code), ni de
-- lui associer son enseigne : l'écran choisit le logo par le slug.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE etablissements
   SET slug = COALESCE(slug, 'vigan')
 WHERE module_cinema = true
   AND slug IS NULL
   AND commune ILIKE '%vigan%';
