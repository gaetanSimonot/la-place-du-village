// Adapte le CONTRAT de l'app (EventEditDrawer) -> données internes des templates.
// Tout arrive en string|null. On gère les vides : un champ absent disparaît de l'affiche.

const WD = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MO = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const fmtTime = (h) => (h ? h.replace(':', 'h').replace(/h00$/, 'h') : '');

// "2026-07-12" (+ "20:00") -> "Dimanche 12 juillet · 20h". Le jour de semaine est CALCULÉ.
export function fmtDate(debut, fin, heure) {
  if (!debut) return '';
  const [y, m, d] = debut.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let s = `${WD[dt.getUTCDay()]} ${d} ${MO[m - 1]}`;
  if (fin && fin !== debut) { const [, , d2] = fin.split('-').map(Number); s = `${d} → ${d2} ${MO[m - 1]}`; }
  const t = fmtTime(heure);
  if (t) s += ` · ${t}`;
  return s;
}

export const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
// Texte lisible sur une couleur donnée (clair si la couleur est sombre, et inversement).
export const onColor = (hex) => (lum(hex) > 150 ? '#15140F' : '#FFFFFF');

export function fromContract(e = {}) {
  const [y, m, d] = (e.date_debut || '').split('-');
  return {
    title: e.titre || 'Événement',
    description: e.description || '',
    when: fmtDate(e.date_debut, e.date_fin, e.heure),
    time: fmtTime(e.heure),
    day: d ? String(Number(d)) : '',
    month: m ? MO[Number(m) - 1] : '',
    year: y || '',
    weekday: e.date_debut ? WD[new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay()] : '',
    place: [e.lieu_nom, e.commune].filter(Boolean).join(', '),
    address: e.adresse || '',
    price: e.prix || '',
    contact: e.contact || '',
    organizer: (e.etablissement && e.etablissement.nom) || e.organisateurs || '',
    tag: e.categorie_label || 'Live',
    catLabel: e.categorie_label || '',
    catEmoji: e.categorie_emoji || '',
    accent: e.categorie_couleur || '#E74C3C',
    cta: 'Réserver',
    establishmentPhoto: (e.etablissement && e.etablissement.photo_url) || null,
  };
}
