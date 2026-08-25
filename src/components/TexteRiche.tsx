import type { CSSProperties, ReactNode } from 'react'

/**
 * Rendu d'un texte saisi à la main (descriptions de fiches, etc.).
 *
 * Les pros collent souvent du texte mis en forme ailleurs : titres `##`,
 * `**gras**`, listes à puces, paragraphes séparés par une ligne vide. Rendu
 * dans un simple <p>, tout ça s'affiche en pavé avec les astérisques visibles.
 *
 * Volontairement SANS dangerouslySetInnerHTML ni dépendance markdown : on
 * construit des éléments React, donc aucun HTML saisi ne peut s'exécuter.
 * Ce qui n'est pas reconnu reste affiché tel quel — jamais avalé.
 */

/** `**gras**` et `*italique*` → <strong> / <em>. Le reste est du texte. */
function inline(texte: string, cle: string): ReactNode[] {
  const morceaux: ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g
  let curseur = 0
  let m: RegExpExecArray | null
  let i = 0

  while ((m = regex.exec(texte)) !== null) {
    if (m.index > curseur) morceaux.push(texte.slice(curseur, m.index))
    if (m[1] !== undefined) morceaux.push(<strong key={`${cle}-g${i}`}>{m[1]}</strong>)
    else                    morceaux.push(<em key={`${cle}-i${i}`}>{m[2]}</em>)
    curseur = m.index + m[0].length
    i++
  }
  if (curseur < texte.length) morceaux.push(texte.slice(curseur))
  return morceaux
}

/** Lignes d'un même paragraphe : le retour à la ligne est conservé. */
function lignes(bloc: string, cle: string): ReactNode[] {
  return bloc.split('\n').flatMap((l, i) => i === 0
    ? inline(l, `${cle}-l${i}`)
    : [<br key={`${cle}-br${i}`} />, ...inline(l, `${cle}-l${i}`)])
}

export default function TexteRiche({
  texte,
  style,
  couleurTitre = '#3C2C20',
}: {
  texte: string
  style?: CSSProperties
  couleurTitre?: string
}) {
  const blocs = texte
    .replace(/\r\n/g, '\n')
    // Un copier-coller depuis un traitement de texte arrive parfois aplati sur
    // une seule ligne : on rouvre un bloc devant chaque titre resté au milieu.
    .replace(/(\S)[ \t]+(#{1,6}[ \t])/g, '$1\n\n$2')
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)
  if (!blocs.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {blocs.map((bloc, b) => {
        const cle = `b${b}`

        // Cas du collage aplati : « ## **Intitulé** suite du texte… ». Le gras
        // délimite le titre sans ambiguïté, on récupère le reste en paragraphe.
        const colle = bloc.match(/^#{1,6}[ \t]+\*\*([^*\n]+)\*\*[ \t]*(\S[\s\S]*)$/)
        if (colle) {
          return (
            <div key={cle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ margin: b === 0 ? 0 : '4px 0 0', fontSize: 15, fontWeight: 800, color: couleurTitre, lineHeight: 1.35 }}>
                {colle[1]}
              </p>
              <p style={{ margin: 0 }}>{lignes(colle[2], `${cle}-r`)}</p>
            </div>
          )
        }

        // Titre : ## Intitulé. Un « titre » très long est en réalité un
        // paragraphe mal collé — on le laisse en paragraphe.
        const candidat = bloc.includes('\n') ? null : bloc.match(/^(#{1,6})\s+(.+)$/)
        const titre = candidat && candidat[2].length <= 120 ? candidat : null
        if (titre) {
          return (
            <p key={cle} style={{
              margin: b === 0 ? 0 : '4px 0 0',
              fontSize: titre[1].length <= 2 ? 15 : 14,
              fontWeight: 800,
              color: couleurTitre,
              lineHeight: 1.35,
            }}>
              {inline(titre[2], cle)}
            </p>
          )
        }

        // Liste : lignes commençant par -, • ou *
        const items = bloc.split('\n')
        if (items.length > 1 && items.every(l => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={cle} style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map((l, i) => (
                <li key={`${cle}-${i}`}>{inline(l.replace(/^\s*[-•*]\s+/, ''), `${cle}-${i}`)}</li>
              ))}
            </ul>
          )
        }

        // Paragraphe : on retire les # d'un titre trop long resté en tête.
        return <p key={cle} style={{ margin: 0 }}>{lignes(bloc.replace(/^#{1,6}\s+/, ''), cle)}</p>
      })}
    </div>
  )
}
