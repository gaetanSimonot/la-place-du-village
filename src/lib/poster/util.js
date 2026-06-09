// Variante multi-lignes : limite aussi le nombre de lignes estimé (titres longs).
export function fitBlock(text, maxWidth, { max, min, charRatio, maxLines = 3 }) {
  const t = String(text || '');
  const longest = t.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
  const byWord = maxWidth / (charRatio * Math.max(longest.length, 1));
  const byLines = (maxWidth * maxLines) / (charRatio * Math.max(t.length, 1));
  return Math.round(Math.max(min, Math.min(max, byWord, byLines)));
}
