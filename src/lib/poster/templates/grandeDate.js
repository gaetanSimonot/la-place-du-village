import { Box, Text, Img } from '../h.js';

// Palette claire méditerranéenne (look éditorial). Accent terracotta signature.
const P = { bg: '#F2E7D3', ink: '#1B1C2B', muted: '#6E6453', accent: '#C2410C', onAccent: '#FBEFD9', border: 'rgba(27,28,43,0.16)', text: '#1B1C2B' };
const SHADOW = { r: 27, g: 28, b: 43 }, HIGH = { r: 242, g: 231, b: 211 };

export const meta = { palette: P, needs: 'photo' };

export async function render({ d, W, H, fx, sources }) {
  // u = unité horizontale (largeur) ; t = unité TYPO basée sur la plus petite
  // dimension → en paysage la grande date ne devient pas démesurée.
  const u = W / 100, t = Math.min(W, H) / 100, M = 0.067 * W, HB = Math.round(0.40 * H), seam = H - HB;
  const src = sources.photo || sources.bg;
  const photo = src ? await fx.duotone(src, W, HB, SHADOW, HIGH) : null;
  const logo = sources.logo ? await fx.prepLogo(sources.logo) : null;

  const DNUM = 30 * t, colH = 0.72 * DNUM;
  const dateBlock = Box({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2.2 * u },
    Text({ fontFamily: 'Archivo Black', fontSize: DNUM, lineHeight: 0.8, color: P.ink, letterSpacing: -3 }, d.day || '·'),
    Box({ display: 'flex', width: 0.45 * u, height: colH, background: P.accent }),
    Box({ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: colH, paddingTop: 0.6 * u, paddingBottom: 0.6 * u },
      Text({ fontFamily: 'Poppins', fontWeight: 700, fontSize: 2.5 * t, letterSpacing: 5, textTransform: 'uppercase', color: P.muted }, d.weekday),
      Text({ fontFamily: 'Archivo Black', fontSize: 6.8 * t, lineHeight: 0.9, textTransform: 'uppercase', color: P.accent, letterSpacing: -0.5 }, d.month),
      Text({ fontFamily: 'Poppins', fontWeight: 700, fontSize: 2.9 * t, letterSpacing: 6, color: P.ink }, d.year)));

  const logoEl = logo
    ? Box({ display: 'flex', height: 9 * u, width: 9 * u * (logo.w / logo.h) }, Img(logo.uri, { height: 9 * u, width: 9 * u * (logo.w / logo.h), objectFit: 'contain' }))
    : Box({ display: 'flex' });

  return Box(
    { display: 'flex', flexDirection: 'column', position: 'relative', width: W, height: H, background: P.bg, color: P.ink, fontFamily: 'Poppins', overflow: 'hidden' },
    Box({ display: 'flex', flexDirection: 'column', padding: M },
      Box({ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        Box({ display: 'flex', paddingTop: 1.1 * u, paddingBottom: 1.1 * u, paddingLeft: 2 * u, paddingRight: 2 * u, borderRadius: 999, border: `2px solid ${P.ink}`, fontFamily: 'Poppins', fontWeight: 700, fontSize: 1.9 * t, letterSpacing: 3, textTransform: 'uppercase', color: P.ink }, d.tag),
        logoEl),
      Text({ fontFamily: 'Poppins', fontWeight: 800, fontSize: 2.5 * t, letterSpacing: 2.5, textTransform: 'uppercase', color: P.accent, marginTop: 4.4 * u }, [d.title, d.catLabel].filter(Boolean).join('  —  ')),
      Box({ display: 'flex', marginTop: 1.8 * u }, dateBlock),
      Box({ display: 'flex', width: 9 * u, height: 0.55 * u, background: P.accent, marginTop: 2.8 * u }),
      d.description ? Text({ fontFamily: 'Poppins', fontWeight: 500, fontSize: 2.5 * t, lineHeight: 1.5, color: P.muted, maxWidth: '80%', marginTop: 1.8 * u }, d.description) : null),
    photo
      ? Box({ display: 'flex', position: 'absolute', left: 0, top: seam, width: W, height: HB },
          Img(photo, { position: 'absolute', top: 0, left: 0, width: W, height: HB, objectFit: 'cover' }),
          Box({ position: 'absolute', top: 0, left: 0, width: W, height: HB, backgroundImage: 'linear-gradient(180deg, rgba(20,18,30,0) 35%, rgba(20,18,30,0.78) 100%)' }))
      : null,
    Box({ position: 'absolute', left: 0, top: seam - 3, width: W, height: 6, background: P.accent }),
    Box({ position: 'absolute', left: M, bottom: M, display: 'flex', flexDirection: 'column', gap: 0.8 * u },
      Text({ fontFamily: 'Poppins', fontWeight: 700, fontSize: 3 * t, color: P.onAccent }, [d.time, d.place].filter(Boolean).join(' · ')),
      [d.price, d.organizer].filter(Boolean).length ? Text({ fontFamily: 'Poppins', fontWeight: 500, fontSize: 2.2 * t, color: 'rgba(251,239,217,0.82)', letterSpacing: 1 }, [d.price, d.organizer].filter(Boolean).join(' · ')) : null),
    d.cta ? Box({ position: 'absolute', right: M, top: seam - 3.4 * u, display: 'flex', paddingTop: 1.9 * u, paddingBottom: 1.9 * u, paddingLeft: 3.4 * u, paddingRight: 3.4 * u, borderRadius: 999, background: P.accent, color: P.onAccent, fontFamily: 'Poppins', fontWeight: 800, fontSize: 2.8 * u }, d.cta) : null
  );
}
