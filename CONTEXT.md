# La Place du Village — CONTEXT.md

Dernière mise à jour : 7 avril 2026

Application web PWA locale recensant les événements dans un rayon de 30km
autour de Ganges (Hérault, 34). Premier module d'une plateforme plus large.
Tout est public et gratuit — authentification prévue mais non activée.

**Statut : déployé en production** → https://la-place-du-village.vercel.app

---

## Stack technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (PostgreSQL) — base de données
- **Google Maps JavaScript API** — carte publique (clé navigateur avec restriction referrer)
- **Google Places API** (`textsearch`)— géocodage serveur (clé sans restriction)
- **API Claude** (claude-sonnet-4-20250514) — extraction structurée des événements
- **Vercel** — déploiement continu depuis GitHub (branche `main`)

---

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=          # URL du projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Clé publique Supabase (sb_publishable_...)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=       # Clé Maps JS — restriction HTTP referrer localhost + vercel
GOOGLE_PLACES_KEY=                 # Clé Places API — SANS restriction referrer (server-side)
ANTHROPIC_API_KEY=                 # Clé API Claude (sk-ant-api03-...)
```

> ⚠️ Deux clés Google OBLIGATOIREMENT distinctes.
> La clé navigateur renvoie REQUEST_DENIED sur les appels serveur.
> `GOOGLE_PLACES_KEY` ne doit jamais être exposée côté client.

---

## Base de données (Supabase)

Projet : `pboaaykucqbmxryyxslz.supabase.co`
Script de création : `supabase/schema.sql`

### Table `lieux`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK, gen_random_uuid() |
| nom | TEXT | Nom du lieu |
| adresse | TEXT | Adresse formatée retournée par Google Places |
| lat / lng | DOUBLE PRECISION | Coordonnées GPS |
| place_id_google | TEXT | NULL = localisation approximative |
| commune | TEXT | |
| code_postal | TEXT | |
| created_at | TIMESTAMPTZ | |

**Convention localisation approximative :**
`place_id_google IS NULL AND lat IS NOT NULL`
→ coords approx = centre commune géocodé + offset aléatoire ±0.002°
→ détectée via `isApproxLocation(lieu)` dans `src/lib/types.ts`

### Table `evenements`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK |
| titre | TEXT | |
| description | TEXT | |
| date_debut / date_fin | DATE | |
| heure | TIME | |
| categorie | TEXT | concert/theatre/sport/marche/atelier/fete/autre |
| statut | TEXT | publie / en_attente / rejete |
| lieu_id | UUID | FK → lieux (ON DELETE SET NULL) |
| prix / contact / organisateurs | TEXT | |
| image_url | TEXT | |
| source | TEXT | whatsapp / formulaire / admin |
| score_confiance | NUMERIC | Colonne conservée mais non utilisée — remplacée par logique binaire |
| created_at | TIMESTAMPTZ | |

---

## Structure complète des fichiers

```
la-place-du-village/
├── BRIEF.md                          # Cahier des charges initial
├── CONTEXT.md                        # Ce fichier
├── vercel.json                       # Config déploiement Vercel (framework: nextjs)
├── package.json                      # name: la-place-du-village, next@14.2.35
├── killport.bat                      # Script Windows : tue tous les node.exe
├── supabase/
│   └── schema.sql                    # Création tables lieux + evenements + index
│
└── src/
    ├── lib/
    │   ├── supabase.ts               # createClient() exporté
    │   ├── types.ts                  # Evenement, Lieu, Categorie, FiltreQuand, Filtres
    │   │                             # + isApproxLocation(lieu) helper
    │   ├── categories.ts             # CATEGORIES: label, emoji, color par catégorie
    │   ├── filters.ts                # getDateRange(quand), formatDate(date, style)
    │   └── extract.ts                # Tout le pipeline IA :
    │                                 #   extractWithClaude(text, image?)
    │                                 #   geocodeWithGoogle(lieuNom, commune)
    │                                 #   calcStatut(params) → publie/en_attente/rejete
    │                                 #   types ExtractedData, GeoResult, Statut
    │
    ├── app/
    │   ├── layout.tsx                # PWA meta, Inter font, viewport, manifest
    │   ├── globals.css               # Variables CSS couleurs + reset minimal
    │   ├── page.tsx                  # Page principale (client)
    │   │                             # State: activeTab, selectedId, filtres, evenements
    │   │                             # MapView (dynamic, ssr:false) + ListView + FilterBar
    │   │                             # FAB "+" → /ajouter
    │   │
    │   ├── ajouter/
    │   │   └── page.tsx              # Formulaire public 3 étapes :
    │   │                             #   'input' → textarea + photo
    │   │                             #   'preview' → form éditable pré-rempli par IA
    │   │                             #   'success' → confirmation
    │   │
    │   ├── evenement/[id]/
    │   │   └── page.tsx              # Fiche détail (server component)
    │   │                             # Badge catégorie, date, heure, lieu, prix,
    │   │                             # description, contact, bouton "Y aller" Maps
    │   │                             # Badge "localisation approximative" si approx
    │   │
    │   ├── admin/
    │   │   ├── page.tsx              # Back-office (client)
    │   │   │                         # 3 onglets : À traiter / Publiés / Rejetés
    │   │   │                         # Tri : approx en premier dans "À traiter"
    │   │   │                         # Actions inline : Publier / Dépublier / Rejeter / Éditer / Supprimer
    │   │   └── evenement/[id]/
    │   │       └── page.tsx          # Éditeur admin (client)
    │   │                             # - Bloc IA : complétion par texte libre
    │   │                             #   (combine contexte existant + nouveau texte)
    │   │                             # - Autocomplete lieu (LieuAutocomplete component)
    │   │                             # - Recherche Google Places + coords auto
    │   │                             # - Sélecteur statut
    │   │                             # - Bouton "Aperçu →" → overlay fiche complète
    │   │                             # - "Confirmer et publier" force statut: publie
    │   │
    │   └── api/
    │       ├── extract/
    │       │   └── route.ts          # POST {text, image?, source}
    │       │                         # Pipeline complet → insert DB → retourne {evenement, statut}
    │       ├── extract/preview/
    │       │   └── route.ts          # POST {text, image?}
    │       │                         # Extraction + géocodage SANS insert → retourne {extracted, geo}
    │       ├── evenements/
    │       │   └── route.ts          # POST formulaire public → insert DB
    │       │                         # Géocode lieu/commune, calcStatut, insert lieux + evenements
    │       └── admin/
    │           ├── evenements/[id]/
    │           │   └── route.ts      # PATCH (update event + lieu)
    │           │                     # DELETE (supprime event + lieu si plus utilisé)
    │           ├── geocode/
    │           │   └── route.ts      # GET ?q=query → Places textsearch → {lat, lng, adresse, nom}
    │           └── autocomplete/
    │               └── route.ts      # GET ?q=input → Places autocomplete
    │                                 # Biaisé : location=Ganges, radius=40km, country=fr
    │
    ├── components/
    │   ├── MapView.tsx               # Google Maps (APIProvider + Map + Markers)
    │   │                             # Marqueurs SVG colorés par catégorie
    │   │                             # Marqueur approx : cercle en tirets, symbole ~
    │   │                             # Clustering via @googlemaps/markerclusterer
    │   │                             # Chargé via dynamic import (ssr: false)
    │   ├── ListView.tsx              # Liste scrollable, scroll auto vers selectedId
    │   ├── EventCard.tsx             # Fiche compacte : badge catégorie, date, lieu,
    │   │                             # prix, badge "approx." orange
    │   └── FilterBar.tsx             # 2 boutons fixes en haut
    │                                 # "Que faire" → grille catégories
    │                                 # "Quand" → aujourd'hui/week-end/semaine/mois/toujours
    │
    └── public/
        └── manifest.json             # PWA : standalone, theme #C4622D, fond #FBF7F0
```

---

## Palette couleurs (esprit village du sud)

```css
--fond:     #FBF7F0   /* crème chaud */
--primaire: #C4622D   /* terracotta */
--texte:    #2C1810   /* brun foncé */
--bord:     #E8E0D5   /* beige rosé */
```

Catégories :
| Catégorie | Emoji | Couleur |
|---|---|---|
| concert | 🎵 | #E74C3C |
| theatre | 🎭 | #9B59B6 |
| sport | ⚽ | #27AE60 |
| marche | 🛒 | #F39C12 |
| atelier | 🎨 | #3498DB |
| fete | 🎉 | #E91E63 |
| autre | 📌 | #95A5A6 |

---

## Décisions techniques importantes

### Pipeline d'extraction IA
- **Modèle** : `claude-sonnet-4-20250514`
- **Date du jour** injectée dans le prompt → résout "ce samedi", "le 15", "demain"
- **Contexte géographique** dans le prompt → "Hérault (34), région de Ganges"
  → évite Cazilhac (Aude) vs Cazilhac (Hérault), etc.
- **Nettoyage JSON** : Claude renvoie parfois du markdown (` ```json ``` `)
  → `.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()` avant JSON.parse

### Géocodage (geocodeWithGoogle)
1. Essai `textsearch` avec `{lieuNom}, {commune}, France`
   → si trouvé : `approx: false`, `place_id_google` renseigné
2. Si non trouvé, essai `textsearch` avec `{commune}, France` seul
   → si trouvé : `approx: true`, offset ±0.002° aléatoire, `place_id_google: null`
3. Si toujours rien : `lat: null, lng: null` → statut `en_attente`

Geocoding appelé même sans `lieu_nom` si `commune` est présente.

**Pourquoi `textsearch` et pas `findplacefromtext` ?**
`findplacefromtext` renvoyait systématiquement des candidats vides pour les petits lieux locaux (Halles de Ganges, salles des fêtes). `textsearch` fonctionne comme une vraie recherche Google Maps.

### Logique de statut (remplace score_confiance)
```
Publié   : categorie + date_debut + coords GPS + description ≥ 10 chars
Rejeté   : pas de date ET pas de lieu
En attente : tout le reste
```
Le score numérique (0-1) existe encore en base mais n'est plus calculé.

### Localisation approximative
Convention : `place_id_google IS NULL AND lat IS NOT NULL`
- Détection : `isApproxLocation(lieu)` dans `types.ts`
- Carte : marqueur SVG en tirets, symbole `~`, opacité 0.75
- Fiche : badge orange "localisation approximative"
- Admin : onglet "À traiter" → ces événements apparaissent en premier

### Back-office admin
- `/admin` non protégé (auth à faire)
- Complétion IA : combine le contexte existant + nouveau texte → ne met à jour que les champs où Claude trouve quelque chose de nouveau
- Autocomplete lieu : proxy `Places Autocomplete API`, biaisé 40km autour de Ganges
- Flow validation : Éditer → Aperçu (fiche complète) → "Confirmer et publier"
  Le bouton Confirmer passe `statutOverride: 'publie'` directement à `sauvegarder()`
  pour éviter le bug React de state asynchrone

### Deux clés Google
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` : clé avec restriction HTTP referrer (localhost + vercel.app)
  → Maps JS API dans le navigateur uniquement
- `GOOGLE_PLACES_KEY` : clé sans restriction
  → Tous les appels serveur (textsearch, autocomplete, geocode)
  → **Ne jamais utiliser côté client**

### Déploiement
- `vercel.json` créé pour forcer `framework: nextjs` (sans ça → 404)
- `package.json` : `name` corrigé de `nextjs-temp` à `la-place-du-village`
- Variables d'env configurées sur Vercel dashboard
- Déploiement automatique à chaque push sur `main`

---

## Ce qui reste à faire

### Priorité 1 — Intégration WhatsApp
- Recevoir messages/images via **Twilio** ou **WhatsApp Business API**
- Webhook → `POST /api/extract` avec `source: 'whatsapp'`
- Gérer les images en base64 (Claude vision)
- Gérer les messages sans texte (image seule)

### Priorité 2 — Authentification
- Table `users` prévue dans le BRIEF : `id, email, role (guest/member/pro/admin), plan`
- Implémenter avec **Supabase Auth**
- Protéger `/admin` (middleware Next.js)
- Permettre aux members de soumettre des événements en leur nom
- Dashboard member : mes événements soumis

### Priorité 3 — Améliorations UX/Design
- **Icônes PWA manquantes** : `public/icon-192.png` et `public/icon-512.png`
  (sans elles le "Ajouter à l'écran d'accueil" n'affiche pas d'icône)
- Upload photo depuis le formulaire public (vers Supabase Storage)
- Page 404 personnalisée
- Animation transition carte ↔ liste
- Skeleton loading sur les fiches

### Priorité 4 — Améliorations pipeline
- **Déduplication** : détecter même titre + même date avant insertion
- **Carte cliquable dans l'admin** pour corriger manuellement les coords
- Événements récurrents (chaque dimanche, chaque premier vendredi...)
- Notification email admin à chaque nouvel événement `en_attente`

### Priorité 5 — Qualité & monitoring
- Supprimer `score_confiance` de la table (colonne inutilisée)
- Logs d'erreur pipeline (actuellement silencieux si Claude plante)
- Tests E2E sur le pipeline d'extraction
- Rate limiting sur `/api/extract` (protection abus)
