'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import SubscriptionModal from '@/components/SubscriptionModal'
import MicButton, { type MicButtonHandle } from '@/components/MicButton'
import CarteResultat, { type CarteData } from '@/components/assistant/CarteResultat'
import Soleil from '@/components/assistant/Soleil'

/**
 * ASSISTANT VILLAGE — l'écran de conversation.
 *
 * Plein écran, au-dessus de ce qui l'a ouvert. Le texte s'écrit au fil de
 * l'eau et les fiches apparaissent AVANT que la phrase soit finie : le
 * serveur envoie les cartes dès qu'un outil a répondu.
 *
 * Le texte du modèle porte des marqueurs [[type:id]]. On ne les affiche
 * jamais : chacun est remplacé par la vraie fiche reçue à part. Un marqueur
 * dont on n'a pas la fiche est simplement effacé — le modèle ne peut donc
 * pas faire apparaître quelque chose qui n'existe pas. [[q:…]] devient une
 * pastille de rebond : on répond d'un doigt plutôt que de retaper.
 *
 * Géométrie reprise de la maquette : réponse sans bulle, soleil de 26 px à
 * gauche, cartes alignées sous le texte (51 px = 16 + 26 + 9).
 */

interface Message {
  role: 'user' | 'assistant'
  texte: string
  cartes: CarteData[]
  encours?: boolean
}

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

const MARQUEUR = /\[\[(ev|etab|prod|film|promo|annonce|q):([^\]]+)\]\]/g

type Bout =
  | { t: 'texte'; v: string }
  | { t: 'ref'; type: string; id: string }
  | { t: 'q'; v: string }

/** Découpe la réponse en texte, fiches, et pastilles de rebond. */
function segments(texte: string): Bout[] {
  const out: Bout[] = []
  // Un marqueur en cours de frappe ne doit pas clignoter en clair à l'écran.
  const reste = texte.replace(/\[\[[^\]]*$/, '')
  let dernier = 0
  MARQUEUR.lastIndex = 0
  for (let m = MARQUEUR.exec(reste); m; m = MARQUEUR.exec(reste)) {
    if (m.index > dernier) out.push({ t: 'texte', v: reste.slice(dernier, m.index) })
    out.push(m[1] === 'q' ? { t: 'q', v: m[2].trim() } : { t: 'ref', type: m[1], id: m[2].trim() })
    dernier = m.index + m[0].length
  }
  if (dernier < reste.length) out.push({ t: 'texte', v: reste.slice(dernier) })
  return out
}

const AV = 26   // diamètre du soleil devant une réponse
const RETRAIT = 51  // 16 (marge) + 26 (soleil) + 9 (gouttière)

export default function AssistantChat({ question, onClose }: { question: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [saisie, setSaisie] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [quotaEpuise, setQuotaEpuise] = useState<string | null>(null)
  const [offreOuverte, setOffreOuverte] = useState(false)
  const [cherche, setCherche] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  const micRef = useRef<MicButtonHandle>(null)
  const envoiRef = useRef<(q: string) => void>(() => {})

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, cherche])

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
          else if (ev.type === 'texte') { setCherche(false); majDernier(m => ({ ...m, texte: m.texte + String(ev.delta) })) }
          else if (ev.type === 'outil') setCherche(true)
          else if (ev.type === 'cartes') majDernier(m => ({ ...m, cartes: [...m.cartes, ...(ev.items as CarteData[])] }))
          else if (ev.type === 'erreur') majDernier(m => ({ ...m, texte: String(ev.message), encours: false }))
        }
      }
      majDernier(m => ({ ...m, encours: false }))
    } catch {
      majDernier(m => ({ ...m, texte: 'La connexion s’est interrompue. Réessayez.', encours: false }))
    } finally {
      setEnCours(false)
      setCherche(false)
    }
  }, [conversationId, enCours])

  envoiRef.current = envoyer

  // La question posée dans la barre part toute seule, une fois.
  useEffect(() => {
    trackEvent('assistant_ouvert', { depuis: 'barre' })
    if (question.trim()) envoiRef.current(question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[110] flex flex-col font-inter" style={{ background: 'var(--creme)', color: 'var(--texte)' }}>

      {/* En-tête — le soleil, le nom, le territoire, la sortie */}
      <div className="flex flex-none items-center gap-2.5 bg-white px-3.5 pb-3 pt-[max(env(safe-area-inset-top),0.6rem)]"
        style={{ borderBottom: '1px solid #F0EAE0' }}>
        <span style={{ color: 'var(--primary)', flex: 'none' }}><Soleil size={22} /></span>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.01em' }}>Assistant Village</div>
          <div style={{ fontSize: 10.5, color: '#7A6A5A', marginTop: 1 }}>Ganges et alentours</div>
        </div>
        <button onClick={onClose} aria-label="Fermer"
          className="flex flex-none items-center justify-center bg-white"
          style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--bord)', color: '#7A6A5A' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Le fil */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 0 6px' }}>
        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} style={{ margin: '0 16px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{
                maxWidth: '80%', background: 'var(--primary)', color: '#fff',
                borderRadius: '16px 16px 5px 16px', padding: '10px 13px', fontSize: 13.5, lineHeight: 1.45,
              }}>{m.texte}</span>
            </div>
          ) : (
            <Reponse key={i} message={m} onRebond={envoyer}
              onOuvrir={() => trackEvent('assistant_clic', { type: 'fiche' })} />
          )
        ))}

        {cherche && (
          <div style={{ margin: '0 16px 12px', display: 'flex', gap: 9, alignItems: 'center' }}>
            <span className="flex flex-none items-center justify-center"
              style={{ width: AV, height: AV, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <Soleil size={14} rayons={4} />
            </span>
            <span style={{ fontSize: 13, color: '#7A6A5A' }}>Je cherche…</span>
          </div>
        )}

        {quotaEpuise && (
          <div style={{ margin: '4px 16px 14px', border: '1px solid #F0EAE0', background: '#fff', borderRadius: 16, padding: 16 }}>
            <p className="m-0" style={{ fontSize: 14, fontWeight: 800 }}>
              {quotaEpuise === 'jour'
                ? 'Vous avez beaucoup échangé aujourd’hui'
                : 'Vous commencez à bien connaître l’Assistant Village'}
            </p>
            <p className="m-0 mt-1.5" style={{ fontSize: 12.5, lineHeight: 1.45, color: '#5A4C3E' }}>
              {quotaEpuise === 'jour'
                ? 'Il revient demain. Le reste de La Place du Village est toujours là.'
                : 'Avec Habitant, profitez pleinement de l’assistant et des avantages chez les commerçants du secteur.'}
            </p>
            {quotaEpuise !== 'jour' && (
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => { trackEvent('assistant_cta', { vers: 'habitants' }); setOffreOuverte(true) }}
                  className="border-none text-white"
                  style={{ background: 'var(--primary)', borderRadius: 12, padding: '11px 15px', fontSize: 13, fontWeight: 800 }}>
                  Découvrir Habitant
                </button>
                <button onClick={onClose} className="border-none bg-transparent" style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6A5A' }}>
                  Plus tard
                </button>
              </div>
            )}
          </div>
        )}

        {messages.length > 0 && (
          <p className="m-0" style={{ padding: `2px 16px 10px ${RETRAIT}px`, fontSize: 10.5, lineHeight: 1.45, color: '#A99B89' }}>
            Les réponses peuvent être imparfaites : pour un horaire, un prix ou une adresse, la fiche fait foi.
          </p>
        )}
        <div ref={finRef} />
      </div>

      {/* Saisie */}
      <div className="flex flex-none items-center gap-2.5 bg-white"
        style={{ padding: '11px 14px max(env(safe-area-inset-bottom),14px)', borderTop: '1px solid #F0EAE0' }}>
        <div className="flex flex-1 items-center gap-2"
          style={{ border: '1px solid var(--bord)', borderRadius: 999, padding: '8px 14px' }}>
          <input
            value={saisie}
            onChange={e => setSaisie(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); envoyer(saisie) } }}
            placeholder={quotaEpuise ? 'Conversations de découverte épuisées' : 'Continuer la discussion…'}
            disabled={!!quotaEpuise}
            className="flex-1 border-none bg-transparent outline-none"
            style={{ fontSize: 13.5, color: 'var(--texte)' }}
          />
          {/* La dictée passe par le micro déjà utilisé partout dans l'app :
              même enregistrement, même transcription, même quota. */}
          <button type="button" onClick={() => micRef.current?.toggle()}
            aria-label="Dicter" className="flex-none border-none bg-transparent"
            style={{ color: micRef.current?.state === 'recording' ? '#C84B2F' : '#A99B89', lineHeight: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 11v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
          <MicButton ref={micRef} hidden onTranscript={t => { if (t?.trim()) envoyer(t) }} />
        </div>
        <button
          onClick={() => envoyer(saisie)}
          disabled={enCours || !saisie.trim() || !!quotaEpuise}
          aria-label="Envoyer"
          className="flex flex-none items-center justify-center border-none text-white"
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: enCours || !saisie.trim() || quotaEpuise ? '#C9BFB2' : 'var(--primary)',
          }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </button>
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

/** Une réponse : le soleil, le texte, les fiches, puis les rebonds. */
function Reponse({ message, onOuvrir, onRebond }: {
  message: Message; onOuvrir: () => void; onRebond: (q: string) => void
}) {
  const parId = new Map(message.cartes.map(c => [c.id, c]))
  const bouts = segments(message.texte)
  const refs = bouts.filter(b => b.t === 'ref') as { t: 'ref'; type: string; id: string }[]
  const rebonds = (bouts.filter(b => b.t === 'q') as { t: 'q'; v: string }[]).map(b => b.v).slice(0, 3)

  // Filet : le modèle a cherché, trouvé, mais oublié de citer. Plutôt que de
  // laisser la personne devant un texte sans fiche, on pose les premières.
  const oubliees = !message.encours && refs.length === 0 ? message.cartes.slice(0, 3) : []

  /** Le texte et les fiches s'alternent dans l'ordre où le modèle les a mis. */
  const blocs: React.ReactNode[] = []
  let paragraphe: string[] = []
  const viderTexte = (cle: string) => {
    const t = paragraphe.join('').trim()
    paragraphe = []
    if (!t) return
    blocs.push(
      <p key={cle} className="m-0 whitespace-pre-wrap"
        style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 10 }}>{t}</p>,
    )
  }
  bouts.forEach((b, i) => {
    if (b.t === 'texte') { paragraphe.push(b.v); return }
    if (b.t === 'q') return
    viderTexte(`t${i}`)
    const c = parId.get(b.id)
    if (c) blocs.push(<div key={`c${i}`} style={{ marginBottom: 9 }}><CarteResultat carte={c} onOuvrir={onOuvrir} /></div>)
  })
  viderTexte('tfin')

  return (
    <div style={{ margin: '0 16px 12px' }}>
      <div style={{ display: 'flex', gap: 9 }}>
        <span className="flex flex-none items-center justify-center"
          style={{ width: AV, height: AV, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', marginTop: 2 }}>
          <Soleil size={14} rayons={4} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {blocs}
          {oubliees.map(c => (
            <div key={c.id} style={{ marginBottom: 9 }}><CarteResultat carte={c} onOuvrir={onOuvrir} /></div>
          ))}
          {message.encours && !message.texte && (
            <span className="inline-block animate-spin"
              style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #E3D9C8', borderTopColor: 'var(--primary)' }} />
          )}
          {rebonds.length > 0 && !message.encours && (
            <div className="flex flex-wrap" style={{ gap: 7, marginTop: 2 }}>
              {rebonds.map(r => (
                <button key={r} onClick={() => onRebond(r)}
                  className="bg-white"
                  style={{ border: '1px solid var(--bord)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
