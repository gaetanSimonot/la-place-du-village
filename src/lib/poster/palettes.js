import { join } from 'node:path';

// Résolution depuis la racine projet (cf. fonts.js) — embarqué via tracing.
const BG_DIR = join(process.cwd(), 'src', 'lib', 'poster', 'backgrounds');
const bg = (file) => join(BG_DIR, file);

// Charte des 8 catégories (clé interne -> couleur/emoji/libellé).
// Doit rester synchro avec la table CATEGORIES de l'app.
export const CATEGORIES = {
  concert:          { label: 'Concert',     emoji: '🎵', color: '#E74C3C' },
  theatre:          { label: 'Théâtre',     emoji: '🎭', color: '#9B59B6' },
  sport:            { label: 'Sport',       emoji: '⚽', color: '#27AE60' },
  marche:           { label: 'Marché',      emoji: '🛍️', color: '#F39C12' },
  atelier:          { label: 'Atelier',     emoji: '🛠️', color: '#3498DB' },
  fete:             { label: 'Fête',        emoji: '🎉', color: '#E91E63' },
  sante_bien_etre:  { label: 'Bien-être',   emoji: '🧘', color: '#16A085' },
  autre:            { label: 'Autre',       emoji: '📌', color: '#95A5A6' },
};

// Fond par défaut quand l'événement n'a PAS de photo (etablissement.photo_url null).
// Valeurs indicatives — à affiner/remplacer. Les fichiers sont dans /backgrounds.
export const BACKGROUNDS = {
  concert:         bg('3d-grunge-brick-interior-with-spotlight-shining-down_1048-16802.avif'),
  theatre:         bg('arriere-plan-abstrait-art-fume-bleu_53876-110800.avif'),
  sport:           bg('360_F_243376759_VZEpwRRstiwMRsDzg96UC8ByFeRGCpQX.jpg'),
  marche:          bg('vintage-vieux-couverts-rustiques-dans-noir_1220-4886.avif'),
  atelier:         bg('depositphotos_97697482-stock-photo-wood-wall-background.jpg'),
  fete:            bg('vintage_background_template_symmetric_rays_6937219.jpg'),
  sante_bien_etre: bg('web_53876-115824.avif'),
  autre:           bg('360_F_320544707_YKQ0cZaHnHAhqy2AqggqDkGjP0APSWqr.jpg'),
};

export const FORMATS = {
  'social-portrait': { width: 1080, height: 1350 },
  'social-story':    { width: 1080, height: 1920 },
  'square':          { width: 1080, height: 1080 },
  'a4-print':        { width: 1240, height: 1754 },
  // Couverture d'événement Facebook (paysage ~1.91:1).
  'facebook-cover':  { width: 1920, height: 1005 },
};
export const DEFAULT_FORMAT = 'social-portrait';
