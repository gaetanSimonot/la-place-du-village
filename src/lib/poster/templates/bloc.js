import { Box, Text, Img } from '../h.js';
import { fitBlock } from '../util.js';

// Palette fixe (look "club" sombre). Accent doré signature.
const P = { bg: '#0E1222', text: '#F7F0E2', muted: '#9890A6', accent: '#E3A93B', onAccent: '#241046', cream: '#F3E9D6', border: 'rgba(247,240,226,0.18)' };
const SHADOW = { r: 14, g: 18, b: 34 }, HIGH = { r: 243, g: 233, b: 214 };

export const meta = { palette: P, needs: 'photo' };

export async function render({ d, W, H, fx, sources }) {
  const u = W / 100, M = 0.075 * W, H1 = Math.round(0.52 * H);
  const src = sources.photo || sources.bg;
  const photo = src ? await fx.duotone(src, W, H1, SHADOW, HIGH) : null;
  const logo = sources.logo ? await fx.keyBlack(sources.logo) : null;
  const titleSize = fitBlock(d.title, W - 2 * M, { max: 0.125 * W, min: 0.05 * W, charRatio: 0.52, maxLines: 3 });

  const corner = logo
    ? Box({ display: 'flex', width: 14 * u, height: 14 * u, borderRadius: 9999, background: P.cream, alignItems: 'center', justifyContent: 'center' },
        Img(logo.uri, { height: 9.4 * u, width: 9.4 * u * (logo.w / logo.h), objectFit: 'contain' }))
    : (d.organizer ? Text({ fontFamily: 'Poppins', fontWeight: 600, fontSize: 2.4 * u, color: P.muted, letterSpacing: 1 }, d.organizer) : Box({ display: 'flex' }));

  const metaRow = (val) => Box({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1.4 * u },
    Box({ display: 'flex', width: 1.1 * u, height: 1.1 * u, borderRadius: 999, background: P.accent }),
    Text({ fontFamily: 'Poppins', fontWeight: 500, fontSize: 2.9 * u, color: P.text }, val));

  return Box(
    { display: 'flex', flexDirection: 'column', position: 'relative', width: W, height: H, background: P.bg, color: P.text, fontFamily: 'Poppins', overflow: 'hidden' },
    photo
      ? Box({ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H1 },
          Img(photo, { position: 'absolute', top: 0, left: 0, width: W, height: H1, objectFit: 'cover' }),
          Box({ position: 'absolute', top: 0, left: 0, width: W, height: H1, backgroundImage: `linear-gradient(180deg, rgba(14,18,34,0.12) 0%, rgba(14,18,34,0.12) 45%, ${P.bg} 100%)` }))
      : null,
    // Barre haute : tag + coin (logo ou organisateur)
    Box({ position: 'absolute', top: M, left: M, right: M, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      Box({ display: 'flex', paddingTop: 1.1 * u, paddingBottom: 1.1 * u, paddingLeft: 2 * u, paddingRight: 2 * u, borderRadius: 999, background: P.accent, color: P.onAccent, fontFamily: 'Poppins', fontWeight: 700, fontSize: 2 * u, letterSpacing: 3, textTransform: 'uppercase' }, d.tag),
      corner),
    // Contenu ancré en bas : s'empile vers le haut, jamais de collision
    Box({ position: 'absolute', left: M, right: M, bottom: M, display: 'flex', flexDirection: 'column' },
      Box({ display: 'flex', width: 7 * u, height: 0.55 * u, background: P.accent, marginBottom: 2 * u }),
      d.catLabel ? Text({ fontFamily: 'Poppins', fontWeight: 700, fontSize: 2.4 * u, letterSpacing: 4, textTransform: 'uppercase', color: P.accent, marginBottom: 1.4 * u }, d.catLabel) : null,
      Text({ fontFamily: 'Archivo Black', fontSize: titleSize, lineHeight: 0.94, textTransform: 'uppercase', letterSpacing: -1, color: P.text, width: '100%' }, d.title),
      d.description ? Text({ fontFamily: 'Poppins', fontWeight: 500, fontSize: 2.4 * u, lineHeight: 1.4, color: P.muted, marginTop: 2.2 * u, maxWidth: '88%' }, d.description) : null,
      Box({ display: 'flex', flexDirection: 'column', gap: 1.3 * u, marginTop: 2.6 * u }, d.when ? metaRow(d.when) : null, d.place ? metaRow(d.place) : null),
      Box({ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2.6 * u },
        Box({ display: 'flex', paddingTop: 1.8 * u, paddingBottom: 1.8 * u, paddingLeft: 3.2 * u, paddingRight: 3.2 * u, borderRadius: 999, background: P.accent, color: P.onAccent, fontFamily: 'Poppins', fontWeight: 800, fontSize: 3 * u }, d.cta),
        d.price ? Text({ fontFamily: 'Poppins', fontWeight: 600, fontSize: 2.2 * u, color: P.muted, letterSpacing: 1 }, d.price) : null))
  );
}
