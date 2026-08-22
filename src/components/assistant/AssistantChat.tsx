'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import SubscriptionModal from '@/components/SubscriptionModal'
import CarteResultat, { type CarteData } from '@/components/assistant/CarteResultat'

/**
 * ASSISTANT VILLAGE — l'écran de conversation.
 *
 * Plein écran, au-dessus de la recherche. Le texte s'écrit au fil de l'eau
 * et les fiches apparaissent AVANT que la phrase soit finie : le serveur
 * envoie les cartes dès qu'un outil a répondu.
 *
 * Le texte du modèle porte des marqueurs [[type:id]]. On ne les affiche
 * jamais : chacun est remplacé par la vraie fiche reçue à part. Un marqueur
 * dont on n'a pas la fiche est simplement effacé — le modèle ne peut donc
 * pas faire apparaître quelque chose qui n'existe pas.
 */

interface Message {
  role: 'user' | 'assistant'
  texte: string
  cartes: CarteData[]
  /** Le flux est-il encore en train d'écrire ce message ? */
  encours?: boolean
}

const SUGGESTIONS = [
  'Que faire ce week-end ?',
  'Une sortie avec les enfants ?',
  "Qu'est-ce qui passe au cinéma ?",
  'Je cherche un artisan',
  'Où manger ce soir ?',
  'Comment revendiquer ma fiche ?',
]

/** Identifiant de visiteur : sert à compter, et à rien d'autre. */
function anonId(): string {
  try {
    const cle = 'lpv_assistant_anon'
    let v = localStorage.getItem(cle)
    if (!v) {
      v = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)) as string
      localStorage.setItem(cle, v)
    }
    return v
  } catch { return 'anon' }
}

const MARQUEUR = /\[\[(ev|etab|film|promo|annonce):([^\]\s]+)\]\]/g

/** Découpe la réponse en morceaux de texte et en fiches à afficher. */
function segments(texte: string): ({ t: 'texte'; v: string } | { t: 'ref'; type: string; id: string })[] {
  const out: ({ t: 'texte'; v: string } | { t: 'ref'; type: string; id: string })[] = []
  let reste = texte
  // Un marqueur en cours de frappe ne doit pas clignoter en clair à l'écran.
  reste = reste.replace(/\[\[[^\]]*$/, '')
  let dernier = 0
  MARQUEUR.lastIndex = 0
  for (let m = MARQUEUR.exec(reste); m; m = MARQUEUR.exec(reste)) {
    if (m.index > dernier) out.push({ t: 'texte', v: reste.slice(dernier, m.index) })
    out.push({ t: 'ref', type: m[1], id: m[2] })
    dernier = m.index + m[0].length
  }
  if (dernier < reste.length) out.push({ t: 'texte', v: reste.slice(dernier) })
  return out
}

export default function AssistantChat({ question, onClose }: { question: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [saisie, setSaisie] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [quotaEpuise, setQuotaEpuise] = useState<string | null>(null)
  const [offreOuverte, setOffreOuverte] = useState(false)
  const [outilEnCours, setOutilEnCours] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement>(null)
  const envoiRef = useRef<(q: string) => void>(() => {})

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, outilEnCours])

  const envoyer = useCallback(async (texte: string) => {
    const q = texte.trim()
    if (!q || enCours) return
    setSaisie('')
    setEnCours(true)
    setMessages(m => [...m, { role: 'user', texte: q, cartes: [] }, { role: 'assistant', texte: '', cartes: [], encours: true }])

    const majDernier = (f: (m: Message) => Message) =>
      setMessages(list => list.map((m, i) => (i === list.length - 1 ? f(m) : m)))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: q, conversationId, anonId: anonId() }),
      })

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null)
        if (j?.quotaEpuise) {
          setQuotaEpuise(j.raison === 'quota_jour' ? 'jour' : 'decouverte')
          trackEvent('assistant_quota', { raison: String(j.raison ?? 'gratuit') })
          setMessages(list => list.slice(0, -1))
        } else {
          majDernier(m => ({ ...m, texte: j?.error ?? 'L’assistant n’est pas disponible.', encours: false }))
        }
        return
      }

      // Lecture du flux : le texte s'écrit, les fiches se posent au passage.
      const lecteur = res.body.getReader()
      const decodeur = new TextDecoder()
      let tampon = ''
      for (;;) {
        const { done, value } = await lecteur.read()
        if (done) break
        tampon += decodeur.decode(value, { stream: true })
        const lignes = tampon.split('\n\n')
        tampon = lignes.pop() ?? ''
        for (const ligne of lignes) {
          if (!ligne.startsWith('data: ')) continue
          let ev: Record<string, unknown>
          try { ev = JSON.parse(ligne.slice(6)) } catch { continue }

          if (ev.type === 'debut') setConversationId(String(ev.conversationId))
          else if (ev.type === 'texte') { setOutilEnCours(null); majDernier(m => ({ ...m, texte: m.texte + String(ev.delta) })) }
          else if (ev.type === 'outil') setOutilEnCours(String(ev.nom))
          else if (ev.type === 'cartes') majDernier(m => ({ ...m, cartes: [...m.cartes, ...(ev.items as CarteData[])] }))
          else if (ev.type === 'erreur') majDernier(m => ({ ...m, texte: String(ev.message), encours: false }))
        }
      }
      majDernier(m => ({ ...m, encours: false }))
    } catch {
      majDernier(m => ({ ...m, texte: 'La connexion s’est interrompue. Réessayez.', encours: false }))
    } finally {
      setEnCours(false)
      setOutilEnCours(null)
    }
  }, [conversationId, enCours])

  envoiRef.current = envoyer

  // La question tapée dans la barre de recherche part toute seule, une fois.
  useEffect(() => {
    trackEvent('assistant_ouvert', { depuis: 'recherche' })
    if (question.trim()) envoiRef.current(question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-creme font-inter">
      {/* Barre du haut */}
      <div className="flex flex-none items-center gap-2.5 border-b border-bord bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button onClick={onClose} aria-label="Fermer"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-.01em' }}>Assistant Village</div>
          <div style={{ fontSize: 10.5, color: '#7A6A5A' }}>Cherche dans La Place du Village</div>
        </div>
      </div>

      {/* Le fil */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="pt-6">
            <p className="m-0 font-title" style={{ fontSize: 20, lineHeight: 1.3, color: '#1A1209' }}>
              Qu’est-ce que vous cherchez ?
            </p>
            <p className="m-0 mt-1.5" style={{ fontSize: 12.5, color: '#7A6A5A' }}>
              Sorties, cinéma, commerces, bons plans, ou une question sur l’application.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map(x => (
                <button key={x} onClick={() => envoyer(x)}
                  style={{ border: '1px solid #F0EAE0', background: '#fff', borderRadius: 999, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: '#3A2E22' }}>
                  {x}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="mb-4">
            {m.role === 'user' ? (
              <div className="flex justify-end">
                <div style={{ maxWidth: '85%', background: '#2D5A3D', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '9px 13px', fontSize: 13.5, lineHeight: 1.45 }}>
                  {m.texte}
                </div>
              </div>
            ) : (
              <Reponse message={m} onOuvrir={() => trackEvent('assistant_clic', { type: 'fiche' })} />
            )}
          </div>
        ))}

        {outilEnCours && (
          <div className="mb-4 flex items-center gap-2" style={{ fontSize: 12, color: '#7A6A5A' }}>
            <span className="h-3.5 w-3.5 animate-spin rounded-full" style={{ border: '2px solid #E3D9C8', borderTopColor: '#2D5A3D' }} />
            Je cherche…
          </div>
        )}

        {quotaEpuise && (
          <div className="mb-4" style={{ border: '1px solid #F0EAE0', background: '#fff', borderRadius: 16, padding: 16 }}>
            <p className="m-0" style={{ fontSize: 14, fontWeight: 800, color: '#1A1209' }}>
              {quotaEpuise === 'jour'
                ? 'Vous avez beaucoup échangé aujourd’hui'
                : 'Vous commencez à bien connaître l’Assistant Village'}
            </p>
            <p className="m-0 mt-1.5" style={{ fontSize: 12.5, lineHeight: 1.45, color: '#5A4C3E' }}>
              {quotaEpuise === 'jour'
                ? 'L’assistant revient demain. Le reste de La Place du Village est toujours là.'
                : 'Avec Habitant, profitez pleinement de l’assistant et des avantages chez les commerçants du secteur.'}
            </p>
            {quotaEpuise !== 'jour' && (
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => { trackEvent('assistant_cta', { vers: 'habitants' }); setOffreOuverte(true) }}
                  className="border-none text-white"
                  style={{ background: '#2D5A3D', borderRadius: 12, padding: '11px 15px', fontSize: 13, fontWeight: 800 }}>
                  Découvrir Habitant
                </button>
                <button onClick={onClose} className="border-none bg-transparent" style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6A5A' }}>
                  Plus tard
                </button>
              </div>
            )}
          </div>
        )}

        {/* Transparence — courte, toujours accessible, jamais un mur de texte. */}
        {messages.length > 0 && (
          <p className="m-0 pb-2 pt-1" style={{ fontSize: 10.5, lineHeight: 1.45, color: '#A99B89' }}>
            L’assistant cherche dans les informations publiées sur La Place du Village. Ses réponses
            peuvent être imparfaites : pour un horaire ou un prix, la fiche fait foi.
          </p>
        )}
        <div ref={finRef} />
      </div>

      {/* Saisie */}
      <div className="flex-none border-t border-bord bg-white px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <div className="flex items-end gap-2">
          <textarea
            value={saisie}
            onChange={e => setSaisie(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(saisie) } }}
            rows={1}
            placeholder={quotaEpuise ? 'Conversations de découverte épuisées' : 'Votre message…'}
            disabled={!!quotaEpuise}
            className="flex-1 resize-none border border-bord bg-creme text-texte outline-none"
            style={{ borderRadius: 14, padding: '11px 13px', fontSize: 14, maxHeight: 96 }}
          />
          <button
            onClick={() => envoyer(saisie)}
            disabled={enCours || !saisie.trim() || !!quotaEpuise}
            aria-label="Envoyer"
            className="flex h-11 w-11 flex-none items-center justify-center border-none text-white"
            style={{ background: enCours || !saisie.trim() || quotaEpuise ? '#C9BFB2' : '#2D5A3D', borderRadius: 14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>

      {offreOuverte && (
        <SubscriptionModal
          context={{ kind: 'feature', featureLabel: 'Assistant Village', minPlan: 'habitants' }}
          onClose={() => setOffreOuverte(false)}
        />
      )}
    </div>
  )
}

/** Une réponse : le texte, avec les fiches posées là où le modèle les cite. */
function Reponse({ message, onOuvrir }: { message: Message; onOuvrir: () => void }) {
  const parId = new Map(message.cartes.map(c => [c.id, c]))
  const parts = segments(message.texte)
  const citees = new Set(parts.filter(p => p.t === 'ref').map(p => (p as { id: string }).id))

  // Filet : le modèle a cherché, trouvé, mais oublié de citer. Plutôt que de
  // laisser la personne devant un texte sans fiche, on pose les premières.
  const oubliees = !message.encours && citees.size === 0
    ? message.cartes.slice(0, 3)
    : []

  return (
    <div>
      {parts.map((p, i) =>
        p.t === 'texte' ? (
          <p key={i} className="m-0 whitespace-pre-wrap"
            style={{ fontSize: 13.5, lineHeight: 1.55, color: '#2C2116', marginBottom: p.v.trim() ? 8 : 0 }}>
            {p.v.trim()}
          </p>
        ) : parId.has(p.id) ? (
          <CarteResultat key={i} carte={parId.get(p.id)!} onOuvrir={onOuvrir} />
        ) : null,
      )}
      {oubliees.map(c => <CarteResultat key={c.id} carte={c} onOuvrir={onOuvrir} />)}
      {message.encours && !message.texte && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full" style={{ border: '2px solid #E3D9C8', borderTopColor: '#2D5A3D' }} />
      )}
    </div>
  )
}
