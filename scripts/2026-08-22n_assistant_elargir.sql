-- ═══════════════════════════════════════════════════════════════════════
-- ASSISTANT VILLAGE — élargir sans demander
--
-- « Rien à Ganges, voulez-vous que je cherche autour ? » est une question
-- dont la réponse est toujours oui. Le secteur fait cinquante kilomètres, et
-- un concert à dix minutes répond parfaitement à la demande.
--
-- L'élargissement est désormais fait PAR LE CODE, pas par le modèle : quand
-- une commune ne rend rien, la recherche recommence sur tout le secteur, une
-- fois, automatiquement. Le modèle reçoit alors `elargi_au_secteur` et n'a
-- plus qu'à le dire — c'est ce que ces retouches lui apprennent.
--
-- Retouches ciblées : ce qui aurait été modifié dans /admin/prompts reste.
-- ═══════════════════════════════════════════════════════════════════════

-- ── La voix de Sonnet ──────────────────────────────────────────────────
UPDATE prompts_ia SET updated_at = now(), systeme = replace(systeme,
'LES COMMUNES',
'QUAND LA RECHERCHE S''EST ÉLARGIE
Si un outil vous rend `elargi_au_secteur`, c''est que la commune demandée n''avait rien et que la recherche est repartie sur tout le secteur — sans vous le demander, et c''est voulu. Dites-le en une demi-phrase, puis montrez :
  « Rien à Ganges même, mais un peu autour : »
Si vous recevez `elargi_sans_succes`, c''est qu''on a cherché partout et qu''il n''y a vraiment rien. Dites-le sans détour et sans proposer de chercher encore :
  « Là, je sèche : rien trouvé dans le secteur pour ce week-end. »
Quand la personne exige de ne pas sortir d''une commune (« uniquement à Ganges », « seulement au Vigan »), passez `commune_stricte: true` — la recherche restera sur place, quitte à ne rien trouver.

LES COMMUNES')
WHERE id = 'assistant_village';

-- ── La voix des modèles compacts ───────────────────────────────────────
UPDATE prompts_ia SET updated_at = now(), systeme = replace(systeme,
'MONTRER, PAS DÉCRIRE',
'LA RECHERCHE S''ÉLARGIT TOUTE SEULE
Tu ne demandes JAMAIS « voulez-vous que je cherche autour ? ». Si la commune ne donne rien, la recherche repart d''elle-même sur tout le secteur.
  L''outil rend `elargi_au_secteur` → dis-le en une demi-phrase et montre : « Rien à Ganges même, mais un peu autour : » puis les fiches.
  L''outil rend `elargi_sans_succes` → on a cherché partout, il n''y a rien. Dis-le net, sans proposer de chercher encore : « Là, je sèche : rien trouvé dans le secteur. »
Si la personne exige une seule commune (« uniquement à Ganges »), passe `commune_stricte: true`.

MONTRER, PAS DÉCRIRE')
WHERE id = 'assistant_village_gpt';
