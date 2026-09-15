'use client'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import BottomNavBar from '@/components/BottomNavBar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { RADIO, semaineDe, type EmissionRadio } from '@/lib/radio'

/**
 * SAISIE D'UNE ÉMISSION — volontairement pauvre en écrans.
 *
 * Deux gestes, et c'est tout : coller le lien du podcast, puis lister ce qu'il
 * annonce. Chaque ligne cherche d'abord si l'événement est déjà chez nous ;
 * s'il n'y est pas, on l'écrit à la main et la ligne restera simplement
 * inerte côté public. Refuser la saisie libre obligerait à créer une fiche
 * bâclée pour chaque rendez-vous entendu — l'agenda s'en trouverait sali.
 *
 * L'accès réel est contrôlé PAR LE SERVEUR dans /api/radio/admin : cet écran
 * ne fait que refléter ce que l'API accepte. Masquer un écran ne protège rien.
 */

interface MentionAdmin {
  id: string
  titre: string
  detail: string | null
  ordre: number
  evenement_id: string | null
  evenements?: { id: string; titre: string; date_debut: string | null; lieux?: { nom?: string; commune?: string } | null } | null
}
interface Resultat {
  id: string; titre: string; date_debut: string | null
  lieux?: { nom?: string; commune?: string } | null
}

async function authedFetch(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      ...(init?.headers ?? {}),
    },
  })
}
const fetcher = (u: string) => authedFetch(u).then(r => r.json())

const CHAMP: React.CSSProperties = {
  width: '100%', border: '1px solid #E3DACB', borderRadius: 10,
  padding: '10px 12px', fontSize: 14, background: '#fff', color: '#1A1209',
}
const ETIQ: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: .4,
  textTransform: 'uppercase', color: '#7A6A5A', margin: '0 0 5px',
}

export default function RadioAdminClient() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [emissionId, setEmissionId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/radio/admin')
  }, [authLoading, user, openAuthModal])

  const cleListe = !authLoading && user ? '/api/radio/admin' : null
  const { data: liste, mutate: relireListe } = useSWR<{ emissions: EmissionRadio[] }>(cleListe, fetcher)

  const cleDetail = emissionId ? `/api/radio/admin?emission=${emissionId}` : null
  const { data: detail, mutate: relireDetail } =
    useSWR<{ emission: EmissionRadio; mentions: MentionAdmin[] }>(cleDetail, fetcher)

  const emissions = liste?.emissions ?? []
  const mentions = useMemo(() => detail?.mentions ?? [], [detail])
  const courante = detail?.emission ?? null

  // ── Création d'une émission ───────────────────────────────────────────
  const [titre, setTitre] = useState('')
  const [audio, setAudio] = useState('')
  const [semaine, setSemaine] = useState(() => semaineDe().debut)
  const [description, setDescription] = useState('')
  const [enCours, setEnCours] = useState(false)

  async function creerEmission() {
    if (enCours) return
    setEnCours(true)
    const res = await authedFetch('/api/radio/admin', {
      method: 'POST',
      body: JSON.stringify({ type: 'emission', titre, audio_url: audio, semaine_debut: semaine, description, statut: 'brouillon' }),
    })
    const j = await res.json().catch(() => ({}))
    setEnCours(false)
    if (!res.ok) { toast.error(j.error ?? 'Création impossible'); return }
    toast.success('Émission créée')
    setTitre(''); setAudio(''); setDescription('')
    await relireListe()
    setEmissionId(j.emission.id)
  }

  async function changerStatut(e: EmissionRadio, statut: 'brouillon' | 'publie') {
    const res = await authedFetch('/api/radio/admin', {
      method: 'PATCH', body: JSON.stringify({ type: 'emission', id: e.id, statut }),
    })
    if (!res.ok) { toast.error('Changement refusé'); return }
    toast.success(statut === 'publie' ? 'En ligne' : 'Repassée en brouillon')
    await Promise.all([relireListe(), relireDetail()])
  }

  async function supprimerEmission(e: EmissionRadio) {
    const res = await authedFetch(`/api/radio/admin?emission=${e.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Suppression impossible'); return }
    if (emissionId === e.id) setEmissionId(null)
    toast.success('Émission supprimée')
    await relireListe()
  }

  // ── Les mentions ──────────────────────────────────────────────────────
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<Resultat[]>([])
  const [libre, setLibre] = useState('')
  const [detailLibre, setDetailLibre] = useState('')

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 3) { setResultats([]); return }
    // Une frappe déclenche une requête : on attend que la main s'arrête.
    const t = setTimeout(async () => {
      const r = await authedFetch(`/api/radio/admin?recherche=${encodeURIComponent(q)}`)
      const j = await r.json().catch(() => ({}))
      setResultats(j.resultats ?? [])
    }, 320)
    return () => clearTimeout(t)
  }, [recherche])

  async function ajouterMention(payload: { titre: string; evenement_id?: string; detail?: string }) {
    if (!emissionId) return
    const res = await authedFetch('/api/radio/admin', {
      method: 'POST', body: JSON.stringify({ type: 'mention', emission_id: emissionId, ...payload }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? 'Ajout impossible'); return }
    setRecherche(''); setResultats([]); setLibre(''); setDetailLibre('')
    await relireDetail()
  }

  async function retirerMention(id: string) {
    const res = await authedFetch(`/api/radio/admin?mention=${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Retrait impossible'); return }
    await relireDetail()
  }

  const dejaCites = useMemo(
    () => new Set(mentions.map(m => m.evenement_id).filter(Boolean) as string[]),
    [mentions],
  )

  return (
    <div className="min-h-[100dvh]" style={{ background: '#FDFAF5', color: '#1A1209', paddingBottom: 96 }}>
      <div className="px-4" style={{ paddingTop: 'max(18px, env(safe-area-inset-top, 18px))' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: '#C4622D' }}>
          {RADIO.nom}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: '4px 0 0' }}>
          La sélection de la semaine
        </h1>
        <p style={{ fontSize: 13, color: '#7A6A5A', margin: '6px 0 0', lineHeight: 1.5 }}>
          Collez le lien du podcast, puis listez ce qu’il annonce. Un rendez-vous
          absent de l’agenda s’écrit à la main : sa ligne s’affichera sans être
          cliquable.
        </p>
      </div>

      {/* ── Nouvelle émission ──────────────────────────────────────── */}
      <div className="mx-4 mt-5 rounded-[16px]" style={{ background: '#fff', border: '1px solid #EAE2D6', padding: 15 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Nouvelle émission</div>
        <div className="flex flex-col gap-3">
          <div>
            <label style={ETIQ} htmlFor="ra-titre">Titre</label>
            <input id="ra-titre" style={CHAMP} value={titre} onChange={e => setTitre(e.target.value)}
              placeholder="Sélection culturelle de la semaine" />
          </div>
          <div>
            <label style={ETIQ} htmlFor="ra-audio">Lien du podcast</label>
            <input id="ra-audio" style={CHAMP} value={audio} onChange={e => setAudio(e.target.value)}
              placeholder="https://…/selection.mp3" inputMode="url" />
          </div>
          <div>
            <label style={ETIQ} htmlFor="ra-semaine">Semaine concernée</label>
            <input id="ra-semaine" type="date" style={CHAMP} value={semaine} onChange={e => setSemaine(e.target.value)} />
            <div style={{ fontSize: 11.5, color: '#A2917C', marginTop: 4 }}>
              N’importe quel jour de la semaine — il est ramené au lundi.
            </div>
          </div>
          <div>
            <label style={ETIQ} htmlFor="ra-desc">Présentation (facultatif)</label>
            <textarea id="ra-desc" style={{ ...CHAMP, minHeight: 64, resize: 'vertical' }}
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <button
            type="button" onClick={creerEmission}
            disabled={enCours || !titre.trim() || !audio.trim()}
            style={{
              border: 'none', borderRadius: 11, padding: '12px 16px', fontSize: 14, fontWeight: 700,
              background: !titre.trim() || !audio.trim() ? '#E3DACB' : '#2D5A3D',
              color: !titre.trim() || !audio.trim() ? '#A2917C' : '#fff',
              cursor: !titre.trim() || !audio.trim() ? 'default' : 'pointer',
            }}
          >
            {enCours ? 'Création…' : 'Créer en brouillon'}
          </button>
        </div>
      </div>

      {/* ── Les émissions existantes ───────────────────────────────── */}
      <div className="mx-4 mt-6">
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 }}>
          Émissions
        </div>
        {emissions.length === 0 && (
          <div style={{ fontSize: 13, color: '#7A6A5A' }}>Aucune émission pour le moment.</div>
        )}
        <div className="flex flex-col gap-2">
          {emissions.map(e => {
            const ouverte = e.id === emissionId
            return (
              <div key={e.id} className="rounded-[14px]"
                style={{ background: '#fff', border: `1px solid ${ouverte ? '#2D5A3D' : '#EAE2D6'}`, padding: 12 }}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setEmissionId(ouverte ? null : e.id)}
                    className="min-w-0 flex-1 border-none bg-transparent p-0 text-left">
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{e.titre}</div>
                    <div style={{ fontSize: 12, color: '#7A6A5A', marginTop: 2 }}>
                      {e.semaine_debut} · {e.statut === 'publie' ? 'en ligne' : e.statut}
                    </div>
                  </button>
                  <button type="button"
                    onClick={() => changerStatut(e, e.statut === 'publie' ? 'brouillon' : 'publie')}
                    className="flex-none rounded-full"
                    style={{
                      border: `1px solid ${e.statut === 'publie' ? '#2D5A3D' : '#E3DACB'}`,
                      background: e.statut === 'publie' ? '#2D5A3D' : 'transparent',
                      color: e.statut === 'publie' ? '#fff' : '#7A6A5A',
                      padding: '6px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    }}>
                    {e.statut === 'publie' ? 'En ligne' : 'Publier'}
                  </button>
                </div>

                {ouverte && (
                  <div className="mt-3" style={{ borderTop: '1px solid #F0E9DD', paddingTop: 11 }}>
                    {/* ── Rattacher une fiche existante ── */}
                    <label style={ETIQ} htmlFor="ra-rech">Chercher un événement de l’agenda</label>
                    <input id="ra-rech" style={CHAMP} value={recherche} onChange={ev => setRecherche(ev.target.value)}
                      placeholder="Trois lettres suffisent" />
                    {resultats.length > 0 && (
                      <div className="mt-2 overflow-hidden rounded-[10px]" style={{ border: '1px solid #EAE2D6' }}>
                        {resultats.map(r => {
                          const deja = dejaCites.has(r.id)
                          return (
                            <button key={r.id} type="button" disabled={deja}
                              onClick={() => ajouterMention({ titre: r.titre, evenement_id: r.id })}
                              className="block w-full border-none text-left"
                              style={{
                                background: deja ? '#F7F2E9' : '#fff', padding: '9px 11px',
                                borderBottom: '1px solid #F0E9DD', cursor: deja ? 'default' : 'pointer',
                                opacity: deja ? .55 : 1,
                              }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.titre}</div>
                              <div style={{ fontSize: 11.5, color: '#7A6A5A' }}>
                                {[r.date_debut, r.lieux?.nom || r.lieux?.commune].filter(Boolean).join(' · ')}
                                {deja ? ' · déjà cité' : ''}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* ── Ou saisir ce qui n'est pas chez nous ── */}
                    <div className="mt-3.5">
                      <label style={ETIQ} htmlFor="ra-libre">Ou citer un rendez-vous absent de l’agenda</label>
                      <input id="ra-libre" style={CHAMP} value={libre} onChange={ev => setLibre(ev.target.value)}
                        placeholder="Vernissage chez…" />
                      <input style={{ ...CHAMP, marginTop: 6 }} value={detailLibre}
                        onChange={ev => setDetailLibre(ev.target.value)} placeholder="samedi 20, Sauve (facultatif)" />
                      <button type="button" disabled={!libre.trim()}
                        onClick={() => ajouterMention({ titre: libre, detail: detailLibre })}
                        style={{
                          marginTop: 7, border: '1px solid #E3DACB', borderRadius: 10, background: '#fff',
                          padding: '9px 14px', fontSize: 13, fontWeight: 700,
                          color: libre.trim() ? '#1A1209' : '#A2917C', cursor: libre.trim() ? 'pointer' : 'default',
                        }}>
                        Ajouter la ligne
                      </button>
                    </div>

                    {/* ── Ce que l'émission cite déjà ── */}
                    <div className="mt-4">
                      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#7A6A5A' }}>
                        Cités ({mentions.length})
                      </div>
                      {mentions.map(m => (
                        <div key={m.id} className="flex items-start gap-2"
                          style={{ borderBottom: '1px solid #F0E9DD', padding: '9px 0' }}>
                          <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full"
                            style={{ background: m.evenement_id ? '#2D5A3D' : 'transparent', border: m.evenement_id ? 'none' : '1.5px solid #C4B5A2' }} />
                          <div className="min-w-0 flex-1">
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.titre}</div>
                            <div style={{ fontSize: 11.5, color: '#7A6A5A' }}>
                              {m.evenement_id
                                ? [m.evenements?.date_debut, m.evenements?.lieux?.nom || m.evenements?.lieux?.commune]
                                    .filter(Boolean).join(' · ') || 'rattaché à une fiche'
                                : (m.detail || 'ligne libre — non cliquable')}
                            </div>
                          </div>
                          <button type="button" onClick={() => retirerMention(m.id)}
                            aria-label={`Retirer ${m.titre}`}
                            className="flex-none border-none bg-transparent"
                            style={{ color: '#B0654A', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Retirer
                          </button>
                        </div>
                      ))}
                    </div>

                    <button type="button" onClick={() => supprimerEmission(e)}
                      style={{ marginTop: 14, border: '1px solid #E8C9BE', borderRadius: 10, background: 'transparent',
                               padding: '9px 14px', fontSize: 12.5, fontWeight: 700, color: '#B0654A', cursor: 'pointer' }}>
                      Supprimer cette émission
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {courante && null}
      <BottomNavBar />
    </div>
  )
}
