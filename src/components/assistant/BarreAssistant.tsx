'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { NAV_H } from '@/components/BottomNavBar'
import AssistantChat from '@/components/assistant/AssistantChat'

/**
 * ASSISTANT VILLAGE — la barre, en haut du Village.
 *
 * Un encart vert très pâle qui NOMME la fonction : sans nom affiché,
 * personne ne devine que la recherche sait répondre à une phrase. C'est
 * une carte parmi les autres, pas une bannière.
 *
 * Elle ne s'affiche que si le serveur dit que l'assistant est ouvert à cette
 * personne — pendant le rodage, aux seuls comptes admin. Ce n'est pas une
 * garde (la route refait le calcul), c'est pour ne pas montrer une porte
 * fermée.
 *
 * Géométrie de la maquette (`.aB`) : gradient, bord #DCE8DF, rayon 18.
 */

export default function BarreAssistant() {
  const [ouvert, setOuvert] = useState(false)
  const [question, setQuestion] = useState<string | null>(null)
  /** Ouvert par le micro : la conversation démarre en écoutant. */
  const [parLaVoix, setParLaVoix] = useState(false)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/assistant', {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const j = await r.json().catch(() => null)
        if (annule) return
        setOuvert(!!j?.ouvert)

        // On revient d'une fiche ouverte depuis la conversation : on la
        // rouvre là où elle était, sinon explorer une proposition revient à
        // perdre le fil, et on cesse de cliquer.
        try {
          if (sessionStorage.getItem('lpv_assistant_ouvert') === '1' && j?.ouvert) {
            setParLaVoix(false)
            setQuestion('')
          }
        } catch { /* noop */ }
      } catch { /* la barre reste simplement absente */ }
    })()
    return () => { annule = true }
  }, [])

  if (!ouvert) return null

  /*
   * Le micro et les suggestions du jour vivaient dans l'encart. Ils partent
   * avec lui : ils existent déjà DANS la conversation, et les garder ici
   * aurait fait deux entrées pour la même chose.
   */

  return (
    <>
      {/*
        Bouton flottant, posé au-dessus de la barre du bas.
        `NAV_H` est importé et non retapé : la barre change de hauteur un jour,
        le bouton suit. `env(safe-area-inset-bottom)` remonte le bouton
        au-dessus de la barre gestuelle des téléphones à encoche.
      */}
      <button
        type="button"
        onClick={() => { setParLaVoix(false); setQuestion('') }}
        aria-label="Assistant Village"
        className="pcv-assistFab"
        style={{
          position: 'fixed', right: 14, zIndex: 60,
          bottom: `calc(${NAV_H}px + 14px + env(safe-area-inset-bottom, 0px))`,
          border: 0, padding: 0, background: 'none', lineHeight: 0, cursor: 'pointer',
          filter: 'drop-shadow(0 8px 22px rgba(26,18,9,.32))',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assistant-fab.png" alt="" width={72} height={72} style={{ width: 72, height: 72, display: 'block' }} />
      </button>

      {question !== null && (
        <AssistantChat question={question} dicter={parLaVoix} onClose={() => setQuestion(null)} />
      )}
    </>
  )
}
