'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { signalerFavori } from '@/hooks/useFavori'
import type { CarteData } from '@/components/assistant/CarteResultat'

/**
 * ASSISTANT VILLAGE — le bouton qui fait passer à l'acte.
 *
 * L'assistant PROPOSE, il n'écrit jamais tout seul. Ce bouton ouvre le module
 * concerné de l'application — la publication d'un événement, le dépôt d'une
 * annonce, l'inscription d'un commerce — avec ses propres règles, ses champs
 * obligatoires et sa relecture. Rien n'est publié dans son dos.
 *
 * Deux exceptions qui n'en sont pas : garder des fiches en favori et partager
 * une réponse ne créent aucun contenu public et se défont d'un geste. Elles
 * s'exécutent donc ici, au clic, et jamais avant.
 */

export interface ActionProposee {
  type: 'evenement' | 'annonce' | 'etablissement' | 'favoris' | 'partage'
  libelle: string
  texte?: string
  ids?: string[]
}

/** Le tiroir des favoris n'est pas le même selon la nature de la fiche. */
const API_FAVORI: Record<string, string | undefined> = {
  ev: 'evenements', etab: 'etablissements', prod: 'producers',
  annonce: 'annonces', promo: 'promotions', film: undefined,
}

export default function CarteAction({ action, cartes, texte }: {
  action: ActionProposee
  /** Les fiches du message : c'est là qu'on retrouve la nature d'un id. */
  cartes: CarteData[]
  /** La réponse elle-même, pour le partage. */
  texte: string
}) {
  const router = useRouter()
  const [etat, setEtat] = useState<'pret' | 'encours' | 'fait'>('pret')
  const [message, setMessage] = useState<string | null>(null)

  async function agir() {
    if (etat !== 'pret') return
    trackEvent('assistant_action', { type: action.type })

    if (action.type === 'evenement') {
      // On ne remplit pas le formulaire à sa place : on lui pose la phrase
      // dans le champ d'analyse, elle relit, elle lance. Le parcours de
      // publication reste exactement celui qu'elle connaît.
      try { sessionStorage.setItem('lpv_assistant_event', action.texte ?? '') } catch { /* noop */ }
      router.push('/ajouter?assistant=1')
      return
    }
    if (action.type === 'annonce')        { router.push('/annonces/nouvelle'); return }
    if (action.type === 'etablissement')  { router.push('/?commerce=1'); return }

    if (action.type === 'partage') {
      const t = `${texte}\n\n— Assistant Village, La Place du Village`
      try {
        if (navigator.share) await navigator.share({ text: t })
        else { await navigator.clipboard.writeText(t); setMessage('Copié.') }
        setEtat('fait')
      } catch { /* partage annulé, rien à dire */ }
      return
    }

    // ── Favoris ────────────────────────────────────────────────────────
    setEtat('encours')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMessage('Créez un compte pour garder vos favoris.')
        setEtat('pret')
        return
      }
      const parId = new Map(cartes.map(c => [c.id, c.type]))
      let gardes = 0
      for (const id of (action.ids ?? []).slice(0, 5)) {
        const api = API_FAVORI[parId.get(id) ?? '']
        if (!api) continue
        const r = await fetch(`/api/${api}/${id}/favorite`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const j = await r.json().catch(() => null)
        // Le point d'entrée bascule : si c'était déjà gardé, on le remet.
        if (r.ok && j?.favorited === false) {
          await fetch(`/api/${api}/${id}/favorite`, {
            method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
          })
        }
        if (r.ok) { gardes++; signalerFavori(parId.get(id) ?? '', id, true) }
      }
      setMessage(gardes ? `Gardé dans vos favoris (${gardes}).` : 'Rien n’a pu être gardé.')
      setEtat(gardes ? 'fait' : 'pret')
    } catch {
      setMessage('Impossible pour le moment.')
      setEtat('pret')
    }
  }

  return (
    <div style={{ marginTop: 2, marginBottom: 8 }}>
      <button onClick={agir} disabled={etat !== 'pret'}
        className="flex items-center gap-2 bg-white"
        style={{
          border: '1px solid #C8DEC0', background: etat === 'fait' ? '#F4FAF5' : '#fff',
          borderRadius: 12, padding: '10px 13px', fontSize: 12.5, fontWeight: 800,
          color: 'var(--primary)', opacity: etat === 'encours' ? 0.6 : 1,
        }}>
        {etat === 'fait' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
        {etat === 'encours' ? 'Un instant…' : action.libelle}
      </button>
      {message && (
        <p className="m-0" style={{ fontSize: 11, color: '#7A6A5A', marginTop: 5 }}>{message}</p>
      )}
    </div>
  )
}
