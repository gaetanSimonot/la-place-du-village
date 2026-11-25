// Disponibilité de l'app Android (TWA) sur Google Play.
// false = l'app est retirée du Play Store : on propose l'installation de la PWA
// sur Android au lieu de rediriger vers une fiche Play morte.
// Quand l'app est de retour : repasser à true ET remettre
// "prefer_related_applications": true dans public/manifest.json.
export const PLAY_STORE_AVAILABLE = true

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.laplaceduvillage'
