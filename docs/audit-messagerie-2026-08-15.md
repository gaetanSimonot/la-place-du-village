# Messagerie de La Place du Village — état des lieux technique

> Audit réalisé le 15 août 2026 par lecture du code source (pas de suppositions).
> Objectif : disposer d'une base factuelle pour décider s'il faut remplacer tout
> ou partie de ce système par des briques de **Fluxer**.

**Contexte de l'app** : PWA communautaire hyperlocale (village des Cévennes,
secteur Ganges). Next.js App Router + Supabase (Postgres, Auth, Realtime, Storage)
+ Vercel Pro, distribuée en TWA Android. En production sur `main`, utilisée par de
vrais habitants. ~18 utilisateurs actifs aujourd'hui, ouverture large visée à ~300.
Fondateur solo non technique.

---

## 1. Il n'y a pas une messagerie, il y en a quatre

C'est le fait structurant : quatre systèmes de chat coexistent, avec des schémas,
des routes, des clients et des canaux temps réel distincts.

| Système | Tables | Fichier de migration |
|---|---|---|
| **Amis** (messages privés) | `conversations`, `conversation_members`, `messages` | `supabase/migrations/conversations_unified.sql` |
| **Annonces** (acheteur ↔ vendeur) | `annonces_conversations`, `annonces_messages` | `scripts/2026-05-12_annonces_chat.sql` |
| **Covoiturage** | `covoit_conversations`, `covoit_messages` | `supabase/migrations/covoit_v3_ratings.sql` |
| **Support** (utilisateur ↔ équipe) | `support_conversations`, `support_messages` | `scripts/2026-05-16_support_chat.sql` |

Ils ne se rejoignent qu'en un seul point : la route `GET /api/messages`, qui les
agrège pour produire une boîte de réception unique côté utilisateur.

### Schéma de la messagerie amis

```sql
conversations        (id uuid, kind text, created_at, updated_at)
                      kind CHECK IN ('friend')   -- une seule valeur autorisée
conversation_members (conversation_id, user_id, joined_at, last_read_at)
                      PRIMARY KEY (conversation_id, user_id)
messages             (id uuid, conversation_id, sender_id, content,
                       embed_kind, embed_ref_id, media jsonb, created_at)
                      CHECK : content non vide OU (embed_kind + embed_ref_id)
                      index (conversation_id, created_at)
```

Colonnes ajoutées après coup : `embed_kind`/`embed_ref_id` (22/05/2026),
`media jsonb` (06/06/2026).

Un trigger `trg_touch_conv_on_msg` met `conversations.updated_at = now()` à chaque
insertion de message — c'est ce qui fait remonter la conversation en tête de liste.
Les trois autres systèmes ont chacun leur trigger équivalent.

---

## 2. Parcours complet d'un message (cas ami)

```
1. CLIENT — src/app/conversations/[id]/client.tsx:308  send()
   • crée un message local id = temp_<timestamp>_<random>, status 'sending'
   • l'affiche IMMÉDIATEMENT, vide le champ, conserve le focus clavier, scrolle

2. SERVEUR — POST /api/conversations/[id]/messages
   • requireUser()            → valide le Bearer JWT via supabaseAdmin.auth.getUser()
   • valide content (≤ 4000 car.) et embed_kind ∈ 7 valeurs autorisées
   • vérifie l'appartenance    → SELECT conversation_members
   • vérifie l'amitié          → SELECT friendships WHERE status='accepted'
   • INSERT INTO messages      → via service_role (bypass RLS)
   • trigger SQL               → conversations.updated_at = now()
   • notifyUser() par destinataire :
        - si coalesce : DELETE des notifs non lues du même (user, type, cible)
        - INSERT INTO notifications
        - sendPushToUser()     → web-push vers chaque appareil abonné
   • renvoie le message réel (avec son vrai id)

3. TEMPS RÉEL — publication supabase_realtime → WebSocket
   • destinataire : channel `conv-unified-<convId>`, event INSERT sur `messages`,
     filtre conversation_id=eq.<convId>
   • l'expéditeur reçoit également son propre message

4. RÉCONCILIATION — client.tsx:186-199 et 289-294
   Le message réel peut arriver par la réponse POST ou par Realtime, dans un ordre
   non garanti. Le client déduplique par id, et associe le message temporaire par
   comparaison (sender_id + content + embed_ref_id) — pas par id, puisque le
   temporaire n'en a pas encore.

ÉCHEC : le message temporaire passe en status 'failed', avec deux boutons
        « Réessayer » et « Retirer ». Rien n'est perdu silencieusement.
```

---

## 3. Temps réel

Supabase Realtime, mécanisme `postgres_changes` (basé sur la réplication logique
Postgres). Aucun serveur WebSocket maison.

Tables publiées dans `supabase_realtime` :

```
messages, conversation_members     (conversations_unified.sql)
annonces_messages                  (chat_realtime.sql)
covoit_messages, covoit_conversations
support_messages
notifications                      (utilisé par le hook useNotifications)
```

Un canal par conversation ouverte, filtré sur `conversation_id`, désabonné au
démontage du composant (`supabase.removeChannel`). Propre.

**Limite importante** : la *liste* des conversations (`/messages`) n'a **aucun
temps réel**. Elle repose sur SWR seul, revalidé au focus de la fenêtre. Un message
entrant ne met pas la boîte de réception à jour tant que l'utilisateur n'y revient
pas. Seule la pastille de la cloche réagit en direct, via le canal `notifications`.

---

## 4. Authentification et identification

- JWT Supabase transmis en en-tête `Authorization: Bearer`.
- Extrait et validé par `getUserContextFromRequest()` (`src/lib/server-auth.ts:31`),
  qui appelle `supabaseAdmin.auth.getUser(token)` — **un aller-retour réseau à
  chaque appel d'API**, sans cache.
- L'expéditeur n'est **jamais** lu depuis le corps de la requête :
  `sender_id: ctx.userId`, dérivé du jeton. Aucune usurpation possible.
- Le destinataire n'est pas stocké dans le message ; il se déduit de
  `conversation_members`.
- Toutes les écritures passent par le `service_role` (qui contourne la RLS), la
  sécurité étant portée par les vérifications explicites dans chaque route.

---

## 5. Conversations privées et groupes

**Privé** : strictement 1-à-1, avec un vrai modèle de consentement.

- `POST /api/conversations/friend/open` exige `friendships.status = 'accepted'`
  → impossible d'écrire à un inconnu.
- Le garde-fou est **rejoué à chaque envoi** (`messages/route.ts:121-142`) : si
  l'amitié est rompue, la conversation reste lisible mais devient figée, et l'API
  renvoie `canWrite: false` au client, qui masque le champ de saisie.

**Groupes : impossibles en l'état.** La contrainte `CHECK (kind IN ('friend'))`
rejetterait `'group'` au niveau base.

En revanche, le modèle sous-jacent est prêt : `conversation_members` est une table
de jointure N-à-N, et la boucle de notification itère déjà sur l'ensemble des
`otherMembers`. Passer aux groupes demande d'élargir la contrainte et de construire
l'interface — pas de refonte du modèle de données.

---

## 6. Pièces jointes, images, audio

**Aucun envoi de photo, d'image ou d'audio dans aucun des quatre systèmes.**

À la place, dans le chat ami uniquement : des **embeds internes**. L'utilisateur
partage un objet de l'app via un bouton « + » — types autorisés : `event`, `etab`,
`producer`, `annonce`, `promo`, `covoit`, `article`. Le message ne stocke que
`embed_kind` + `embed_ref_id` ; la vignette est **re-résolue au moment de
l'affichage** par une requête Supabase directe depuis le client
(`client.tsx:746-790`), avec repli « Élément supprimé » si la cible n'existe plus.

À noter : la colonne `messages.media` (jsonb) **existe** — ajoutée le 06/06/2026,
avec un format prévu pour `photo` / `youtube` / `link` — mais **aucun code ne
l'écrit ni ne la lit**. Ni la route POST, ni l'interface `Message` du client. Elle
avait été créée pour les publications du mur et ajoutée aux messages par symétrie.

Les trois autres chats sont en texte pur. Annonces dispose en plus de messages
système (`kind` = `system_contact` | `system_closed`).

---

## 7. Notifications push

Web Push standard (VAPID), bibliothèque `web-push`. Table `push_subscriptions`
(`endpoint`, `p256dh`, `auth`, `user_id`).

Chaîne : `notifyUser()` insère la notification en base **puis** appelle
`sendPushToUser()`, qui lit les abonnements du destinataire et envoie à chaque
appareil.

- **Fail-safe intégral** : un push en échec n'interrompt jamais l'envoi du message.
- **Purge automatique** des abonnements morts sur HTTP 404/410 (app désinstallée,
  permission révoquée).
- Le contenu est routé par le champ `type`, pas par `target_type` (commentaire
  explicite dans `push.ts` : la contrainte CHECK sur `target_type` le rend peu
  fiable comme clé de routage). Tout type contenant « message » pointe vers
  `/messages`, avec un `tag` permettant l'empilement natif.
- **Anti-spam** : `coalesce: true` supprime les notifications non lues du même
  triplet (utilisateur, type, cible) avant d'insérer → 3 messages d'affilée
  produisent 1 notification, pas 3.

---

## 8. Lu / non lu, accusés de réception, indicateur « écrit… »

| Fonction | État |
|---|---|
| Compteur de non-lus | ✅ présent |
| Accusé de réception (double coche) | ❌ absent |
| Indicateur « écrit… » | ❌ absent — aucune trace de `typing`, `presence` ou `broadcast` dans le code |
| Statut en ligne / dernière connexion | ❌ absent |

Et **deux modèles de suivi de lecture incompatibles** :

- **Amis** : un curseur `last_read_at` par membre, dans `conversation_members`.
  Le non-lu est recalculé côté serveur en comparant chaque `created_at` à ce
  curseur (`api/conversations/route.ts:90-93`). L'expéditeur ne sait jamais si son
  message a été lu.
- **Annonces / covoiturage / support** : un `lu_at` **par message**. L'information
  nécessaire à un vrai accusé de réception existe donc en base — mais elle n'est
  exploitée nulle part dans l'interface.

---

## 9. Modification et suppression des messages

**Ni l'une ni l'autre, dans aucun des quatre systèmes.** Vérifié par inventaire
exhaustif des méthodes exportées : aucune route de messages n'expose `PATCH` ni
`DELETE`.

La RLS confirme l'intention : sur `messages`, seules des policies `SELECT` et
`INSERT` sont définies pour les utilisateurs. Même avec un accès direct à la base
via un jeton utilisateur, ni modification ni suppression ne sont possibles.

Un message envoyé est définitif. À l'échelle d'un village, c'est défendable — mais
c'est un état de fait hérité, pas une décision produit, et il n'existe aujourd'hui
aucun recours à offrir à quelqu'un qui aurait envoyé un message de trop.

**Suppression de compte** : une migration globale
(`scripts/2026-05-22_user_delete_set_null_global.sql`) bascule les clés étrangères
vers `ON DELETE SET NULL` et lève les contraintes `NOT NULL` correspondantes — les
messages restent dans le fil, anonymisés côté interface.

---

## 10. Sécurité et permissions

C'est la partie la mieux tenue du système.

**RLS avec récursion cassée proprement.** Le piège classique : une policy sur
`conversations` qui interroge `conversation_members`, dont la propre policy
interroge `conversations` → récursion infinie. La solution retenue est la bonne :
une fonction

```sql
is_conversation_member(conv_id UUID, uid UUID)
  RETURNS BOOLEAN
  LANGUAGE SQL SECURITY DEFINER STABLE
  SET search_path = public
```

appelée par les policies des trois tables. `SECURITY DEFINER` contourne la RLS en
interne, `STABLE` permet au planificateur de l'optimiser, et `SET search_path`
bloque l'injection par search_path. Les droits d'exécution sont restreints
(`REVOKE ALL FROM public`, `GRANT EXECUTE TO authenticated, service_role`).

**Défense en profondeur** : chaque route revérifie l'appartenance avant lecture ou
écriture, alors même que le `service_role` contourne la RLS. La RLS sert donc de
filet pour les accès directs depuis le client (notamment la résolution des embeds).

**Ce qui manque** :
- aucune limitation de débit sur l'envoi de messages (la table `api_rate_limits`
  existe mais n'est pas branchée sur ce chemin) ;
- aucun mécanisme de signalement ni de blocage d'un utilisateur ;
- aucun filtrage de contenu.

---

## 11. Backend, API, dépendances externes

### Routes API

```
GET  /api/messages                              boîte unifiée (4 fetch internes)
GET  /api/conversations                         mes conversations amis + non-lus
POST /api/conversations/friend/open             ouvre/crée une conv (vérifie l'amitié)
GET  /api/conversations/[id]/messages           fil complet + flag canWrite
POST /api/conversations/[id]/messages           envoi
POST /api/conversations/[id]/read               met à jour last_read_at
GET|POST /api/annonces/conversations/[convId]/messages
GET|POST /api/covoiturages/conversations/[convId]/messages
GET|POST /api/support/conversations/[convId]/messages
POST /api/push/subscribe  |  /api/push/unsubscribe
GET  /api/notifications   |  POST /api/notifications/seen
```

### Dépendances

| Service | Rôle | Criticité |
|---|---|---|
| Supabase Postgres | stockage de tous les messages | totale |
| Supabase Realtime | livraison instantanée | forte |
| Supabase Auth | identité, JWT | totale |
| Vercel Functions | exécution des routes API | totale |
| `web-push` + VAPID | notifications hors app | dégradable |
| SWR | cache et revalidation côté client | forte |

Aucun service de messagerie tiers. L'ensemble repose sur Supabase.

### Fichiers principaux

```
src/app/conversations/[id]/client.tsx           855 l. — le chat ami (cœur de l'UI)
src/app/messages/client.tsx                     boîte de réception unifiée
src/app/api/messages/route.ts                   agrégateur des 4 systèmes
src/app/api/conversations/route.ts              liste + calcul des non-lus
src/app/api/conversations/[id]/messages/route.ts envoi + lecture
src/app/api/conversations/[id]/read/route.ts    marquage lu
src/app/api/conversations/friend/open/route.ts  création de conversation
src/lib/server-auth.ts                          requireUser, notifyUser, coalesce
src/lib/push.ts                                 web-push, purge, routage deep-link
src/hooks/useNotifications.ts                   canal realtime notifications
src/components/EmbedPanel.tsx                   sélecteur d'objets à partager
supabase/migrations/conversations_unified.sql   schéma + RLS + realtime
supabase/migrations/chat_realtime.sql           publications realtime des 3 autres
```

---

## 12. Schéma de l'architecture

```
                    ┌──────────────────────────────────────┐
  CLIENT            │  /messages — boîte unifiée           │
                    │  SWR seul, PAS de temps réel         │
                    └───────────────────┬──────────────────┘
                                        │ 1 requête
                    ┌───────────────────▼──────────────────┐
                    │  GET /api/messages                   │
                    │  force-dynamic, private no-store     │
                    │  → 4 fetch internes Vercel → Vercel  │
                    └──┬──────────┬──────────┬──────────┬──┘
                       │          │          │          │
              ┌────────▼───┐ ┌────▼─────┐ ┌──▼──────┐ ┌─▼────────┐
              │ annonces   │ │ covoit   │ │ support │ │  amis    │
              │/mes-conv.  │ │/conv.    │ │/conv.   │ │?kind=... │
              └────────┬───┘ └────┬─────┘ └──┬──────┘ └─┬────────┘
                       │          │          │          │
  POSTGRES     ┌───────▼──────────▼──────────▼──────────▼────────┐
               │ annonces_*   covoit_*   support_*   messages     │
               │ RLS → is_conversation_member (SECURITY DEFINER)  │
               │ triggers → conversations.updated_at              │
               └────────────────────────┬─────────────────────────┘
                                        │ publication supabase_realtime
  TEMPS RÉEL   ┌─────────────────────────▼────────────────────────┐
               │ WebSocket — 1 canal par conversation OUVERTE      │
               │            + 1 canal notifications par membre     │
               └──────────────────────────────────────────────────┘

  CHEMIN D'ENVOI
     client optimistic (temp_id)
        → POST → contrôles (membre + amitié) → INSERT
        → trigger updated_at
        → notification en base + web-push (attendu, sur le chemin critique)
        → Realtime → réconciliation par comparaison de contenu
```

---

## 13. Ce qui est solide, artisanal, ou dangereux à l'échelle

### Solide

- **La conception RLS.** Fonction `SECURITY DEFINER` pour casser la récursion,
  `search_path` verrouillé, droits d'exécution restreints. Travail sérieux.
- **Le modèle de consentement.** Amitié vérifiée à l'ouverture *et* à chaque envoi ;
  conversation figée plutôt que supprimée quand l'amitié cesse.
- **L'interface optimiste.** Affichage instantané, états `sending`/`failed`,
  réessayer/retirer. Meilleur que dans beaucoup d'applications établies.
- **La chaîne push.** Fail-safe de bout en bout, purge des abonnements morts,
  coalescence des notifications.
- **`sender_id` jamais lu depuis le client.**
- **La gestion du clavier mobile.** Machine à états `keyboard | panel | none`
  séquencée sur l'événement `blur` natif plutôt que sur un délai fixe.

### Artisanal

- **Réconciliation par comparaison de contenu.** `matchesTemp()` associe le message
  temporaire au message réel via (expéditeur + texte + embed), faute d'identifiant
  commun. Deux messages identiques envoyés coup sur coup peuvent se mélanger.
  C'est documenté dans le code, donc assumé. Un `client_msg_id` généré côté client
  et renvoyé par le serveur réglerait le problème définitivement.
- **Quatre systèmes en parallèle.** Chaque évolution — photos, accusés de réception,
  signalement, modération — est à implémenter quatre fois. C'est le coût caché
  principal de l'architecture actuelle.
- **Deux modèles de lecture** (`last_read_at` par membre vs `lu_at` par message)
  qui ne se rejoignent jamais.
- **`messages.media` créée mais jamais branchée.** Colonne fantôme.
- **La boîte de réception sans temps réel**, alors que tout le reste en dispose.

### Dangereux en montée en charge

**1 — Requête sans limite. C'est le problème principal.**

```js
// src/app/api/conversations/route.ts:78-83
supabaseAdmin.from('messages')
  .select('id, conversation_id, sender_id, content, created_at')
  .in('conversation_id', convs.map(c => c.id))
  .order('created_at', { ascending: false })
  // ← aucun .limit()
```

À chaque ouverture de la boîte de réception, **tous les messages de toutes les
conversations** de l'utilisateur sont téléchargés, pour n'en conserver que le
dernier de chaque et compter les non-lus en JavaScript.

Avec 18 utilisateurs, c'est invisible. Avec 300 utilisateurs actifs et un an
d'historique, c'est des dizaines de milliers de lignes à chaque ouverture d'écran.

Plus grave : PostgREST plafonne le nombre de lignes retournées. Une fois ce plafond
atteint, **les compteurs de non-lus deviennent faux sans lever la moindre erreur**.
Le système ne plantera pas — il mentira.

**2 — Éventail à cinq authentifications.** Une ouverture de boîte = 1 requête client
→ 4 requêtes HTTP internes → 5 validations de jeton (chacune faisant un aller-retour
réseau vers Supabase Auth) → une quinzaine de requêtes SQL. Sans aucun cache
(`force-dynamic`, `no-store`).

**3 — Aucune pagination.** `GET /api/conversations/[id]/messages` retourne
l'intégralité du fil, sans `limit` ni curseur. Une conversation de deux ans se
charge d'un seul bloc.

**4 — Push sur le chemin critique.** `await sendPushToUser()` est attendu *avant*
que l'expéditeur reçoive sa réponse HTTP. Avec trois appareils abonnés, il attend
les trois envois. Devrait être détaché de la réponse.

**5 — Realtime et RLS.** Chaque changement est évalué contre les droits de chaque
abonné : le coût croît avec le produit (messages × abonnés), pas avec le nombre de
messages seul. Le forfait Vercel/Supabase Pro couvre 500 connexions simultanées ;
chaque utilisateur actif en consomme au moins deux (notifications + conversation
ouverte), et une duplication connue du hook `useNotifications` dans `BottomNavBar`
en ajoute une troisième.

**6 — Aucune limitation de débit.** Rien n'empêche un compte de publier
1000 messages par minute, avec une notification push à chaque fois.

---

## 14. Question posée pour la comparaison avec Fluxer

Sur quels axes évaluer l'apport de Fluxer par rapport à l'existant décrit ci-dessus :

1. **Modèle de données** — unifie-t-il les 4 systèmes actuels, ou en ajoute-t-il
   un cinquième à maintenir en parallèle ?
2. **Pagination et compteurs de non-lus** — le point de rupture n° 1 ci-dessus
   est-il traité nativement, avec des curseurs et des compteurs incrémentaux ?
3. **Pièces jointes** (photo, audio) — la principale fonctionnalité manquante.
4. **Accusés de réception et indicateur « écrit… »** — le principal manque de
   confort. Nécessite de la présence, ce que `postgres_changes` ne fournit pas.
5. **Modération** — modification, suppression, signalement, blocage, limitation
   de débit : tout est absent aujourd'hui.
6. **Coût de migration** — quatre systèmes à reprendre, avec des conversations
   réelles d'habitants à l'intérieur, sur une application en production.
7. **Dépendance** — l'app est aujourd'hui 100 % Supabase. Ajouter un service tiers
   pour la messagerie introduit un second fournisseur critique pour une
   application de village portée par un fondateur solo.

**Point à trancher en premier** : les deux plus gros problèmes identifiés (la
requête sans limite et l'absence de pagination) se corrigent en une demi-journée
sur l'existant. Il serait dommage de financer une migration complète pour résoudre
ce qui tient en trois `.limit()` bien placés. La vraie question à poser à Fluxer
porte plutôt sur les fonctions absentes (pièces jointes, présence, modération) et
sur l'unification des quatre systèmes.
