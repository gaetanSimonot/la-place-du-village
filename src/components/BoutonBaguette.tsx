'use client'
import { useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * LA BAGUETTE — mettre en forme un texte sans en changer un mot.
 *
 * Le serveur ne rend le texte retouché que s'il a vérifié que les lettres sont
 * exactement les mêmes ; sinon il rend l'original. Le bouton ne peut donc pas
 * publier des phrases qui ne sont pas celles de l'auteur — au pire il n'a rien
 * fait, et on l'écrit à côté.
 *
 * Un seul composant pour tous les endroits où l'on rédige : le champ des
 * fiches, le composeur de publications, celui des débats. La logique d'appel,
 * le quota et les messages ne peuvent pas diverger d'un écran à l'autre.
 */
export default function BoutonBaguette({
  valeur, onChange, onFini, style,
}: {
  valeur: string
  onChange: (v: string) => void
  /** Appelé après une mise en forme réussie (ouvrir l'aperçu, par exemple). */
  onFini?: () => void
  style?: CSSProperties
}) {
  const [enCours, setEnCours] = useState(false)
  const [mot, setMot]         = useState<string | null>(null)

  const lancer = async () => {
    if (!valeur.trim() || enCours) return
    setEnCours(true); setMot(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/mise-en-forme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ texte: valeur }),
      })
      const j = await r.json().catch(() => null)
      // 429 : le quota du jour. Le message du serveur dit lequel et ce qu'il
      // faut faire — on le reprend tel quel plutôt que d'en inventer un.
      if (r.status === 429) { setMot(j?.error ?? 'Quota atteint'); return }
      if (!r.ok || !j?.texte) { setMot('Indisponible'); return }
      if (j.inchange)         { setMot('Rien à changer'); return }
      onChange(j.texte)
      onFini?.()
    } catch {
      setMot('Indisponible')
    } finally {
      setEnCours(false)
      setTimeout(() => setMot(null), 4000)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={lancer}
        disabled={enCours || !valeur.trim()}
        title="Mettre en forme sans changer les mots"
        aria-label="Mettre en forme sans changer les mots"
        style={{
          minWidth: 32, height: 30, padding: '0 9px',
          borderRadius: 8, border: '1px solid #DCE8DF', background: '#F4FAF5',
          color: '#2D5A3D', fontSize: 13,
          cursor: enCours || !valeur.trim() ? 'default' : 'pointer',
          opacity: !valeur.trim() ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...style,
        }}
      >
        {enCours ? '…' : '✨'}
      </button>
      {mot && (
        <span style={{ fontSize: 10.5, color: '#8A7A6A', alignSelf: 'center', lineHeight: 1.3 }}>{mot}</span>
      )}
    </>
  )
}
