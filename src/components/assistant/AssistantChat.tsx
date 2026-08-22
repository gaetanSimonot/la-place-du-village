'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useDicteeLive } from '@/hooks/useDicteeLive'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import SubscriptionModal from '@/components/SubscriptionModal'
import MicButton, { type MicButtonHandle } from '@/components/MicButton'
import CarteResultat, { type CarteData } from '@/components/assistant/CarteResultat'
import ApercuFiche from '@/components/assistant/ApercuFiche'
import CarteAction, { type ActionProposee } from '@/components/assistant/CarteAction'
import Soleil from '@/components/assistant/Soleil'
import ClientPortal from '@/components/ClientPortal'
import {
  derniereConversation, lireConversations, enregistrerConversation, oublierConversation,
  type ConversationLocale,
} from '@/lib/assistantLocal'

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
  /** Le bouton proposé par l'assistant à la fin de ce tour, s'il y en a un. */
  action?: ActionProposee | null
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

/** « il y a 3 min », sans bibliothèque : trois cas suffisent ici. */
function ilYA(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - (at ?? 0)) / 60_000))
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`
}

/** Le texte sans les marqueurs : ce qu'on copie, c'est ce qu'on lit. */
const propre = (t: string) => t.replace(MARQUEUR, '').replace(/\n{3,}/g, '\n\n').trim()

async function copier(texte: string) {
  try { await navigator.clipboard.writeText(texte) } catch { /* refusé : rien à dire */ }
}

async function partager(texte: string) {
  const t = `${texte}\n\n— Assistant Village, La Place du Village`
  try {
    if (navigator.share) { await navigator.share({ text: t }); return }
    await navigator.clipboard.writeText(t)
  } catch { /* partage annulé */ }
}

const AV = 26   // diamètre du soleil devant une réponse
const RETRAIT = 51  // 16 (marge) + 26 (soleil) + 9 (gouttière)

export default function AssistantChat({ question, dicter, onClose }: {
  question: string
  /** Ouvrir en écoutant : le micro de la barre a été touché, pas le champ. */
  dicter?: boolean
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [saisie, setSaisie] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  /**
   * L'identifiant en REF, pas seulement en state : la première question part
   * dans l'effet de montage, avant que React n'ait propagé le state, et sans
   * ça elle ouvrirait une conversation neuve à côté de celle qu'on reprend.
   */
  const convRef = useRef<string | null>(null)
  const [listeOuverte, setListeOuverte] = useState(false)
  /** La fiche regardée de près, sans quitter le fil. */
  const [apercu, setApercu] = useState<CarteData | null>(null)
  const [conversations, setConversations] = useState<ConversationLocale[]>([])
  const [quotaEpuise, setQuotaEpuise] = useState<string | null>(null)
  const [offreOuverte, setOffreOuverte] = useState(false)
  const [cherche, setCherche] = useState<string | null>(null)
  /** État du micro — c'est lui qui fait battre le bouton en rouge. */
  const [micEtat, setMicEtat] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const finRef = useRef<HTMLDivElement>(null)
  const micRef = useRef<MicButtonHandle>(null)
  const champRef = useRef<HTMLTextAreaElement>(null)
  /** Une transcription Whisper annulée ne doit pas atterrir dans le champ. */
  const jeterRef = useRef(false)
  const dictee = useDicteeLive({ onTexte: t => setSaisie(t.slice(0, 500)) })
  const dicteeRef = useRef(dictee)
  dicteeRef.current = dictee
  /** Le volet des conversations : on le referme en glissant, pas d'un coup. */
  const [voletSort, setVoletSort] = useState(false)
  const fermerRef = useRef<() => void>(() => {})
  /** A-t-on posé une entrée d'historique en s'ouvrant ? */
  const parHistorique = useRef(false)
  const envoiRef = useRef<(q: string) => void>(() => {})

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, cherche])

  /**
   * Le bouton retour du téléphone referme l'assistant et rend le Village.
   *
   * Sans cette entrée d'historique, un retour quittait carrément la page —
   * geste le plus naturel du monde sur Android, et le plus brutal ici.
   */
  useEffect(() => {
    try {
      window.history.pushState({ lpvAssistant: 1 }, '')
      parHistorique.current = true
    } catch { /* historique indisponible : le bouton croix reste */ }
    const onPop = () => { parHistorique.current = false; fermerRef.current() }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /**
   * Le champ grandit avec ce qu'on dit, et reste collé au dernier mot.
   *
   * Une dictée d'une phrase entière défilait hors du champ : on parlait sans
   * voir ce qui s'écrivait. Il monte jusqu'à cinq lignes, puis défile.
   */
  useEffect(() => {
    const el = champRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 118)}px`
    el.scrollTop = el.scrollHeight
  }, [saisie])

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
        body: JSON.stringify({ message: q, conversationId: convRef.current, anonId: anonId() }),
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

          if (ev.type === 'debut') { convRef.current = String(ev.conversationId); setConversationId(String(ev.conversationId)) }
          else if (ev.type === 'texte') { setCherche(null); majDernier(m => ({ ...m, texte: m.texte + String(ev.delta) })) }
          else if (ev.type === 'outil') {
            setCherche(ev.nom === 'web_search' ? 'web'
              : typeof ev.mots === 'string' && ev.mots ? ev.mots : '')
          }
          else if (ev.type === 'cartes') majDernier(m => ({ ...m, cartes: [...m.cartes, ...(ev.items as CarteData[])] }))
          else if (ev.type === 'action') majDernier(m => ({ ...m, action: ev.action as ActionProposee }))
          else if (ev.type === 'erreur') majDernier(m => ({ ...m, texte: String(ev.message), encours: false }))
        }
      }
      majDernier(m => ({ ...m, encours: false }))
    } catch {
      majDernier(m => ({ ...m, texte: 'La connexion s’est interrompue. Réessayez.', encours: false }))
    } finally {
      setEnCours(false)
      setCherche(null)
    }
  }, [enCours])

  envoiRef.current = envoyer

  /**
   * On rouvre là où on s'était arrêté.
   *
   * Cliquer sur une fiche proposée quitte vraiment l'écran : sans reprise, on
   * revenait devant une conversation vide, ce qui décourage d'explorer ce
   * qu'on nous propose. Au-delà d'une demi-heure on repart à neuf — c'est la
   * même limite que le serveur retient pour dire qu'un sujet est clos.
   */
  useEffect(() => {
    trackEvent('assistant_ouvert', { depuis: dicter ? 'micro' : 'barre' })
    setConversations(lireConversations())

    const passe = derniereConversation()
    const fraiche = passe && Date.now() - (passe.at ?? 0) < 30 * 60_000 && passe.messages.length
    if (fraiche && passe) {
      convRef.current = passe.id
      setConversationId(passe.id)
      setMessages(passe.messages as Message[])
    }

    if (question.trim()) envoiRef.current(question)
    // Entré par le micro de la barre : on ouvre l'oreille du même côté que le
    // bouton du champ, sinon on lançait Whisper ici et la reconnaissance en
    // direct là — deux transcriptions du même moment.
    else if (dicter) {
      setTimeout(() => {
        if (dicteeRef.current.supporte) dicteeRef.current.demarrer('')
        else micRef.current?.start()
      }, 250)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Chaque tour terminé est gardé sur l'appareil — jamais en cours d'écriture. */
  useEffect(() => {
    if (!messages.length || messages.some(m => m.encours)) return
    enregistrerConversation({
      id: convRef.current,
      titre: messages.find(m => m.role === 'user')?.texte.slice(0, 60) ?? '',
      at: Date.now(),
      messages: messages.map(m => ({ role: m.role, texte: m.texte, cartes: m.cartes, action: m.action ?? null })),
    })
    setConversations(lireConversations())
  }, [messages])

  /**
   * Une seule sortie, quel qu'en soit le geste : la croix comme le bouton
   * retour. On consomme l'entrée d'historique qu'on avait posée, sinon elle
   * resterait derrière nous et le retour suivant ne ferait rien.
   */
  const fermer = useCallback(() => {
    try { sessionStorage.removeItem('lpv_assistant_ouvert') } catch { /* noop */ }
    if (parHistorique.current) { parHistorique.current = false; window.history.back(); return }
    onClose()
  }, [onClose])
  fermerRef.current = () => {
    try { sessionStorage.removeItem('lpv_assistant_ouvert') } catch { /* noop */ }
    onClose()
  }

  /** Referme le volet en le laissant glisser, puis le démonte. */
  const replierVolet = useCallback(() => {
    setVoletSort(true)
    setTimeout(() => { setListeOuverte(false); setVoletSort(false) }, 220)
  }, [])

  /** On écoute — en direct si le navigateur sait, sinon Whisper enregistre. */
  const ecoute = dictee.actif || micEtat === 'recording'

  const lancerDictee = () => {
    // Jamais les deux à la fois : la reconnaissance du navigateur écrit en
    // direct pendant que Whisper rendrait le même texte à la fin. C'était la
    // seconde façon de tout voir s'écrire en double.
    if (ecoute) return
    if (dictee.supporte) { dictee.demarrer(saisie); return }
    micRef.current?.start()
  }
  const annulerDictee = () => {
    if (dictee.actif) { dictee.annuler(); return }
    // Whisper n'a pas d'annulation : on arrête, et on jette ce qui revient.
    jeterRef.current = true
    micRef.current?.stop()
  }
  /**
   * Le bouton vert fait les deux : il coupe la dictée en cours ET envoie.
   * On ne devrait jamais avoir à appuyer deux fois pour dire une phrase.
   */
  const envoyerMaintenant = () => {
    if (dictee.actif) dictee.arreter()
    else if (micEtat === 'recording') { micRef.current?.stop(); return }
    envoyer(saisie)
  }

  /** Repartir de zéro, ou rouvrir l'une des trois gardées. */
  const ouvrirConversation = (c: ConversationLocale | null) => {
    setSaisie('')
    convRef.current = c?.id ?? null
    setConversationId(c?.id ?? null)
    setMessages((c?.messages ?? []) as Message[])
    // On sélectionne d'abord, on referme ensuite : le volet glisse pendant que
    // la conversation choisie s'affiche derrière, et on voit ce qu'on a fait.
    replierVolet()
  }

  /** Effacer une conversation de cet appareil. Elle n'existe que là. */
  const supprimerConversation = (c: ConversationLocale) => {
    oublierConversation(c.id)
    setConversations(lireConversations())
    if ((c.id ?? null) === convRef.current) {
      convRef.current = null
      setConversationId(null)
      setMessages([])
    }
  }

  return (
    // La conversation est ouverte depuis le Village, qui vit dans un conteneur
    // à z-index propre : sans portail, ce plein écran y reste enfermé et sa
    // zone de saisie passe SOUS la barre du bas. Piège déjà rencontré sur ce
    // projet — toute modale plein écran sort par document.body.
    <ClientPortal>
    <div className="fixed inset-0 z-[110] flex flex-col font-inter" style={{ background: 'var(--creme)', color: 'var(--texte)' }}>

      {/* En-tête — le soleil, le nom, le territoire, la sortie */}
      <div className="flex flex-none items-center gap-2.5 bg-white px-3.5 pb-3 pt-[max(env(safe-area-inset-top),0.6rem)]"
        style={{ borderBottom: '1px solid #F0EAE0' }}>
        {/* Le volet s'ouvre depuis la gauche : son bouton se tient donc du
            même côté, là où la main le cherche. */}
        <button onClick={() => (listeOuverte ? replierVolet() : setListeOuverte(true))}
          aria-label="Mes conversations"
          className="flex flex-none items-center justify-center bg-white"
          style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--bord)', color: '#7A6A5A' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
          </svg>
        </button>
        <span style={{ color: 'var(--primary)', flex: 'none' }}><Soleil size={22} /></span>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.01em' }}>Assistant Village</div>
          <div style={{ fontSize: 10.5, color: '#7A6A5A', marginTop: 1 }}>Ganges et alentours</div>
        </div>
        <button onClick={fermer} aria-label="Fermer"
          className="flex flex-none items-center justify-center bg-white"
          style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--bord)', color: '#7A6A5A' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Les conversations, dans un volet à gauche. Trois suffisent : au-delà,
          une liste devient une archive dont on ne fait rien. */}
      {listeOuverte && (
        <>
          <div onClick={replierVolet}
            style={{
              position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(26,18,9,.35)',
              opacity: voletSort ? 0 : 1, transition: 'opacity .2s ease',
            }} />
          <div style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(84vw, 300px)', zIndex: 2,
            background: '#fff', borderRight: '1px solid #F0EAE0', display: 'flex', flexDirection: 'column',
            paddingTop: 'max(env(safe-area-inset-top),14px)',
            // On le laisse glisser : choisir une conversation ne doit pas faire
            // disparaître le volet d'un coup sec, on veut voir ce qu'on a fait.
            transform: voletSort ? 'translateX(-102%)' : 'translateX(0)',
            transition: 'transform .22s cubic-bezier(.4,0,.2,1)',
          }}>
            <div className="flex items-center gap-2" style={{ padding: '4px 14px 10px' }}>
              <span style={{ color: 'var(--primary)', lineHeight: 0 }}><Soleil size={16} /></span>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--primary)' }}>
                Mes conversations
              </span>
            </div>

            {/* En premier, en haut : c'est le geste le plus fréquent. */}
            <div style={{ padding: '0 12px 10px' }}>
              <button onClick={() => ouvrirConversation(null)}
                className="w-full border-none text-white"
                style={{ background: 'var(--primary)', borderRadius: 12, padding: '11px 12px', fontSize: 13, fontWeight: 800 }}>
                + Nouvelle conversation
              </button>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ padding: '0 12px max(env(safe-area-inset-bottom),12px)' }}>
              {conversations.length === 0 && (
                <p className="m-0 px-1 py-2" style={{ fontSize: 12, color: '#A99B89' }}>
                  Rien encore. Les trois dernières resteront ici.
                </p>
              )}
              {conversations.map(c => {
                const actif = (c.id ?? null) === conversationId
                return (
                  <div key={c.id ?? 'neuve'} className="mb-1.5 flex items-stretch gap-1">
                    <button onClick={() => ouvrirConversation(c)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      style={{
                        border: `1px solid ${actif ? '#C8DEC0' : '#F0EAE0'}`,
                        background: actif ? '#F4FAF5' : '#fff',
                        borderRadius: 12, padding: '10px 11px',
                      }}>
                      <span style={{ color: actif ? 'var(--primary)' : '#A99B89', flex: 'none', lineHeight: 0, marginTop: 2 }}>
                        <Soleil size={13} rayons={4} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block" style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{c.titre}</span>
                        <span className="block" style={{ fontSize: 10.5, color: '#A99B89', marginTop: 3 }}>{ilYA(c.at)}</span>
                      </span>
                    </button>
                    <button onClick={() => supprimerConversation(c)} aria-label="Supprimer cette conversation"
                      className="flex flex-none items-center justify-center bg-white"
                      style={{ width: 34, border: '1px solid #F0EAE0', borderRadius: 12, color: '#A99B89' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 21 6" /><path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Le fil */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 0 6px' }}>
        {/* Entrée par le micro : rien n'a encore été dit. On accueille au
            lieu de laisser un écran blanc, et on rappelle ce qu'on sait. */}
        {messages.length === 0 && (
          <div style={{ margin: '0 16px 12px', display: 'flex', gap: 9 }}>
            <span className="flex flex-none items-center justify-center"
              style={{ width: AV, height: AV, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', marginTop: 2 }}>
              <Soleil size={14} rayons={4} />
            </span>
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.55 }}>
              {micEtat === 'recording'
                ? 'Je vous écoute. Dites ce que vous cherchez, puis relisez avant d’envoyer.'
                : 'Dites-moi ce que vous cherchez : une sortie, un artisan, un film, un bon plan, ou une question sur l’application.'}
            </div>
          </div>
        )}

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
              onApercu={c => { trackEvent('assistant_clic', { type: c.type }); setApercu(c) }} />
          )
        ))}

        {cherche !== null && (
          <div style={{ margin: '0 16px 12px', display: 'flex', gap: 9, alignItems: 'center' }}>
            <span className="flex flex-none items-center justify-center"
              style={{ width: AV, height: AV, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <Soleil size={14} rayons={4} />
            </span>
            <span style={{ fontSize: 13, color: '#7A6A5A' }}>
              {cherche === 'web' ? 'Je regarde sur le web…'
                : cherche ? `Je cherche : ${cherche}…`
                : 'Je cherche…'}
            </span>
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
                <button onClick={fermer} className="border-none bg-transparent" style={{ fontSize: 12.5, fontWeight: 700, color: '#7A6A5A' }}>
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
      <div className="flex flex-none items-end gap-2.5 bg-white"
        style={{ padding: '11px 14px max(env(safe-area-inset-bottom),14px)', borderTop: '1px solid #F0EAE0' }}>
        <div className="flex flex-1 items-end gap-2"
          style={{ border: '1px solid var(--bord)', borderRadius: 20, padding: '7px 12px' }}>
          <textarea
            ref={champRef}
            rows={1}
            value={saisie}
            onChange={e => setSaisie(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerMaintenant() } }}
            placeholder={
              quotaEpuise ? 'Conversations de découverte épuisées'
                : ecoute ? 'Je vous écoute…'
                : micEtat === 'transcribing' ? 'Un instant…'
                : 'Continuer la discussion…'
            }
            disabled={!!quotaEpuise}
            className="flex-1 resize-none border-none bg-transparent outline-none"
            style={{ fontSize: 13.5, color: 'var(--texte)', maxHeight: 118, lineHeight: 1.4, paddingTop: 4, paddingBottom: 4 }}
          />

          {/* Pendant qu'on parle, le micro devient une CROIX : elle renonce à
              la dictée et rend le champ tel qu'il était. Ce n'est pas un
              « stop » — arrêter et envoyer, c'est le rôle du bouton vert. */}
          {ecoute ? (
            <button type="button" onClick={annulerDictee} aria-label="Annuler la dictée"
              className="flex-none border-none bg-transparent" style={{ color: '#C84B2F', lineHeight: 0, paddingBottom: 4 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <button type="button" onClick={lancerDictee} aria-label="Dicter"
              className="flex-none border-none bg-transparent"
              style={{ color: micEtat === 'transcribing' ? '#7A6A5A' : '#A99B89', lineHeight: 0, paddingBottom: 4 }}>
              {micEtat === 'transcribing' ? (
                <span className="inline-block animate-spin"
                  style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #E3D9C8', borderTopColor: '#7A6A5A' }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 11v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </button>
          )}
          {/* Repli Whisper là où le navigateur ne sait pas écouter en direct
              (Firefox, iOS) : on enregistre, et le texte arrive d'un coup. */}
          <MicButton ref={micRef} hidden onStateChange={setMicEtat}
            onTranscript={t => {
              if (jeterRef.current) { jeterRef.current = false; return }
              if (t?.trim()) setSaisie(p => (p ? `${p} ${t.trim()}` : t.trim()))
            }} />
        </div>

        <button
          onClick={envoyerMaintenant}
          disabled={enCours || (!saisie.trim() && !ecoute) || !!quotaEpuise}
          aria-label="Envoyer"
          className="flex flex-none items-center justify-center border-none text-white"
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: enCours || (!saisie.trim() && !ecoute) || quotaEpuise ? '#C9BFB2' : 'var(--primary)',
          }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </button>
      </div>

      {apercu && <ApercuFiche carte={apercu} onClose={() => setApercu(null)} />}

      {offreOuverte && (
        <SubscriptionModal
          context={{ kind: 'feature', featureLabel: 'Assistant Village', minPlan: 'habitants' }}
          onClose={() => setOffreOuverte(false)}
        />
      )}
    </div>
    </ClientPortal>
  )
}

/** Une réponse : le soleil, le texte, les fiches, puis les rebonds. */
function Reponse({ message, onApercu, onRebond }: {
  message: Message; onApercu: (c: CarteData) => void; onRebond: (q: string) => void
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
    if (c) blocs.push(<div key={`c${i}`} style={{ marginBottom: 9 }}><CarteResultat carte={c} onOuvrir={() => onApercu(c)} /></div>)
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
            <div key={c.id} style={{ marginBottom: 9 }}><CarteResultat carte={c} onOuvrir={() => onApercu(c)} /></div>
          ))}
          {message.encours && !message.texte && (
            <span className="inline-block animate-spin"
              style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #E3D9C8', borderTopColor: 'var(--primary)' }} />
          )}
          {message.action && !message.encours && (
            <CarteAction action={message.action} cartes={message.cartes} texte={propre(message.texte)} />
          )}

          {/* Une réponse se garde ou se transmet : un ami qui cherche un
              artisan, un groupe qui organise sa journée. */}
          {!message.encours && message.texte.trim() && (
            <div className="flex" style={{ gap: 12, marginTop: 2, marginBottom: rebonds.length ? 8 : 0 }}>
              <button onClick={() => copier(propre(message.texte))}
                className="border-none bg-transparent p-0"
                style={{ fontSize: 11, fontWeight: 700, color: '#A99B89' }}>
                Copier
              </button>
              <button onClick={() => partager(propre(message.texte))}
                className="border-none bg-transparent p-0"
                style={{ fontSize: 11, fontWeight: 700, color: '#A99B89' }}>
                Partager
              </button>
            </div>
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
