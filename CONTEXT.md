# La Place du Village — CONTEXT.md

Dernière mise à jour : 7 avril 2026

Application web PWA locale recensant les événements dans un rayon de 30km
autour de Ganges (Hérault, 34). Premier module d'une plateforme plus large.
Tout est public et gratuit — authentification prévue mais non activée.

**Statut : déployé en production** → https://la-place-du-village.vercel.app

---

## Stack technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (PostgreSQL) — base de données + Storage (images)
- **Google Maps JavaScript API** — carte publique (clé navigateur avec restriction referrer)
- **Google Places API** (`textsearch`) — géocodage serveur (clé sans restriction)
- **API Claude** (claude-sonnet-4-20250514) — extraction structurée des événements
- **OpenAI Whisper** (whisper-1) — transcription vocale des champs texte
- **Jina AI Reader** (r.jina.ai) — rendu JS pour le scraping (gratuit, sans clé)
- **Vercel** — déploiement continu depuis GitHub (branche `main`)

---

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=          # URL du projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Clé publique Supabase (sb_publishable_...)
SUPABASE_SERVICE_KEY=              # Clé service_role Supabase (pour Storage + scraping)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=       # Clé Maps JS — restriction HTTP referrer localhost + vercel
GOOGLE_PLACES_KEY=                 # Clé Places API — SANS restriction referrer (server-side)
ANTHROPIC_API_KEY=                 # Clé API Claude (sk-ant-api03-...)
OPENAI_API_KEY=                    # Clé OpenAI — Whisper transcription (sk-proj-...)
WHATSAPP_API_KEY=                  # Clé auth webhook WhatsApp (wak_9d3f5a1e8b2c6f4a0d7e3b9c5f1a8d2e)
```

> ⚠️ Deux clés Google OBLIGATOIREMENT distinctes.
> `SUPABASE_SERVICE_KEY` ne doit jamais être exposée côté client.

---

## Base de données (Supabase)

Projet : `pboaaykucqbmxryyxslz.supabase.co`
Scripts de création : `supabase/schema.sql` + `supabase/schema_sources.sql`

### Table `lieux`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK |
| nom | TEXT | |
| adresse | TEXT | |
| lat / lng | DOUBLE PRECISION | |
| place_id_google | TEXT | NULL = localisation approximative |
| commune | TEXT | |
| code_postal | TEXT | |
| created_at | TIMESTAMPTZ | |

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
| lieu_id | UUID | FK → lieux |
| prix / contact / organisateurs | TEXT | |
| image_url | TEXT | URL publique Supabase Storage |
| source | TEXT | whatsapp / formulaire / admin / scrape |
| scrape_source_id | UUID | FK → sources (NULL si pas scrape) |
| score_confiance | NUMERIC | Inutilisé |
| created_at | TIMESTAMPTZ | |

### Table `sources` (scraping)
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK |
| nom | TEXT | |
| url | TEXT | |
| actif | BOOLEAN | |
| frequence | TEXT | 12h / 24h / 48h |
| dernier_scrape | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### Table `scrape_logs`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID | PK |
| source_id | UUID | FK → sources |
| created_at | TIMESTAMPTZ | |
| trouves | INTEGER | |
| doublons | INTEGER | |
| inseres | INTEGER | |
| erreur | TEXT | |

### Supabase Storage
- Bucket : `event-images` (public)
- Dossier `whatsapp/` : images envoyées via WhatsApp collector
- Dossier `formulaire/` : images uploadées via /capturer

---

## Structure complète des fichiers

```
la-place-du-village/
├── BRIEF.md
├── CONTEXT.md
├── vercel.json
├── package.json
├── .eslintrc.json                    # no-img-element désactivé
├── supabase/
│   ├── schema.sql
│   └── schema_sources.sql            # Tables sources + scrape_logs + ALTER evenements
│
└── src/
    ├── lib/
    │   ├── supabase.ts
    │   ├── types.ts                  # Evenement, Lieu, Categorie + isApproxLocation
    │   ├── categories.ts
    │   ├── filters.ts
    │   ├── extract.ts                # extractWithClaude(text|null, image?, mimeType?)
    │   │                             # geocodeWithGoogle, calcStatut
    │   └── scraper.ts                # scrapeSource(id) — Jina Reader + Claude + dedup Jaccard
    │
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── page.tsx                  # FAB "+" → mini-menu (Photo/Affiche | Décrire texte)
    │   │
    │   ├── ajouter/
    │   │   └── page.tsx              # Formulaire texte + photo optionnelle + MicButton
    │   │                             # → /api/extract/preview → /api/evenements
    │   │
    │   ├── capturer/
    │   │   └── page.tsx              # Flow media-first : caméra/galerie + texte optionnel
    │   │                             # Compression auto (max 1200px, JPEG 82%)
    │   │                             # → /api/extract/preview → /api/evenements
    │   │
    │   ├── evenement/[id]/
    │   │   └── page.tsx
    │   │
    │   ├── admin/
    │   │   ├── page.tsx              # 4 onglets : À traiter / Scrap / Publiés / Rejetés
    │   │   │                         # Scrap : événements source='scrape' en_attente
    │   │   │                         # Checkboxes + sélection multiple + publier/supprimer en masse
    │   │   │                         # Lien "Sources" dans le header
    │   │   ├── sources/
    │   │   │   └── page.tsx          # Gérer les sources de scraping
    │   │   │                         # Ajouter / supprimer / activer / désactiver
    │   │   │                         # "Scraper maintenant" + logs inline
    │   │   └── evenement/[id]/
    │   │       └── page.tsx
    │   │
    │   └── api/
    │       ├── extract/
    │       │   ├── route.ts          # POST {text?, image?, imageMimeType, source}
    │       │   │                     # Auth x-wa-key si source='whatsapp'
    │       │   │                     # Upload image → Supabase Storage (supabaseAdmin)
    │       │   │                     # Déduplication : ilike(titre) + eq(date_debut)
    │       │   └── preview/
    │       │       └── route.ts      # POST {text?, image?, imageMimeType} — sans insert
    │       ├── evenements/
    │       │   └── route.ts          # POST formulaire → géocode → insert
    │       │                         # Accepte image base64 → upload Storage
    │       ├── transcribe/
    │       │   └── route.ts          # POST multipart audio → Whisper → {text}
    │       ├── scrape-source/
    │       │   └── route.ts          # GET ?id=xxx ou POST {id} → scrapeSource()
    │       │                         # maxDuration: 60
    │       └── admin/
    │           ├── evenements/[id]/
    │           │   └── route.ts      # PATCH + DELETE
    │           ├── sources/
    │           │   ├── route.ts      # GET list + POST create
    │           │   └── [id]/route.ts # PATCH + DELETE
    │           ├── geocode/route.ts
    │           └── autocomplete/route.ts
    │
    └── components/
        ├── MapView.tsx
        ├── ListView.tsx
        ├── EventCard.tsx
        ├── FilterBar.tsx
        └── MicButton.tsx             # Dictée vocale Whisper
                                      # idle → micro | recording → carré rouge pulse | spinner
                                      # onTranscript(text) → append au champ
```

---

## Palette couleurs

```css
--fond:     #FBF7F0
--primaire: #C4622D
--texte:    #2C1810
--bord:     #E8E0D5
```

---

## Décisions techniques importantes

### Pipeline WhatsApp → PDV
- **collector** (Electron, `D:\@CLAUDE\SCRAP\whatsapp-collector`) collecte les messages
- `src/sender.js` : lit les JSON locaux, convertit media → base64, POST `/api/extract`
- Header `x-wa-key: WHATSAPP_API_KEY` obligatoire pour `source='whatsapp'`
- Images uploadées sur Supabase Storage → `image_url` stockée
- `pdv_sent_ids.json` dans AppData pour éviter les renvois
- `lastRun` effacé à chaque clic "Collecter maintenant" (repart depuis `startDate`)
- `lastRun` effacé aussi à chaque sauvegarde config (sinon lastRun prenait le dessus)

### Scraping engine (`src/lib/scraper.ts`)
- **Jina AI Reader** (`https://r.jina.ai/{url}`) pour rendre les pages JS
- Claude extrait les événements → tableau JSON
- Déduplication : similarité Jaccard ≥ 75% sur les mots du titre + même date
- Événements scrappés : `source='scrape'`, `statut='en_attente'` → jamais publiés auto
- Validation dans l'onglet **Scrap** du back-office
- Logs dans table `scrape_logs`

### Déduplication `/api/extract`
- Avant chaque insert : `ilike(titre)` + `eq(date_debut)` → si match → retourne `{duplicate: true}`
- Sender.js traite `duplicate: true` comme succès (marque comme envoyé, pas d'erreur)

### Capture photo (`/capturer`)
- Deux inputs : caméra (`capture="environment"`) et galerie
- Compression côté client : canvas, max 1200px, JPEG 82% → évite timeout Vercel (limite 4.5 MB)
- Texte optionnel → si image seule, Claude analyse l'affiche directement
- Preview éditable avant soumission

### MicButton (Whisper)
- MediaRecorder API → audio/webm → POST `/api/transcribe`
- Whisper `whisper-1`, langue `fr`
- Transcription ajoutée à la suite du texte existant (pas de remplacement)
- Présent sur `/ajouter` et `/capturer`

### FAB "+" page principale
- `router.push()` + mini-menu flottant au-dessus du bouton
- Tourne à 45° (→ ×) quand ouvert
- Backdrop transparent pour fermer au clic extérieur

### Deux clés Google
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` : Maps JS (navigateur, restriction referrer)
- `GOOGLE_PLACES_KEY` : Places textsearch + autocomplete (serveur uniquement)

### TypeScript / ESLint
- Target bas → toujours utiliser `Array.from(set)` au lieu de `[...set]`
- `no-img-element` désactivé dans `.eslintrc.json` (images externes Supabase)

---

## Ce qui reste à faire

### Priorité 1 — Design & Navigation (prochaine session)
- Refonte complète UI/UX : navigation, typographie, couleurs, espacements
- Page d'accueil plus accueillante
- Fiche événement enrichie (image en hero, partage, "Y aller")
- Animations transitions carte ↔ liste
- Skeleton loading
- Page 404 personnalisée
- Icônes PWA (`public/icon-192.png`, `public/icon-512.png`)

### Priorité 2 — Cron scraping
- Vercel cron job 24h : `/api/cron/scrape` → scrape toutes les sources actives
- Ajouter dans `vercel.json` : `"crons": [{"path": "/api/cron/scrape", "schedule": "0 6 * * *"}]`

### Priorité 3 — Whisper sur l'admin
- Ajouter MicButton dans l'éditeur admin `/admin/evenement/[id]`

### Priorité 4 — Authentification
- Supabase Auth — protéger `/admin`
- Table `users` (role: guest/member/pro/admin)
- Dashboard member : mes événements soumis

### Priorité 5 — Améliorations pipeline
- Upload photo depuis `/ajouter` (texte) — actuellement photo analysée mais pas stockée
- Déduplication plus fine (fuzzy sur commune + heure)
- Événements récurrents
- Notification email admin à chaque nouvel événement `en_attente`
- Rate limiting sur `/api/extract`
- Logs d'erreur pipeline

### Priorité 6 — Qualité
- Supprimer colonne `score_confiance` (inutilisée)
- Tests E2E pipeline extraction
