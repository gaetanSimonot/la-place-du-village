'use client'
import { useRef, useState, type CSSProperties } from 'react'
import TexteRiche from '@/components/TexteRiche'
import BoutonBaguette from '@/components/BoutonBaguette'

/**
 * Champ de rédaction pour les textes de fiche.
 *
 * L'ancien champ était un <textarea> nu : le propriétaire tapait des
 * astérisques sans savoir ce qu'elles donneraient, et ne découvrait le
 * résultat qu'en publiant. D'où des fiches où les `**` s'affichent en clair.
 *
 * On NE change PAS le format stocké. `TexteRiche` sait déjà rendre `**gras**`,
 * `*italique*`, les titres `##` et les listes `-` ; c'est ce que la fiche
 * affiche et ce que `texteBrut()` sait aplatir pour les vignettes. Cette
 * bibliothèque de balises reste donc la même — on ajoute seulement de quoi
 * l'écrire sans la connaître, et de quoi la voir avant de publier.
 *
 * L'aperçu utilise LE MÊME composant que la fiche publique : il ne peut pas
 * mentir sur le résultat.
 */

type Format = 'gras' | 'italique' | 'titre' | 'liste'

interface Props {
  valeur: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  /** Libellé de l'aperçu. Absent = pas d'aperçu (champ court). */
  labelApercu?: string
  styleChamp?: CSSProperties
}

const BOUTONS: { format: Format; libelle: string; titre: string; style?: CSSProperties }[] = [
  { format: 'gras',     libelle: 'G',  titre: 'Gras',            style: { fontWeight: 900 } },
  { format: 'italique', libelle: 'I',  titre: 'Italique',        style: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
  { format: 'titre',    libelle: 'T',  titre: 'Titre de section' },
  { format: 'liste',    libelle: '•—', titre: 'Liste à puces' },
]

export default function ChampTexteRiche({
  valeur, onChange, placeholder, rows = 6, labelApercu, styleChamp,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [apercuOuvert, setApercuOuvert] = useState(true)
  /**
   * Applique un format à la sélection.
   *
   * `gras` / `italique` encadrent le texte sélectionné. `titre` / `liste`
   * agissent sur des LIGNES entières : on étend donc la sélection au début de
   * la première ligne et à la fin de la dernière, sinon un préfixe atterrirait
   * au milieu d'une phrase.
   *
   * Chaque format est une bascule : re-cliquer sur un texte déjà mis en forme
   * retire la mise en forme, comme dans un traitement de texte.
   */
  const appliquer = (format: Format) => {
    const el = ref.current
    if (!el) return
    const debut = el.selectionStart
    const fin   = el.selectionEnd

    if (format === 'gras' || format === 'italique') {
      const marque = format === 'gras' ? '**' : '*'
      const selection = valeur.slice(debut, fin)
      // Rien de sélectionné : on pose les marques et on place le curseur entre
      // les deux, prêt à écrire.
      if (!selection) {
        const suivant = valeur.slice(0, debut) + marque + marque + valeur.slice(fin)
        onChange(suivant)
        replacer(debut + marque.length, debut + marque.length)
        return
      }
      const avant  = valeur.slice(Math.max(0, debut - marque.length), debut)
      const apres  = valeur.slice(fin, fin + marque.length)
      // Déjà encadré → on retire.
      if (avant === marque && apres === marque) {
        const suivant = valeur.slice(0, debut - marque.length) + selection + valeur.slice(fin + marque.length)
        onChange(suivant)
        replacer(debut - marque.length, fin - marque.length)
        return
      }
      const suivant = valeur.slice(0, debut) + marque + selection + marque + valeur.slice(fin)
      onChange(suivant)
      replacer(debut + marque.length, fin + marque.length)
      return
    }

    // Formats de ligne : on étend aux limites des lignes touchées.
    const debutLigne = valeur.lastIndexOf('\n', debut - 1) + 1
    const finBrute   = valeur.indexOf('\n', fin)
    const finLigne   = finBrute === -1 ? valeur.length : finBrute
    const bloc       = valeur.slice(debutLigne, finLigne)
    const prefixe    = format === 'titre' ? '## ' : '- '

    const toutesPrefixees = bloc.split('\n').every(l => l.trim() === '' || l.startsWith(prefixe))
    const transforme = bloc.split('\n').map(l => {
      if (l.trim() === '') return l
      if (toutesPrefixees) return l.slice(prefixe.length)
      // On retire d'abord l'autre préfixe : une ligne n'est pas à la fois
      // titre et puce.
      const nettoyee = l.replace(/^(#{1,6}\s+|[-•*]\s+)/, '')
      return prefixe + nettoyee
    }).join('\n')

    const suivant = valeur.slice(0, debutLigne) + transforme + valeur.slice(finLigne)
    onChange(suivant)
    replacer(debutLigne, debutLigne + transforme.length)
  }

  /** Rend le focus et la sélection au champ après une modification. */
  const replacer = (debut: number, fin: number) => {
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(debut, fin)
    })
  }

  return (
    <div>
      {/* Barre d'outils */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        {BOUTONS.map(b => (
          <button
            key={b.format}
            type="button"
            onClick={() => appliquer(b.format)}
            title={b.titre}
            aria-label={b.titre}
            style={{
              minWidth: 32, height: 30, padding: '0 8px',
              borderRadius: 8, border: '1px solid #E8E0D5', background: '#fff',
              color: '#4A3728', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...b.style,
            }}
          >
            {b.libelle}
          </button>
        ))}
        {/* Mise en forme automatique — n'ajoute que des marques, jamais un mot. */}
        <BoutonBaguette valeur={valeur} onChange={onChange} onFini={() => setApercuOuvert(true)} />
        {labelApercu && (
          <button
            type="button"
            onClick={() => setApercuOuvert(o => !o)}
            style={{
              marginLeft: 'auto', height: 30, padding: '0 10px',
              borderRadius: 8, border: '1px solid #E8E0D5',
              background: apercuOuvert ? '#F2EDE4' : '#fff',
              color: '#6B5E4E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {apercuOuvert ? 'Masquer l’aperçu' : 'Voir l’aperçu'}
          </button>
        )}
      </div>

      <textarea
        ref={ref}
        value={valeur}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: '100%', background: '#fff', border: '1px solid #E8E0D5',
          borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#2C1810',
          outline: 'none', boxSizing: 'border-box', resize: 'vertical',
          lineHeight: 1.55, ...styleChamp,
        }}
      />

      <p style={{ fontSize: 11, color: '#A89886', margin: '4px 0 0', lineHeight: 1.45 }}>
        Sélectionnez du texte puis cliquez sur un bouton. Une ligne vide sépare
        deux paragraphes.
      </p>

      {labelApercu && apercuOuvert && (
        <div style={{ marginTop: 10, background: '#FAF7F2', border: '1px solid #EFE7DC', borderRadius: 14, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, color: '#A89886', margin: '0 0 8px', lineHeight: 1.45 }}>{labelApercu}</p>
          <div style={{ background: '#fff', border: '1px solid #F0EAE0', borderRadius: 12, padding: '12px 14px', minHeight: 40 }}>
            {valeur.trim()
              ? <TexteRiche texte={valeur} style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.7 }} />
              : <p style={{ fontSize: 12, color: '#C4B8AA', margin: 0, fontStyle: 'italic' }}>Votre texte apparaîtra ici.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
