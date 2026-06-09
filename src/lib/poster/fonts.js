import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Résolution depuis la racine projet (process.cwd()) : robuste sous Next/Vercel
// où le bundling casse import.meta.url. Les .ttf sont embarqués via
// outputFileTracingIncludes (cf. next.config).
const dir = join(process.cwd(), 'src', 'lib', 'poster', 'fonts');
const f = (name) => readFileSync(join(dir, name));

// Polices chargées une fois. ⚠️ N'utiliser que des polices STATIQUES (Satori gère mal
// les polices variables). Couverture latine complète recommandée (accents FR).
export const FONTS = [
  { name: 'Archivo Black', data: f('ArchivoBlack-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'DM Serif Display', data: f('DMSerifDisplay-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'Anton', data: f('Anton-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'Bebas Neue', data: f('BebasNeue-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'Poppins', data: f('Poppins-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'Poppins', data: f('Poppins-Medium.ttf'), weight: 500, style: 'normal' },
  { name: 'Poppins', data: f('Poppins-SemiBold.ttf'), weight: 600, style: 'normal' },
  { name: 'Poppins', data: f('Poppins-Bold.ttf'), weight: 700, style: 'normal' },
  { name: 'Poppins', data: f('Poppins-ExtraBold.ttf'), weight: 800, style: 'normal' },
  { name: 'Poppins', data: f('Poppins-Black.ttf'), weight: 900, style: 'normal' },
];
