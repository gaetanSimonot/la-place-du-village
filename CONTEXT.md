# La Place du Village — CONTEXT.md

## Ce qui a été construit

Application web PWA locale recensant les événements dans un rayon de 30km
autour de Ganges (Hérault, 34). Premier module d'une plateforme plus large.
Tout est public et gratuit — authentification prévue mais non activée.

---

## Stack technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (PostgreSQL) — hébergement base de données
- **Google Maps JavaScript API** — carte publique (clé navigateur avec restriction referrer)
- **Google Places API** — géocodage serveur (clé sans restriction, appels server-side uniquement)
- **API Claude** (claude-sonnet-4-20250514) — extraction IA des événements
- **Vercel** — déploiement (https://la-place-du-village.vercel.app)

---

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=          # URL du projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Clé publique Supabase
NEXT_PUBLIC_GOOGLE_MAPS_KEY=       # Clé Maps JS (restriction HTTP referrer : localhost + vercel)
GOOGLE_PLACES_KEY=                 # Clé Places API (sans restriction — server-side uniquement)
ANTHROPIC_API_KEY=                 # Clé API Claude
```

> ⚠️ Deux clés Google distinctes obligatoires : la clé navigateur ne fonctionne pas
> pour les appels serveur (REQUEST_DENIED). La clé Places doit être sans restriction
> de referrer.

---

## Base de données (Supabase)

### Table `lieux`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK |
| nom | TEXT | Nom du lieu |
| adresse | TEXT | Adresse formatée Google |
| lat / lng | DOUBLE PRECISION | Coordonnées GPS |
| place_id_google | TEXT | NULL si localisation approximative |
| commune | TEXT | |
| code_postal | TEXT | |
| created_at | TIMESTAMPTZ | |

**Convention localisation approximative :**
`place_id_google IS NULL AND lat IS NOT NULL` → coords approx (centre commune + offset ±0.002°)

### Table `evenements`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK |
| titre | TEXT | |
| description | TEXT | |
| date_debut / date_fin | DATE | |
| heure | TIME | |
| categorie | TEXT | concert/theatre/sport/marche/atelier/fete/autre |
| statut | TEXT | publie/en_attente/rejete |
| lieu_id | UUID | FK → lieux |
| prix / contact / organisateurs | TEXT | |
| image_url | TEXT | |
| source | TEXT | whatsapp/formulaire/admin |
| score_confiance | NUMERIC | Colonne existante, non utilisée (remplacée par logique binaire) |
| created_at | TIMESTAMPTZ | |

---

## Structure des fichiers importants

```
src/
├── lib/
│   ├── supabase.ts          # Client Supabase
│   ├── types.ts             # Types TypeScript + isApproxLocation()
│   ├── categories.ts        # Couleurs et emojis par catégorie
│   ├── filters.ts           # Calcul plages de dates + formatDate()
│   └── extract.ts           # Pipeline IA : extractWithClaude(), geocodeWithGoogle(), calcStatut()
│
├── app/
│   ├── page.tsx             # Page principale (carte + liste + filtres)
│   ├── ajouter/page.tsx     # Formulaire soumission public (2 étapes : saisie → preview)
│   ├── evenement/[id]/      # Fiche détail événement
│   ├── admin/
│   │   ├── page.tsx         # Back-office liste (onglets : à traiter / publiés / rejetés)
│   │   └── evenement/[id]/  # Éditeur admin (IA, autocomplete lieu, aperçu avant publication)
│   └── api/
│       ├── extract/         # POST — pipeline complet (Claude + Places + insert DB)
│       ├── extract/preview/ # POST — extraction seule sans insert (pour formulaire)
│       ├── evenements/      # POST — insert événement depuis formulaire public
│       └── admin/
│           ├── evenements/[id]/  # PATCH + DELETE
│           ├── geocode/          # GET — géocodage Places (utilisé par éditeur admin)
│           └── autocomplete/     # GET — suggestions Places (champ lieu admin)
│
└── components/
    ├── MapView.tsx          # Google Maps + marqueurs colorés par catégorie + clustering
    ├── ListView.tsx         # Liste scrollable avec scroll auto vers sélection
    ├── EventCard.tsx        # Fiche compacte (badge catégorie, date, lieu, prix, badge approx)
    └── FilterBar.tsx        # Filtres "Que faire" + "Quand" avec modales
```

---

## Décisions techniques

### Pipeline d'extraction
- Claude reçoit la date du jour dans son prompt → résout les dates relatives ("ce samedi", "le 15")
- Contexte géographique dans le prompt → privilégie l'Hérault (34) pour les communes ambiguës
- Google Places `textsearch` (pas `findplacefromtext`) — plus robuste pour les lieux locaux
- Si lieu précis trouvé → `approx: false`, coords exactes, `place_id_google` renseigné
- Si lieu non trouvé → essai sur la commune seule → `approx: true`, offset ±0.002° aléatoire
- Si ni lieu ni commune → pas de coords → statut `en_attente`

### Logique de statut (remplace le score de confiance)
Publié automatiquement si **tous** ces champs sont présents :
- `categorie` identifiée
- `date_debut` précise
- Coordonnées GPS vérifiées par Google (exactes OU approximatives)
- `description` ≥ 10 caractères

Rejeté si pas de date ET pas de lieu. Sinon : en attente.

### Localisation approximative
Convention : `place_id_google IS NULL AND lat IS NOT NULL`
- Marqueur carte : cercle en tirets, couleur catégorie, symbole `~`
- Badge "approx." orange sur la fiche et la page détail
- Admin : onglet "À traiter" met ces événements en priorité

### Back-office
- Route `/admin` non protégée (auth prévue plus tard)
- Éditeur avec : complétion IA sur texte libre, autocomplete Google Places biaisé Hérault, aperçu fiche complète avant confirmation
- "Confirmer et publier" force `statut: publie` (évite les erreurs)

### Clés API Google
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` : clé navigateur avec restriction HTTP referrer
- `GOOGLE_PLACES_KEY` : clé serveur sans restriction, jamais exposée au client

---

## Ce qui reste à faire

### Priorité 1 — Scrapper WhatsApp
- Recevoir des messages/images depuis WhatsApp (via Twilio ou WhatsApp Business API)
- Les router vers `POST /api/extract` avec `source: 'whatsapp'`
- Gérer les images en base64

### Priorité 2 — Design & UX
- Icônes PWA (icon-192.png et icon-512.png manquantes)
- Design soigné des fiches événements (typographie, photos)
- Animations de transition carte ↔ liste
- Page 404 personnalisée

### Priorité 3 — Authentification utilisateurs
- Table `users` déjà prévue dans le BRIEF (id, email, role, plan)
- Rôles : guest / member / pro / admin
- Protéger la route `/admin`
- Permettre aux members de soumettre des événements en leur nom

### Priorité 4 — Améliorations pipeline
- Déduplication des événements (même titre + même date → avertissement)
- Gestion des événements récurrents
- Upload photo depuis le formulaire public
- Correction manuelle des coords depuis l'admin (carte cliquable)

### Priorité 5 — Déploiement
- Ajouter les variables d'environnement sur Vercel
- Configurer les domaines autorisés sur la clé Google Maps navigateur
- Tester le build de production (`npm run build`)
