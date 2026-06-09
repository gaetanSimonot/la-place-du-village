import sharp from 'sharp';

// NB : Satori ne supporte pas les mix-blend-mode CSS (multiply, screen…).
// Tous les effets "multiply / duotone / grain" sont donc CUITS dans l'image ici,
// avec sharp, AVANT la mise en page. Visuellement identique, plus de contrôle.

export const solid = (W, H, c) =>
  sharp({ create: { width: W, height: H, channels: 3, background: c } }).png().toBuffer();

// Grain argentique subtil (tuile répétée, blend overlay).
export async function noiseTile(n = 256, amp = 28, alpha = 22) {
  const data = Buffer.alloc(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const g = 128 + Math.round((Math.random() * 2 - 1) * amp);
    data[i * 4] = g; data[i * 4 + 1] = g; data[i * 4 + 2] = g; data[i * 4 + 3] = alpha;
  }
  return sharp(data, { raw: { width: n, height: n, channels: 4 } }).png().toBuffer();
}

const toUri = (buf) => 'data:image/png;base64,' + buf.toString('base64');

// Duotone : ombres -> `shadow`, hautes lumières -> `high`. + grain.
export async function duotone(src, W, H, shadow, high) {
  const diff = { r: Math.max(0, high.r - shadow.r), g: Math.max(0, high.g - shadow.g), b: Math.max(0, high.b - shadow.b) };
  let base = await sharp(src).resize(W, H, { fit: 'cover', position: sharp.strategy.attention })
    .modulate({ saturation: 0 }).normalise().linear(1.2, -22).toBuffer();
  base = await sharp(base).composite([{ input: await solid(W, H, diff), blend: 'multiply' }]).toBuffer();
  base = await sharp(base).composite([{ input: await solid(W, H, shadow), blend: 'add' }]).toBuffer();
  base = await sharp(base).composite([{ input: await noiseTile(), tile: true, blend: 'overlay' }]).png().toBuffer();
  return toUri(base);
}

// Fond couleur pleine : cadrage cover + grain (couleur naturelle conservée).
export async function prepBg(src, W, H) {
  let b = await sharp(src).resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).linear(1.02, -6).toBuffer();
  b = await sharp(b).composite([{ input: await noiseTile(), tile: true, blend: 'overlay' }]).png().toBuffer();
  return toUri(b);
}

// Détoure un logo sur fond noir (noir -> transparent) + recadre serré.
export async function keyBlack(src, thresh = 26) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch)
    if (data[i] < thresh && data[i + 1] < thresh && data[i + 2] < thresh) data[i + 3] = 0;
  let buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
  buf = await sharp(buf).trim().png().toBuffer();
  const m = await sharp(buf).metadata();
  return { uri: toUri(buf), w: m.width, h: m.height };
}
