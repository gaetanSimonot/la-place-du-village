-- Communes de lieux remises d aplomb — genere le 2026-09-19
--
-- Regle appliquee : on ne corrige que si le NOM du lieu nomme lui-meme la
-- commune ecrite dans son adresse. « Stade d Aveze » + adresse a Aveze = sur.
-- « Foyer Albouy » + adresse a Beziers = ECARTE, on n y touche pas : c est
-- l adresse qui est fausse, pas l etiquette.
--
-- 34 fiches, 33 evenements a venir concernes.
-- Rejouable sans risque : chaque ligne verifie la valeur actuelle.

BEGIN;
-- 2 ev. | Temple de Saint-Jean-du-Gard
UPDATE lieux SET commune = 'Saint-Jean-du-Gard' WHERE id = '00920c70-752b-4f97-8d89-a137ac8e4b58' AND commune IS NOT DISTINCT FROM NULL;
-- 2 ev. | Bibliothèque de Logrian Florian
UPDATE lieux SET commune = 'Logrian-Florian' WHERE id = 'd3abfd68-446e-4f91-9c4e-f88b125a8e09' AND commune IS NOT DISTINCT FROM 'Logrian';
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '44b2c89b-cebf-4cf0-9cfe-855b8a7dd5f3' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'd4b20955-8949-47f4-96c6-8b6b038c784f' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'cae32787-638b-4646-b41d-4a4e80a0f757' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'cca9594b-84fb-4614-a26f-b8bd0094d8d1' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Mas de Londres - terrain des Baralles
UPDATE lieux SET commune = 'Mas-de-Londres' WHERE id = 'be25e88d-3130-4f40-bdf0-d7e83356bc83' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'ce32cd54-9aa9-4fa0-8900-087ed09c3e77' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Foyer de Logrian-Florian
UPDATE lieux SET commune = 'Logrian-Florian' WHERE id = 'acdcbf0d-c33b-40d3-bd0f-c4a497f0a307' AND commune IS NOT DISTINCT FROM 'Logrian';
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '1b75f22c-570f-4be8-aed6-fe0d341779bf' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'e6e34972-ab7c-4128-85a0-7c8207501ae9' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Foyer de Logrian-Florian
UPDATE lieux SET commune = 'Logrian-Florian' WHERE id = 'b79f3629-2ea0-4c14-aca1-fdd2efba1c2b' AND commune IS NOT DISTINCT FROM 'Logrian';
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'ed503247-399b-4376-a330-c8b8eb8e9f63' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'd6d778e8-d019-4b68-b8a8-6d673fe314e2' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'a6d23973-3f64-4db8-b0e7-e4ad18e030b1' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'b10936af-d07c-4f9a-8446-ac92acde758f' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '79b98bfb-d115-4642-a809-34ac67f85656' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'd5d76556-e19c-4c57-aec6-1a072e5fe431' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '3d203e39-c1ce-4d72-9cde-148b4f814f0b' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'cc6eb4a6-ce22-4022-b538-5d094e24ff69' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '3cc576ec-1ef6-4af3-abc4-fafc33f95311' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Foyer de Logrian-Florian
UPDATE lieux SET commune = 'Logrian-Florian' WHERE id = '9dd5aa25-7b21-4fd0-8e59-90a280a52a8f' AND commune IS NOT DISTINCT FROM 'Logrian';
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'e80776e8-d8c2-4314-9cd0-dbef108f2b65' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'd7d69f6f-e39e-47ed-a09d-bfed422ccd02' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Foyer de Logrian-Florian
UPDATE lieux SET commune = 'Logrian-Florian' WHERE id = '8038706c-cdbb-409b-9aad-868cba8fe1ed' AND commune IS NOT DISTINCT FROM 'Logrian';
-- 1 ev. | Foyer de Logrian-Florian
UPDATE lieux SET commune = 'Logrian-Florian' WHERE id = '95730881-f777-4015-b568-4db37263504c' AND commune IS NOT DISTINCT FROM 'Logrian';
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = 'cfcb3800-c771-4209-bf03-c454bac9793a' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '88136b8d-033c-46bf-8ff2-58dd974794b4' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Chapelle de Sainte Croix de Caderle
UPDATE lieux SET commune = 'Sainte-Croix-de-Caderle' WHERE id = 'fb4d0cf6-e740-4c6c-a0c2-9d2b2932a956' AND commune IS NOT DISTINCT FROM 'Caderle';
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '3d7d76b8-afc7-4e7b-9895-1babfd39f011' AND commune IS NOT DISTINCT FROM NULL;
-- 1 ev. | Stade d'Avèze
UPDATE lieux SET commune = 'Avèze' WHERE id = '15c40a18-adaa-4b4d-94fe-c840110ba8b7' AND commune IS NOT DISTINCT FROM NULL;
-- 0 ev. | Sablette proche Guinguette d'Avèze, Bords de Rivière et Guinguette à Proxi
UPDATE lieux SET commune = 'Avèze' WHERE id = 'c71c82f2-3c63-4db7-8c1e-82e67fe14e72' AND commune IS NOT DISTINCT FROM 'Guinguette d''Avèze';
-- 0 ev. | Mas de Londres / Brissac
UPDATE lieux SET commune = 'Mas-de-Londres' WHERE id = '5b137e57-e0d3-4f09-8ed6-4deb483560f6' AND commune IS NOT DISTINCT FROM 'Mas de Londres, Brissac';
-- 0 ev. | Foyer de Durfort et Saint Martin de Sossenac
UPDATE lieux SET commune = 'Durfort-et-Saint-Martin-de-Sossenac' WHERE id = '3901f793-36e6-4090-b9e4-fcad470d5f2c' AND commune IS NOT DISTINCT FROM 'Durfort';
COMMIT;
