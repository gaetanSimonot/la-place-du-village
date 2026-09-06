'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Sélecteur « publier en tant que ».
 *
 * Ne s'affiche QUE si le user gère au moins une fiche établissement — pour
 * l'immense majorité des habitants, ce composant ne rend rien du tout.
 *
 * Le défaut est toujours le profil personnel (`value = null`) : le blase est
 * un acte volontaire, on ne le repropose pas d'une publication à l'autre.
 *
 * FORME — une ligne, dépliable. Toutes les identités étaient affichées en
 * pastilles côte à côte : au-delà de deux ou trois fiches, elles passaient à
 * la ligne et mangeaient tout l'espace au-dessus du champ de texte, au point
 * qu'on ne voyait plus ce qu'on écrivait. On montre donc uniquement
 * l'identité courante, et la liste ne s'ouvre que si on la demande.
 *
 * La liste se déplie EN FLUX plutôt qu'en survol : ce sélecteur vit dans des
 * formulaires posés en tiroir ou en modale, où un panneau flottant se ferait
 * rogner par le débordement du parent.
 */

export interface IdentiteOption {
  id:     string | null   // null = profil personnel
  nom:    string
  avatar: string | null
}

/** Cache module-level : le sélecteur est monté dans plusieurs formulaires. */
let cache: IdentiteOption[] | null = null
let enVol: Promise<IdentiteOption[]> | null = null

async function chargerIdentites(): Promise<IdentiteOption[]> {
  if (cache) return cache
  if (enVol) return enVol

  enVol = (async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    if (!tk) return [] as IdentiteOption[]

    const res = await fetch('/api/mes-identites', { headers: { Authorization: `Bearer ${tk}` } })
    if (!res.ok) return [] as IdentiteOption[]

    const data = await res.json()
    cache = (data.identites ?? []) as IdentiteOption[]
    return cache
  })()

  try { return await enVol } finally { enVol = null }
}

/** À appeler après une attribution/revendication de fiche. */
export function viderCacheIdentites() { cache = null }

/** Pastille ronde : photo de la fiche, ou initiale à défaut. */
function Vignette({ option, actif = false }: { option: IdentiteOption; actif?: boolean }) {
  if (option.avatar) {
    return <img src={option.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
      actif ? 'bg-white/25 text-white' : 'bg-cremeDeep text-texte-doux'
    }`}>
      {option.nom.charAt(0).toUpperCase()}
    </span>
  )
}

export default function IdentitePicker({
  value,
  onChange,
  label = 'Publier en tant que',
  variante = 'ligne',
}: {
  value:    string | null
  /** `option` permet à l'appelant de refléter le choix (aperçu auteur). */
  onChange: (id: string | null, option: IdentiteOption) => void
  label?:   string
  /**
   * `pastille` : rien qu'un rond d'avatar, à poser DANS une barre de saisie.
   *
   * Le mode `ligne` prend toute la largeur avec son intitulé — juste au-dessus
   * d'un champ de réponse, ça fait un bandeau qui pousse le champ vers le bas
   * pour un réglage qu'on utilise une fois sur vingt. La pastille dit la même
   * chose sans rien prendre : l'avatar montre déjà sous quelle identité on
   * parle, et il se déplie si on le touche.
   */
  variante?: 'ligne' | 'pastille'
}) {
  const [options, setOptions] = useState<IdentiteOption[]>([])
  const [ouvert, setOuvert]   = useState(false)
  const boite = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let vivant = true
    chargerIdentites().then(o => { if (vivant) setOptions(o) })
    return () => { vivant = false }
  }, [])

  // Échap referme, comme partout ailleurs dans l'app.
  useEffect(() => {
    if (!ouvert) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ouvert])

  // Un clic ailleurs referme sans rien choisir.
  useEffect(() => {
    if (!ouvert) return
    const onClic = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', onClic)
    return () => document.removeEventListener('mousedown', onClic)
  }, [ouvert])

  // Une seule identité disponible → rien à choisir, on n'encombre pas l'écran.
  if (options.length < 2) return null

  // Valeur inconnue (fiche retirée entre-temps) → on retombe sur le profil.
  const courante = options.find(o => (o.id ?? null) === value) ?? options[0]

  const choisir = (o: IdentiteOption) => {
    onChange(o.id ?? null, o)
    setOuvert(false)
  }

  const liste = (
    <div
      role="listbox"
      className="max-h-56 overflow-y-auto rounded-2xl border border-bord bg-white p-1 shadow-lg"
    >
      {options.map(o => {
        const actif = (o.id ?? null) === (courante.id ?? null)
        return (
          <button
            key={o.id ?? 'perso'}
            type="button"
            role="option"
            aria-selected={actif}
            onClick={() => choisir(o)}
            className={`flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left text-sm font-semibold transition-colors ${
              actif ? 'bg-primary text-white' : 'text-texte hover:bg-cremeDeep'
            }`}
          >
            <Vignette option={o} actif={actif} />
            <span className="min-w-0 flex-1 truncate">{o.nom}</span>
            {actif && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )

  // Pastille : l'avatar seul, la liste se dépliant AU-DESSUS — ce mode vit au
  // bas de l'écran, dans une barre de saisie, où il n'y a pas de place en
  // dessous.
  if (variante === 'pastille') {
    return (
      <div className="relative shrink-0" ref={boite}>
        <button
          type="button"
          onClick={() => setOuvert(o => !o)}
          aria-expanded={ouvert}
          aria-haspopup="listbox"
          aria-label={`${label} — ${courante.nom}`}
          title={`${label} — ${courante.nom}`}
          className="flex items-center rounded-full border border-bord bg-white p-[3px]"
        >
          <Vignette option={courante} />
        </button>
        {ouvert && (
          <div className="absolute bottom-full left-0 z-40 mb-1.5 w-[220px]">{liste}</div>
        )}
      </div>
    )
  }

  return (
    <div className="mb-4" ref={boite}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-texte-doux mb-2">{label}</p>

      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        aria-expanded={ouvert}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-full border border-bord bg-white py-1.5 pl-1.5 pr-3 text-left text-sm font-semibold text-texte transition-colors hover:border-primary/40"
      >
        <Vignette option={courante} />
        <span className="min-w-0 flex-1 truncate">{courante.nom}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-texte-doux transition-transform ${ouvert ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {ouvert && <div className="mt-1.5">{liste}</div>}
    </div>
  )
}
