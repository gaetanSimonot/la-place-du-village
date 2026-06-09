import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { h } from './h.js';
import { footerBar } from './branding.js';
import { FONTS } from './fonts.js';
import { fromContract } from './contract.js';
import { BACKGROUNDS, FORMATS, DEFAULT_FORMAT } from './palettes.js';
import { TEMPLATES, TEMPLATE_NAMES } from './templates/index.js';
import * as fx from './imagefx.js';

const DEFAULT_BRANDING = { show: true, name: 'laplaceduvillage.app', tagline: 'Retrouvez cet événement sur' };

// path | Buffer | URL http(s) -> source utilisable par sharp (Buffer si URL).
async function resolveSrc(s) {
  if (!s) return null;
  if (Buffer.isBuffer(s)) return s;
  if (typeof s === 'string' && /^https?:\/\//.test(s)) {
    const r = await fetch(s);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  }
  return s; // chemin de fichier
}

/**
 * Génère une affiche à partir d'un événement au format CONTRAT de l'app.
 * @param {object} event   cf. contrat (titre, date_debut, categorie, etablissement…)
 * @param {object} [opts]  { template, format, width, height, scale, output:'png'|'svg'|'both',
 *                           image, logo, background, branding }
 * @returns {Promise<{ png?:Buffer, svg?:string, meta:object }>}
 */
export async function generatePoster(event = {}, opts = {}) {
  const d = fromContract(event);

  const fmt = FORMATS[opts.format] || FORMATS[DEFAULT_FORMAT];
  const W = opts.width || fmt.width;
  const H = opts.height || fmt.height;
  const scale = opts.scale || 1;

  const branding = { ...DEFAULT_BRANDING, ...(opts.branding || {}) };
  const footerH = branding.show ? Math.round(H * 0.072) : 0;
  const bodyH = H - footerH;

  // Assets : photo (etablissement ou explicite) / logo / fond (explicite ou par catégorie)
  const sources = {
    photo: await resolveSrc(opts.image || d.establishmentPhoto),
    logo: await resolveSrc(opts.logo),
    bg: await resolveSrc(opts.background || BACKGROUNDS[event.categorie]),
  };

  const name = (opts.template && TEMPLATES[opts.template]) ? opts.template : 'magazine';
  const tpl = TEMPLATES[name];

  const body = await tpl.render({ d, W, H: bodyH, fx, sources });

  let footer = null;
  if (branding.show) {
    const pal = tpl.meta?.palette || {};
    const fp = {
      bg: pal.bg || '#0E0E12',
      text: pal.text || pal.ink || '#FFFFFF',
      muted: pal.muted || 'rgba(255,255,255,0.55)',
      accent: pal.accent || d.accent,
      border: pal.border || 'rgba(255,255,255,0.14)',
    };
    footer = footerBar(fp, W, footerH, W / 100, branding);
  }

  const bgColor = (tpl.meta?.palette?.bg) || '#0E0E12';
  const tree = h('div', { style: { display: 'flex', flexDirection: 'column', width: W, height: H, background: bgColor } }, [body, footer].filter(Boolean));

  const svg = await satori(tree, { width: W, height: H, fonts: FONTS });

  const out = { meta: { template: name, width: W, height: H, scale, accent: d.accent, when: d.when } };
  const want = opts.output || 'png';
  if (want === 'svg' || want === 'both') out.svg = svg;
  if (want === 'png' || want === 'both') {
    out.png = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(W * scale) }, font: { loadSystemFonts: false } }).render().asPng();
  }
  return out;
}

export const availableTemplates = TEMPLATE_NAMES;
