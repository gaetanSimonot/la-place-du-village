# La Place du Village — Module Agenda

## Contexte
Application web PWA locale pour recenser les événements
dans un rayon de 30km autour de Ganges (Hérault, France).
Ce module est le premier d'une plateforme plus large.
Tout est public et gratuit pour l'instant — 
les rôles utilisateurs seront activés plus tard.

## Stack technique
- Next.js 14 (App Router, TypeScript)
- Supabase (PostgreSQL + PostGIS)
- Google Maps JavaScript API
- Google Places API
- API Claude (claude-sonnet-4-20250514)
- Déployé sur Vercel

## Variables d'environnement nécessaires
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
GOOGLE_PLACES_KEY=
ANTHROPIC_API_KEY=

## Base de données — tables à créer

### Table : lieux
- id, nom, adresse, lat, lng
- place_id_google
- commune, code_postal

### Table : evenements
- id, titre, description
- date_debut, date_fin, heure
- categorie (concert / theatre / sport / 
  marche / atelier / fete / autre)
- statut (publie / en_attente / rejete)
- lieu_id (clé étrangère → lieux)
- prix, contact, organisateurs
- image_url
- source (whatsapp / formulaire / admin)
- score_confiance (0 à 1)
- created_at

### Table : users (prévu, non activé)
- id, email, role (guest/member/pro/admin)
- plan (free/member/pro)
- created_at

## Ce que fait l'application

### Front (PWA publique)
Page unique avec deux modes : carte et liste.
- Carte Google Maps avec points cliquables
- Liste de fiches événements
- Deux filtres principaux :
  "Que faire" → catégorie
  "Quand" → aujourd'hui / ce week-end / 
             cette semaine / ce mois / toujours
- Clic sur point carte = sélection dans la liste
- Clic sur fiche = détail de l'événement
- Bouton "Ajouter un événement" (formulaire simple)

### Back-office (route /admin — non protégé pour l'instant)
- Liste tous les événements avec statut
- Éditer / supprimer un événement
- Valider les événements en attente

## Pipeline d'extraction (API Route)
Reçoit : texte + image en base64 (optionnel)
1. Envoie à Claude API → JSON structuré
2. Envoie le lieu à Google Places API → lat/lng
3. Calcule un score de confiance
4. Insère dans Supabase

## Ordre de construction
1. Initialiser Next.js + connecter Supabase
2. Créer les tables SQL
3. Construire le pipeline d'extraction (API Route)
4. Construire le front PWA (carte + liste + filtres)
5. Construire le formulaire de soumission
6. Construire le back-office /admin

## Règle importante
Ne pas passer à l'étape suivante
sans que la précédente fonctionne et soit testée.
