import { h, Box, Img } from './h.js';

// Lit les dimensions intrinsèques d'une image (PNG/JPEG) pour placer le logo au bon ratio.
export function imageSize(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      // PNG : largeur/hauteur dans le chunk IHDR
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      // JPEG : on cherche un marqueur SOF
      let o = 2;
      while (o < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const marker = buf[o + 1];
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function dataUriToBuffer(uri) {
  const i = uri.indexOf('base64,');
  return i === -1 ? null : Buffer.from(uri.slice(i + 7), 'base64');
}

// Repère "place du village" (épingle de localisation) coloré selon l'accent du thème.
function pinDataUri(color, hole) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.4" fill="${hole}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Calque "logo établissement", positionné dans l'un des 6 coins/centres.
export function logoLayer(logoUri, position, W, H, dims) {
  if (!logoUri || !position || position === 'none') return null;
  const m = 0.05 * W;
  const hgt = 0.085 * W;
  const wdt = dims ? Math.min(0.42 * W, hgt * (dims.w / dims.h)) : 0.24 * W;
  const img = Img(logoUri, { height: hgt, width: wdt, objectFit: 'contain' });
  const vert = position.startsWith('top') ? { top: m } : { bottom: m };
  if (position.endsWith('center')) {
    return Box({ position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center', ...vert }, img);
  }
  const horiz = position.endsWith('left') ? { left: m } : { right: m };
  return Box({ position: 'absolute', display: 'flex', ...vert, ...horiz }, img);
}

// Bandeau plateforme permanent (laplaceduvillage.app).
export function footerBar(p, W, Hf, u, { name, tagline }) {
  return Box(
    {
      display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 1.2 * u, width: W, height: Hf, backgroundColor: p.bg, borderTop: `1px solid ${p.border}`,
    },
    Img(pinDataUri(p.accent, p.bg), { width: 2.7 * u, height: 2.7 * u }),
    h('div', { style: { fontFamily: 'Poppins', fontWeight: 500, fontSize: 2.0 * u, color: p.muted } }, tagline),
    h('div', { style: { fontFamily: 'Poppins', fontWeight: 800, fontSize: 2.0 * u, color: p.text, letterSpacing: 0.3 } }, name)
  );
}
