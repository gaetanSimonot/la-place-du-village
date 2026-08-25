'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Sélecteur « publier en tant que ».
 *
 * Ne s'affiche QUE si le user gère au moins une fiche établissement — pour
 * l'immense majorité des habitants, ce composant ne rend rien du tout.
 *
 * Le défaut est toujours le profil personnel (`value = null`) : le blase est
 * un acte volontaire, on ne le repropose pas d'une publication à l'autre.
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

export default function IdentitePicker({
  value,
  onChange,
  label = 'Publier en tant que',
}: {
  value:    string | null
  /** `option` permet à l'appelant de refléter le choix (aperçu auteur). */
  onChange: (id: string | null, option: IdentiteOption) => void
  label?:   string
}) {
  const [options, setOptions] = useState<IdentiteOption[]>([])

  useEffect(() => {
    let vivant = true
    chargerIdentites().then(o => { if (vivant) setOptions(o) })
    return () => { vivant = false }
  }, [])

  // Une seule identité disponible → rien à choisir, on n'encombre pas l'écran.
  if (options.length < 2) return null

  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-texte-doux mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const actif = (o.id ?? null) === value
          return (
            <button
              key={o.id ?? 'perso'}
              type="button"
              onClick={() => onChange(o.id ?? null, o)}
              aria-pressed={actif}
              className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition-colors ${
                actif
                  ? 'border-primary bg-primary text-white'
                  : 'border-bord bg-white text-texte hover:border-primary/40'
              }`}
            >
              {o.avatar
                ? <img src={o.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                : <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${actif ? 'bg-white/25 text-white' : 'bg-cremeDeep text-texte-doux'}`}>
                    {o.nom.charAt(0).toUpperCase()}
                  </span>}
              {o.nom}
            </button>
          )
        })}
      </div>
    </div>
  )
}
