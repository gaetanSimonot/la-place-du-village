'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/swr-fetchers'
import { CATEGORIES } from '@/lib/categories'
import { buildMergedEvent } from '@/lib/mergeEvents'
import { formatEventDate } from '@/lib/filters'
import type { Categorie } from '@/lib/types'
import ClientPortal from '@/components/ClientPortal'

interface PickedEvent {
  id: string
  titre: string
  description: string | null
  heure: string | null
  date_debut: string | null
  categorie: string | null
  categories: string[] | null
  lieux: { nom: string | null; commune: string | null } | null
}

interface Props {
  /** ids des événements sélectionnés, dans l'ordre de sélection. */
  ids: string[]
  onClose: () => void
  /** Appelé après fusion réussie avec les ids absorbés (pour retrait optimiste). */
  onMerged: (absorbedIds: string[]) => void
}

export default function MergeEventsModal({ ids, onClose, onMerged }: Props) {
  const [events, setEvents]     = useState<PickedEvent[]>([])
  const [loading, setLoading]   = useState(true)
  const [principalId, setPrincipalId] = useState<string>(ids[0])
  const [categories, setCategories]   = useState<Categorie[]>([])
  const [description, setDescription] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Charge les fiches complètes
  useEffect(() => {
    supabase
      .from('evenements')
      .select('id, titre, description, heure, date_debut, categorie, categories, lieux(nom, commune)')
      .in('id', ids)
      .then(({ data }) => {
        setEvents((data as unknown as PickedEvent[]) ?? [])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Liste ordonnée : principale d'abord, puis les autres dans l'ordre de sélection
  const ordered = useMemo(() => {
    if (events.length === 0) return []
    const byId = new Map(events.map(e => [e.id, e]))
    const head = byId.get(principalId)
    const rest = ids.filter(id => id !== principalId).map(id => byId.get(id))
    return [head, ...rest].filter((e): e is PickedEvent => Boolean(e))
  }, [events, principalId, ids])

  // (Re)calcule l'aperçu quand la principale change → réinitialise les champs
  // éditables sur la valeur calculée (l'utilisateur édite ensuite librement).
  useEffect(() => {
    if (ordered.length < 2) return
    const built = buildMergedEvent(ordered)
    setCategories(built.categories)
    setDescription(built.description)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principalId, events])

  const principal = ordered[0]
  const toggleCat = (key: Categorie) =>
    setCategories(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])

  const valider = async () => {
    if (ordered.length < 2) return
    setSaving(true); setError(null)
    const orderedIds = ordered.map(e => e.id)
    const r = await authedFetch('/api/admin/evenements/merge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds, categories, description }),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) { setError('Échec de la fusion. Réessaie.'); return }
    onMerged(orderedIds.slice(1))
  }

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[3500] flex items-end justify-center sm:items-center"
        style={{ background: 'rgba(28,18,9,0.55)' }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()}
          className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
          style={{ background: '#FDFAF5' }}>

          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3.5"
            style={{ background: '#FDFAF5', borderBottom: '1px solid #EDE8E0' }}>
            <span className="font-serif text-[17px] text-texte">Fusionner {ids.length} événements</span>
            <button onClick={onClose} className="text-[12px] font-bold text-texte-doux">Annuler</button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#C4622D] border-t-transparent" />
            </div>
          ) : ordered.length < 2 ? (
            <p className="px-4 py-10 text-center text-sm text-texte-doux">Événements introuvables.</p>
          ) : (
            <div className="px-4 pb-4 pt-3 space-y-4">

              {/* Choix de la fiche conservée */}
              <div>
                <p className="m-0 mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
                  Fiche conservée (date, lieu, image)
                </p>
                <div className="space-y-1.5">
                  {ids.map(id => {
                    const e = events.find(ev => ev.id === id)
                    if (!e) return null
                    const active = principalId === id
                    return (
                      <button key={id} onClick={() => setPrincipalId(id)}
                        className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left"
                        style={{ background: '#fff', border: `1.5px solid ${active ? 'var(--primary, #C4622D)' : '#F0EAE0'}` }}>
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                          style={{ border: `2px solid ${active ? 'var(--primary, #C4622D)' : '#C9BCAD'}` }}>
                          {active && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--primary, #C4622D)' }} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-texte">{e.titre}</span>
                          <span className="block text-[11px] text-texte-doux">
                            {e.date_debut ? formatEventDate(e.date_debut, null) : 'Sans date'}
                            {e.heure ? ` · ${e.heure.slice(0, 5)}` : ''}
                            {e.lieux?.commune ? ` · ${e.lieux.commune}` : ''}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Catégories du résultat */}
              <div>
                <p className="m-0 mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
                  Catégories du résultat
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CATEGORIES).map(([key, cat]) => {
                    const active = categories.includes(key as Categorie)
                    return (
                      <button key={key} onClick={() => toggleCat(key as Categorie)}
                        className="rounded-full px-3 py-1.5 text-[12px] font-bold"
                        style={active
                          ? { backgroundColor: cat.color, color: '#fff', border: 'none' }
                          : { backgroundColor: '#fff', color: '#7A6A5A', border: '1px solid #F0EAE0' }}>
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Description / programme fusionné (éditable) */}
              <div>
                <p className="m-0 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
                  Description fusionnée (programme)
                </p>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={8}
                  className="block w-full resize-none rounded-xl bg-white px-3.5 py-2.5 text-[13px] leading-[1.5] text-texte outline-none"
                  style={{ border: '1px solid #F0EAE0' }} />
                <p className="m-0 mt-1.5 text-[11px] text-texte-doux">
                  Les {ordered.length - 1} autre{ordered.length - 1 > 1 ? 's' : ''} fiche{ordered.length - 1 > 1 ? 's' : ''} {ordered.length - 1 > 1 ? 'seront archivées' : 'sera archivée'} (réversible).
                </p>
              </div>

              {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

              {/* CTA */}
              <button onClick={valider} disabled={saving || !principal}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-bold text-white disabled:opacity-55"
                style={{ background: 'var(--vert, #2D5A3D)' }}>
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Fusion en cours…
                  </>
                ) : `Valider la fusion (${ids.length} → 1)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </ClientPortal>
  )
}
