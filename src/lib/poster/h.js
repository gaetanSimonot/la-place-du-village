// Petit "hyperscript" pour écrire des arbres d'éléments lisibles pour Satori.
// Satori attend des objets de la forme { type, props: { style, children, ... } }
// — proches d'éléments React, mais sans JSX (donc utilisable en Node pur).

export function h(type, props = {}, ...children) {
  const flat = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return {
    type,
    props: {
      ...props,
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}

// Raccourcis fréquents
export const Box = (style, ...children) => h('div', { style }, ...children);
export const Text = (style, value) => h('div', { style }, value);
export const Img = (src, style) => h('img', { src, style });
