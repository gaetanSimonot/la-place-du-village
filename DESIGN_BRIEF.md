# Design Brief — La Place du Village

## L'app
PWA mobile-first. Carte interactive d'événements
locaux. Esprit place de village du sud de la France.
Chaleureux, vivant, accessible à tous.

## Palette
- Orange terre cuite : #E8622A
- Vert Cévennes     : #5B8C5A
- Crème             : #FAF7F2
- Bleu carte        : #4A90D9
- Texte sombre      : #2C2C2C

## Typographie
- Titres : Syne (Google Fonts) — gras, impact
- Corps  : Inter — clean, lisible

## Composants UI
- Bottom sheet (comme Google Maps) pour les fiches
- Pills scrollables horizontalement pour les filtres
- Bottom navigation bar fixe (Carte / Liste / Profil)
- FAB (Floating Action Button) "+" en bas à droite
- Cards avec ombre douce, coins arrondis 16px
- Glassmorphism sur overlays carte
- Skeleton loaders pendant le chargement
- Framer Motion pour les transitions

## Ce qu'on construit dans l'ordre
1. Layout principal + bottom navigation
2. Page carte avec Google Maps + points colorés
3. Filtres "Que faire" et "Quand" en pills
4. Bottom sheet fiche événement
5. Page liste
6. Page ajout événement

## Règles absolues
- Minimum 48px pour tout élément tactile
- Pas de tableau
- Pas de bleu corporate
- Pas de Bootstrap ni Material UI
- Tout doit sembler natif mobile
- Animations sur toutes les transitions
- Jamais de page blanche — skeleton loaders
