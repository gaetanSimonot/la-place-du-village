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
  const [saisie, setSaisie] = useState('')
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
        if (!annule) setOuvert(!!j?.ouvert)
      } catch { /* la barre reste simplement absente */ }
    })()
    return () => { annule = true }
  }, [])

  if (!ouvert) return null

  const lancer = (q: string) => {
    const t = q.trim()
    if (!t) return
    setSaisie('')
    setParLaVoix(false)
    setQuestion(t)
  }

  /**
   * Le micro n'enregistre PAS ici : il ouvre la conversation, qui prend le
   * relais et écrit dans son propre champ. Parler doit mener au même endroit
   * que taper — un fil qu'on relit, qu'on corrige, et qu'on envoie soi-même.
   */
  const dicter = () => {
    setSaisie('')
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

          <div className="flex items-center gap-2.5"
            style={{ marginTop: 10, border: '1px solid var(--bord)', background: '#fff', borderRadius: 12, padding: '9px 12px' }}>
            <input
              value={saisie}
              onChange={e => setSaisie(e.target.value.slice(0, 500))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lancer(saisie) } }}
              placeholder="Que cherchez-vous aujourd’hui ?"
              className="flex-1 border-none bg-transparent outline-none"
              style={{ fontSize: 13.5, color: 'var(--texte)' }}
            />
            {saisie.trim() ? (
              <button type="button" onClick={() => lancer(saisie)} aria-label="Demander"
                className="flex flex-none items-center justify-center border-none text-white"
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
                </svg>
              </button>
            ) : (
              <>
                {/* La dictée ouvre la conversation avec ce qui a été dit :
                    parler est souvent plus simple que taper une phrase. */}
                <button type="button" onClick={dicter} aria-label="Dicter"
                  className="flex-none border-none bg-transparent"
                  style={{ color: '#A99B89', lineHeight: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 11v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                </button>
              </>
            )}
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
