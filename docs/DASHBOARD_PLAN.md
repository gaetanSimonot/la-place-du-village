# Dashboard admin & pipelines events — plan d'évolution

> **Statut** : décision figée le 2026-05-21. Aucune refonte engagée — backlog priorisé à exécuter en sessions dédiées.
> **Décision retenue** : **option B** (refonte ciblée, voir §3).

---

## 1. Cartographie de l'existant

### 1.1 Points d'entrée d'événement

| Source | Route | Auth | Client SQL | Insère dans | Statut initial | Section dashboard | État |
|---|---|---|---|---|---|---|---|
| Collector Signal/WhatsApp (actuel) | `POST /api/extract` (branche `source=whatsapp`) | header `x-wa-key` | admin (depuis fix `fix/api-extract-rls`) | `lieux` + `evenements` direct | `publie` / `en_attente` / `rejete` via `calcStatut()` | Agenda → À traiter | ✅ Fonctionne post-fix RLS |
| Formulaire user `/ajouter` | `POST /api/extract/preview` puis `POST /api/evenements` | Bearer token | admin | `lieux` + `evenements` direct | `en_attente` + `publish_at = NOW+10min` ; `a_verifier` ; `archive` (doublon) | Agenda → Soumissions | ✅ |
| Formulaire user `/capturer` | idem `/ajouter` | idem | admin | idem | idem | Agenda → Soumissions | ✅ |
| Pipeline Inbox (côté serveur prêt) | `POST /api/inbox` | header `x-wa-key` (même clé) | admin | `messages_entrants` puis `lieux`+`evenements` via `processMessage.ts` (checkDoublon IA + checkZone) | `publie` / `en_attente` / `non_publiable` (avec `message_entrant_id`) | Agenda → Réception (`AdminInbox.tsx` lit `messages_entrants`) | ⚠️ **Serveur OK, aucun client ne POST dessus** |
| Scraper | `POST /api/scrape-source` | (à confirmer) | admin | `evenements` (source='scrape') | `en_attente` / `a_verifier` / `archive` (doublon) ; skip hors zone | Agenda → Scrap | (à confirmer si actif) |
| Admin edit | `PATCH /api/admin/evenements/[id]` | admin | admin | UPDATE `evenements` (+ `lieux`) | selon body.statut | Réaffiche selon nouveau statut | ✅ |
| Cron auto-publish | `GET /api/cron/publish` | `CRON_SECRET` | admin | UPDATE `evenements` (en_attente → publie) si `publish_at ≤ now` | — | Disparaît de À traiter / Soumissions | 🚨 **PAS dans `vercel.json` — ne tourne jamais** |

### 1.2 Statuts d'événement (8 — trop)

| Statut | Posé par | Transitionné par | Sens métier |
|---|---|---|---|
| `publie` | `calcStatut` infos complètes, admin manuel, cron publish | admin override | Visible public |
| `en_attente` | `calcStatut` fallback, `processMessage` (user OK), scraper OK | cron publish (mort) ou admin | Attend publication auto OU validation admin |
| `a_verifier` | `processMessage`, scraper, `/api/evenements` quand IA incertaine | admin manuel | Doute IA |
| `rejete` | `calcStatut` si pas date ET pas lieu | admin override | Refusé |
| `archive` | scraper (doublon), `/api/evenements` (user doublon), `admin/doublons/resoudre` | auto-cleanup 7j | Doublon écarté |
| `non_publiable` | `processMessage` seulement | — | Sur `messages_entrants`, pas `evenements` |
| `a_traiter` | `/api/inbox` (statut initial msg) | `processMessage` → result.statut | Transitoire `messages_entrants` |
| `ignore` | admin via `AdminInbox.ignorer()` | — | `messages_entrants` ignoré |

⚠️ `non_publiable`, `a_traiter`, `ignore` vivent sur `messages_entrants` pas sur `evenements`. Le type TS `Evenement.statut` (`src/lib/types.ts:21`) ne déclare que 5 statuts → incomplet/menteur.

### 1.3 Sections dashboard

| Section | Composant | Source | Filtres clés |
|---|---|---|---|
| Agenda → Réception (`inbox`) | `AdminInbox.tsx` | GET `/api/admin/inbox?statut=X` → `messages_entrants` | Statut du **message** (`tous`, `non_publiable`, `en_attente`, `publie`, `doublon`, `hors_zone`, `ignore`) |
| Agenda → Soumissions | `AdminDashboard.fetchSoumissions` | `evenements` (client anon) | `submitted_by IS NOT NULL` ORDER created_at DESC LIMIT 100 |
| Agenda → À traiter | `AdminDashboard.fetchTabData('a_traiter')` | `evenements` + `lieux(...)` (client anon) | `source ≠ 'scrape' AND statut IN ('en_attente','a_verifier','publie')` + filtre client `publie ⇒ lieu approximatif` |
| Agenda → Publié | idem | `evenements` (anon) | `statut='publie'` |
| Agenda → Rejeté | idem | `evenements` (anon) | `statut='rejete'` |
| Agenda → Scrap | idem | `evenements` (anon) | `source='scrape' AND statut IN ('en_attente','a_verifier')` |
| Agenda → Doublons / Zone | `DoublonsAdmin` / `ZoneAdmin` | composants spécialisés | (séparés) |
| Annuaire / Membres / Demandes / Paramètres | composants dédiés | autres tables | hors scope events |

---

## 2. Faits saillants découverts

1. **Le pipeline Inbox est complet côté serveur** (`/api/inbox/route.ts` → `processMessage.ts` → `messages_entrants` + `evenements` avec `message_entrant_id`) — **mais aucun client ne POST dessus** aujourd'hui. C'est la cible naturelle du collector.
2. **Le cron `/api/cron/publish` ne tourne pas** : pas dans `vercel.json` (seul `journal-hebdo` y est). Tous les events users `en_attente` restent en `en_attente` indéfiniment sans intervention manuelle admin.
3. **Deux pipelines coexistent pour le collector** : `/api/extract` (simple, va dans Agenda) vs `/api/inbox` (riche, va dans Réception, statuts métier). Le collector actuel utilise le premier (legacy).
4. **8 statuts** mélangés entre `evenements` et `messages_entrants`, type TS incomplet, onglets dashboard pas alignés sur les statuts métier.
5. **Le client anon est utilisé côté admin** pour quasi tous les SELECT (`AdminDashboard.tsx`). Marche tant que les RLS de SELECT sont permissives — fragile si on serre les vis.
6. **Bug latent `FeedbackButton.tsx:29`** : INSERT dans `feedbacks` via anon, **sans try/catch**. Si RLS bloque → console error + modal coincée. Idem `AdminDashboard.tsx:187` (fetch `/api/admin/feedbacks` sans header Authorization).

---

## 3. Décision : option B (refonte ciblée)

**Garder** :
- Le flow user (`/ajouter`, `/capturer` → `/api/extract/preview` → `/api/evenements`) tel quel. Pas de migration de surface UI.
- L'onglet Soumissions et la séparation Soumissions / À traiter.

**Migrer** :
- Le collector Signal/WhatsApp **vers `/api/inbox`** (au lieu de `/api/extract`).
- Récupération de `checkDoublon` IA + `checkZone` + statuts riches (`hors_zone`, `doublon`) pour les messages WhatsApp/Signal.
- Les events whatsapp apparaîtront alors dans **Réception** au lieu d'Agenda → À traiter (cohérent avec l'intention métier originale).

**Garder en parallèle, pour transition** :
- `/api/extract` reste fonctionnel post-fix RLS pour ne pas casser quoi que ce soit pendant la migration.
- Le collector peut être basculé puis débuggé sans pression.

**Hors scope option B (à traiter séparément)** :
- Refonte des statuts (4. du backlog).
- Cron publish (2. du backlog).
- Cleanup client anon admin (3. du backlog).

---

## 4. Backlog priorisé

### (a) — Brancher collector → `/api/inbox` 🎯 cible session prochaine
- Reprendre la refonte `~/signal-collector/` sur la VM (sender qui POST vers `/api/inbox` au lieu de `/api/extract`).
- Le `.bak` local du sender (`D:/@CLAUDE/SCRAP/signal-collector/sender.js.bak`) pointe déjà vers `/api/inbox` avec le bon payload (`source: 'signal'`, `groupe`, `auteur`, `contenu`, `image`, `imageMimeType`). À reprendre + intégrer le fix anti-boucle déjà fait (`magicMime`, retry state, cap candidates).
- Tester sur preview Vercel (avec bypass token) avant de pousser dans `/opt/signal-collector/` sur la VM.
- Une fois confirmé end-to-end → décommissionner la branche `whatsapp` de `/api/extract` (devient code mort à supprimer en (3.c) cleanup).

### (b) — Activer le cron `/api/cron/publish`
**⚠️ Garde-fou OBLIGATOIRE avant activation** :
- D'abord compter combien d'events ont `statut='en_attente' AND publish_at IS NOT NULL AND publish_at ≤ now`. Si > 20 → décider du rattrapage manuel ou activation progressive (UPDATE en batch avec délai).
- Vérifier la cohérence des `publish_at` (créés avec `NOW+10min` mais dormants depuis combien de temps ?).
- Décider si on garde l'offset `+10min` ou si on l'allonge (1h ? 24h ?) pour donner une vraie fenêtre admin.

Puis ajouter dans `vercel.json` :
```json
{ "path": "/api/cron/publish", "schedule": "*/5 * * * *" }
```
(5 min = ce que l'utilisateur se rappelait — à valider).

Vérifier qu'aucune notif user ne part en masse au premier tick.

### (c) — Cleanup client anon côté admin
- `FeedbackButton.tsx:29` : try/catch + feedback UI sur erreur ; ou passer par une API route `/api/feedback` (admin).
- `AdminDashboard.tsx:187` : passer le Bearer token au fetch `/api/admin/feedbacks` ; route doit valider admin.
- Auditer tous les SELECT du `AdminDashboard.tsx` (lignes 134-138, 150, 162, 185-186, 216, etc.) : migrer vers des API routes `/api/admin/*` qui passent par `supabaseAdmin`, plutôt que client anon. Évite la fragilité aux changements RLS futurs.
- Une fois fait, on peut serrer les RLS SELECT sur `evenements` (autoriser uniquement `statut='publie'` pour anon, le reste exige admin via service_role côté API).

### (d) — Simplifier les 8 statuts + renommer onglets
Proposition à valider :
- **Sur `evenements`** : 4 statuts seulement → `publie`, `en_attente`, `a_verifier`, `archive`. Supprimer `rejete` (= `archive` avec raison) ou inverser.
- **Sur `messages_entrants`** : garder le set actuel (`a_traiter`, `publie`, `en_attente`, `non_publiable`, `doublon`, `hors_zone`, `ignore`) — c'est cohérent avec le pipeline.
- Mettre à jour `src/lib/types.ts:21` pour refléter le set réel.
- Onglets dashboard à renommer pour cohérence (ex : "À traiter" → "À valider", "Soumissions" → "Soumis par users", "Scrap" → "Scraping", "Réception" → "Inbox WhatsApp/Signal").

---

## 5. Notes de session 2026-05-21

- Saignement Vercel Fast Origin Transfer : **stoppé** (4 bugs collector fixés + RLS `/api/extract` fixé). Collector reste coupé en attendant (a).
- Branche `fix/api-extract-rls` : commit `af1894c`, validé sur preview Vercel avec event de test "Soirée concert 2099" (créé + supprimé). **Non mergée** à ce jour — à merger quand le collector reprend (ou avant, la prod ne consomme plus `/api/extract` activement vu que le collector est coupé).
- État VM Signal : allumée, `signal-collector.service` **stoppé** (volontairement). signal-cli@... actif (daemon, ne POST pas vers Vercel).
- Backup prod du code collector pré-fix : `D:/@CLAUDE/SCRAP/signal-collector/backup-prod-20260521-131446/`.
- Script de cleanup d'event de test : `scripts/cleanup-test-event.mjs` (one-shot, peut servir de template pour futurs cleanups).
