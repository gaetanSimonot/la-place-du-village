-- Sous-catégorie libre sur les événements.
--
-- Les catégories de l'app sont volontairement peu nombreuses et servent aux
-- filtres, à la carte et aux couleurs : les multiplier casserait tout ça.
-- Ce champ laisse nommer précisément un événement — « ciné-débat »,
-- « vide-grenier », « repair café » — sans toucher à la taxonomie.
--
-- L'événement reste classé dans une catégorie existante ('autre' par défaut) ;
-- seul l'AFFICHAGE utilise ce libellé.
--
-- Rejouable sans risque.

ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS categorie_libre text;
