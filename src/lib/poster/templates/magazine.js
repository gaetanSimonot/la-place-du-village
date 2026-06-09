import { Box, Text, Img } from '../h.js';
import { onColor } from '../contract.js';
import { fitBlock } from '../util.js';

// Template "couleur pleine" piloté par la couleur de catégorie (d.accent).
export const meta = { palette: { bg: '#0E0E12' }, needs: 'background' };

export async function render({ d, W, H, fx, sources }) {
  const u = W / 100, M = 0.067 * W, MH = Math.round(0.058 * H);
  // Taille de titre AUTO-AJUSTÉE : tient dans la largeur et limite le nombre
  // de lignes selon le format (4 en portrait, 3 en carré, 2 en paysage) →
  // jamais de débordement, plus de chevauchement catégorie/titre.
  const ratio = H / W;
  const compact = ratio < 0.85;            // bannière paysage : layout resserré
  const maxLines = ratio >= 1.15 ? 4 : ratio >= 0.85 ? 3 : 2;
  const titleSize = fitBlock(d.title, W - 2 * M, { max: 0.08 * W, min: 0.035 * W, charRatio: 0.5, maxLines });
  const src = sources.photo || sources.bg; // la photo prime sur le fond d'ambiance
  const bg = src ? await fx.prepBg(src, W, H) : null;
  const logo = sources.logo ? await fx.prepLogo(sources.logo) : null;
  const acc = d.accent, onAcc = onColor(acc);

  return Box(
    { display: 'flex', flexDirection: 'column', position: 'relative', width: W, height: H, background: '#0E0E12', color: '#FFFFFF', fontFamily: 'Poppins', overflow: 'hidden' },
    bg ? Img(bg, { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }) : null,
    Box({ position: 'absolute', top: 0, left: 0, width: W, height: H, backgroundImage: 'linear-gradient(180deg, rgba(8,8,12,0.55) 0%, rgba(8,8,12,0) 22%, rgba(8,8,12,0) 45%, rgba(8,8,12,0.92) 100%)' }),
    Box({ position: 'absolute', top: 0, left: 0, width: W, height: MH, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: M, paddingRight: M, background: acc, color: onAcc },
      Text({ fontFamily: 'Poppins', fontWeight: 800, fontSize: 1.9 * u, letterSpacing: 3, textTransform: 'uppercase' }, d.organizer || d.title),
      d.when ? Text({ fontFamily: 'Poppins', fontWeight: 600, fontSize: 1.9 * u, letterSpacing: 2, textTransform: 'uppercase' }, d.when) : null),
    (!compact && d.catLabel) ? Box({ position: 'absolute', top: MH + 0.03 * H, left: M, display: 'flex', paddingTop: 1 * u, paddingBottom: 1 * u, paddingLeft: 2 * u, paddingRight: 2 * u, borderRadius: 999, background: acc, color: onAcc, fontFamily: 'Poppins', fontWeight: 800, fontSize: 1.9 * u, letterSpacing: 3, textTransform: 'uppercase' }, d.catLabel) : null,
    logo ? Box({ position: 'absolute', top: MH + 0.025 * H, right: M, display: 'flex', height: 11 * u, width: 11 * u * (logo.w / logo.h) },
      Img(logo.uri, { height: 11 * u, width: 11 * u * (logo.w / logo.h), objectFit: 'contain' })) : null,
    Box({ position: 'absolute', left: M, right: M, bottom: M, display: 'flex', flexDirection: 'column' },
      (compact && d.catLabel) ? Text({ fontFamily: 'Poppins', fontWeight: 800, fontSize: 2.1 * u, letterSpacing: 4, textTransform: 'uppercase', color: acc, marginBottom: 1.4 * u }, d.catLabel) : null,
      Box({ display: 'flex', width: 7 * u, height: 0.55 * u, background: acc, marginBottom: 2.4 * u }),
      Text({ fontFamily: 'DM Serif Display', fontSize: titleSize, lineHeight: 1.04, color: '#FFF8EE' }, d.title),
      (!compact && d.description) ? Text({ fontFamily: 'Poppins', fontWeight: 400, fontSize: 2.5 * u, lineHeight: 1.4, color: 'rgba(255,255,255,0.82)', marginTop: 2.4 * u, maxWidth: '88%' }, d.description) : null,
      Box({ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3.4 * u },
        Box({ display: 'flex', flexDirection: 'column', gap: 0.8 * u },
          d.place ? Text({ fontFamily: 'Poppins', fontWeight: 700, fontSize: 2.7 * u, color: '#FFFFFF' }, d.place) : null,
          d.price ? Text({ fontFamily: 'Poppins', fontWeight: 500, fontSize: 2.3 * u, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }, d.price) : null),
        d.cta ? Box({ display: 'flex', paddingTop: 1.9 * u, paddingBottom: 1.9 * u, paddingLeft: 3.4 * u, paddingRight: 3.4 * u, borderRadius: 999, background: acc, color: onAcc, fontFamily: 'Poppins', fontWeight: 800, fontSize: 2.7 * u }, d.cta) : null))
  );
}
