'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AssistantChat from '@/components/assistant/AssistantChat'
import Soleil from '@/components/assistant/Soleil'

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

/**
 * Les suggestions suivent le jour, sans aucun appel réseau.
 *
 * Le handoff voudrait « Cinéma ce soir » seulement s'il y a des séances
 * aujourd'hui ; le vérifier coûterait une requête à chaque ouverture du
 * Village, pour une pastille. On approxime par les jours où l'on va au
 * cinéma. À raffiner le jour où le Village connaîtra déjà la programmation.
 */
function suggestions(): string[] {
  // Composant client : le fuseau du navigateur est celui de la personne.
  const jour = new Date().getDay()   // 0 = dimanche
  const out: string[] = []
  if (jour >= 4 || jour === 0) out.push('Que faire ce week-end ?')
  if (jour === 3) out.push('Avec les enfants')
  if (jour >= 5 || jour === 0) out.push('Cinéma ce soir')
  out.push('Trouver un artisan')
  if (out.length < 3) out.push('Où manger ce soir ?')
  return out.slice(0, 4)
}

export default function BarreAssistant() {
  const [ouvert, setOuvert] = useState(false)
  const [question, setQuestion] = useState<string | null>(null)
  /** Ouvert par le micro : la conversation démarre en écoutant. */
  const [parLaVoix, setParLaVoix] = useState(false)
  const [sugs] = useState(suggestions)

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

  const lancer = (q: string) => {
    const t = q.trim()
    if (!t) return
    setParLaVoix(false)
    setQuestion(t)
  }

  /**
   * Le micro n'enregistre PAS ici : il ouvre la conversation, qui prend le
   * relais et enregistre dans son propre champ. Parler doit mener au même
   * endroit que taper — un fil qu'on relit, qu'on corrige, et qu'on envoie
   * soi-même.
   */
  const dicter = () => {
    setParLaVoix(true)
    setQuestion('')
  }

  return (
    <>
      <div style={{ padding: '14px 0 0' }}>
        <div style={{
          margin: '0 16px', border: '1px solid #DCE8DF', borderRadius: 18, padding: 13,
          background: 'linear-gradient(180deg,#F4F9F5,#fff)',
          boxShadow: '0 2px 10px rgba(44,28,16,.05)',
        }}>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--primary)', flex: 'none', lineHeight: 0 }}><Soleil size={18} /></span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--primary)' }}>
              Assistant Village
            </span>
          </div>

          {/* Toucher le champ ouvre la conversation : on y écrit, on y dicte,
              et on y garde le fil. Un champ qui reste ici obligerait à taper
              deux fois — une dans la barre, une dans le chat. */}
          <div className="flex items-center gap-2.5"
            style={{ marginTop: 10, border: '1px solid var(--bord)', background: '#fff', borderRadius: 12, padding: '11px 12px' }}>
            <button type="button" onClick={() => { setParLaVoix(false); setQuestion('') }}
              className="flex-1 border-none bg-transparent p-0 text-left"
              style={{ fontSize: 13.5, color: '#7A6A5A' }}>
              Que cherchez-vous aujourd’hui&nbsp;?
            </button>
            <button type="button" onClick={dicter} aria-label="Dicter"
              className="flex-none border-none bg-transparent"
              style={{ color: '#A99B89', lineHeight: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 11v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto" style={{ marginTop: 9, scrollbarWidth: 'none' }}>
            {sugs.map(x => (
              <button key={x} onClick={() => lancer(x)}
                className="flex-none whitespace-nowrap bg-white"
                style={{ border: '1px solid var(--bord)', borderRadius: 999, padding: '6px 11px', fontSize: 11.5, fontWeight: 700, color: '#7A6A5A' }}>
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>

      {question !== null && (
        <AssistantChat question={question} dicter={parLaVoix} onClose={() => setQuestion(null)} />
      )}
    </>
  )
}
