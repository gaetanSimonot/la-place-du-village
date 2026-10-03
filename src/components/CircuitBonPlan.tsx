'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import type { EtablissementType } from '@/lib/types'
import ClientPortal from '@/components/ClientPortal'
import SubscriptionModal from '@/components/SubscriptionModal'
import { ReferenceForm, type DbMatch } from '@/components/CommerceRequestModal'

/**
 * LE CIRCUIT « CRÉER UN BON PLAN » — le « + » de la page Bons plans.
 *
 * Un bon plan est toujours celui d'un commerce, et publier demande le compte
 * Partenaire. Le circuit enchaîne ce qui manque, dans cet ordre, jusqu'au
 * formulaire du bon plan (rendu par la page, `onPret`) :
 *
 *   tes fiches ─────────────────────────────────────────────▶ bon plan
 *   pas de fiche → chercher la sienne sur l'app → la revendiquer ─▶ bon plan
 *                 └ pas sur l'app → la créer (recherche Google) ──▶ bon plan
 *
 * Le paiement s'intercale là où il manque (SubscriptionModal, retour
 * 'bonplan') : Stripe ramène sur /promotions?circuit=<etabId|creer>, la page
 * rouvre ce circuit en `reprise`, qui attend que le webhook ait posé le plan
 * (et la fiche revendiquée) puis reprend où on en était.
 *
 * La recherche Google n'est ouverte qu'une fois Partenaire : un compte
 * gratuit ne crée pas ici de fiche en attente de validation.
 */

export interface FicheBonPlan { id: string; nom: string; commune: string | null; photos: string[] | null; type: EtablissementType | null }

type Etape =
  | { e: 'chargement' }
  | { e: 'fiches'; fiches: FicheBonPlan[] }
  | { e: 'chercher' }
  | { e: 'creer' }
  | { e: 'activation'; cible: string; message?: string }
  | { e: 'info'; titre: string; texte: string }

const ATTENTE_MAX_MS = 45000

export default function CircuitBonPlan({ reprise = null, onPret, onClose }: {
  /** Retour de Stripe : 'creer' ou l'id de la fiche payée. */
  reprise?: string | null
  onPret: (fiche: FicheBonPlan) => void
  onClose: () => void
}) {
  const { user, profile, isAdmin, patchProfileLocal } = useAuth()
  const partenaire = isAdmin || profile?.plan === 'pro'
  const [etape, setEtape] = useState<Etape>(reprise ? { e: 'activation', cible: reprise } : { e: 'chargement' })
  const [paiement, setPaiement] = useState<{ etabId: string; etabNom: string } | 'creer' | null>(null)
  /** La fiche en cours de revendication (bouton en attente). */
  const [occupe, setOccupe] = useState<string | null>(null)

  const lireFiche = useCallback(async (id: string) => {
    const { data } = await supabase.from('etablissements').select('id, nom, commune, photos, type, user_id').eq('id', id).maybeSingle()
    return data as (FicheBonPlan & { user_id: string | null }) | null
  }, [])

  // Départ : les fiches de la personne.
  useEffect(() => {
    if (!user || reprise) return
    let vivant = true
    supabase.from('etablissements').select('id, nom, commune, photos, type').eq('user_id', user.id).order('nom')
      .then(({ data }) => {
        if (!vivant) return
        const fiches = (data ?? []) as FicheBonPlan[]
        setEtape(fiches.length ? { e: 'fiches', fiches } : { e: 'chercher' })
      })
    return () => { vivant = false }
  }, [user, reprise])

  /** Une fiche choisie, la sienne : bon plan si Partenaire, sinon paiement. */
  const choisirSaFiche = (f: FicheBonPlan) => {
    if (partenaire) onPret(f)
    else setPaiement({ etabId: f.id, etabNom: f.nom })
  }

  /** Une fiche de l'app, à revendiquer. */
  const revendiquer = async (id: string, nom: string) => {
    if (!partenaire) { setPaiement({ etabId: id, etabNom: nom }); return }
    setOccupe(id)
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/etablissements/${id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({}),
    }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setOccupe(null)
    if (r?.status === 409) {
      setEtape({ e: 'info', titre: 'Cette fiche est déjà gérée', texte: `« ${nom} » est déjà gérée par un autre compte. Si c'est ton commerce, écris-nous depuis Réglages › Aide : on regarde ça ensemble.` })
      return
    }
    if (!r?.ok) { toast.error(d.error ?? 'La revendication a échoué'); return }
    const f = await lireFiche(id)
    if (f) { toast.success(`Tu gères désormais « ${f.nom} »`); onPret(f) }
  }

  const choisirResultat = (m: DbMatch) => {
    if (m.kind !== 'etablissement') { toast('Les producteurs publient depuis leur fiche producteur'); return }
    if (m.claimed) {
      setEtape({ e: 'info', titre: 'Cette fiche est déjà gérée', texte: `« ${m.nom} » est déjà gérée par un compte. Si c'est le tien, il apparaît dans tes fiches ; sinon écris-nous depuis Réglages › Aide.` })
      return
    }
    revendiquer(m.id, m.nom)
  }

  /** Un résultat de la recherche tolérante. */
  const choisirTrouvee = (f: FicheTrouvee) => {
    if (f.mienne) { choisirSaFiche({ id: f.id, nom: f.nom, commune: f.commune, photos: f.photo ? [f.photo] : [], type: f.type }); return }
    if (f.claimed) {
      setEtape({ e: 'info', titre: 'Cette fiche est déjà gérée', texte: `« ${f.nom} » est déjà gérée par un autre compte. Si c'est ton commerce, écris-nous depuis Réglages › Aide : on regarde ça ensemble.` })
      return
    }
    revendiquer(f.id, f.nom)
  }

  const allerCreer = () => {
    if (partenaire) setEtape({ e: 'creer' })
    else setPaiement('creer')
  }

  // ── Reprise après Stripe : attendre le plan (et la fiche) posés par le webhook.
  const debut = useRef(Date.now())
  useEffect(() => {
    if (etape.e !== 'activation' || !user) return
    let vivant = true
    let minuteur: ReturnType<typeof setTimeout>
    const tour = async () => {
      const { data: p } = await supabase.from('profiles').select('plan').eq('user_id', user.id).maybeSingle()
      if (!vivant) return
      const plan = (p?.plan as string | undefined) ?? 'basic'
      if (plan === 'pro' || isAdmin) {
        if (plan === 'pro') patchProfileLocal({ plan: 'pro' })
        if (etape.cible === 'creer') { setEtape({ e: 'creer' }); return }
        const f = await lireFiche(etape.cible)
        if (!vivant) return
        if (f?.user_id === user.id) { toast.success('Compte Partenaire activé'); onPret(f); return }
      } else if (plan === 'habitants') {
        setEtape({ e: 'info', titre: 'Abonnement Habitant activé', texte: 'Merci ! Publier un bon plan demande le compte Partenaire Local : tu peux y passer depuis Réglages › Abonnement.' })
        return
      }
      if (Date.now() - debut.current > ATTENTE_MAX_MS) {
        setEtape({ e: 'activation', cible: etape.cible, message: 'Le paiement est bien parti, mais l’activation prend plus de temps que prévu.' })
        return
      }
      minuteur = setTimeout(tour, 2000)
    }
    if (!etape.message) tour()
    return () => { vivant = false; clearTimeout(minuteur) }
  }, [etape, user, isAdmin, lireFiche, onPret, patchProfileLocal])

  if (!user) return null

  return (
    <ClientPortal>
      {/* Mêmes règles que la fenêtre « Référencer » (CommerceRequestModal), dont
          on reprend le formulaire : textes lisibles malgré le mode sombre du
          navigateur. */}
      <style>{`
        .pdv-ref-modal input, .pdv-ref-modal textarea {
          color: #2C1810 !important; -webkit-text-fill-color: #2C1810 !important;
          background-color: transparent !important; caret-color: #2C1810 !important;
        }
        .pdv-ref-modal input::placeholder, .pdv-ref-modal textarea::placeholder {
          color: #B0A898 !important; -webkit-text-fill-color: #B0A898 !important; opacity: 1;
        }
        .pdv-ref-modal .pdv-pred-card, .pdv-ref-modal .pdv-pred-card * { color: #1A1209 !important; -webkit-text-fill-color: #1A1209 !important; }
        .pdv-ref-modal .pdv-pred-card .pdv-pred-sub { color: #7A6A5A !important; -webkit-text-fill-color: #7A6A5A !important; }
      `}</style>
      {/* Le paiement (SubscriptionModal, plus bas dans l'empilement) s'ouvrait
          DERRIÈRE la feuille : on la retire le temps qu'il est ouvert, et on
          la retrouve telle quelle s'il est fermé. */}
      {!paiement && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(3px)' }} />}
      <div className="pcv-sheet pdv-ref-modal" style={{
        display: paiement ? 'none' : undefined,
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 3001, margin: '0 auto', maxWidth: 520,
        backgroundColor: '#fff', borderRadius: '24px 24px 0 0',
        padding: '14px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        fontFamily: 'var(--font-body), sans-serif', maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#E4DED2', margin: '0 auto 14px' }} />

        {etape.e === 'chargement' && <p style={{ textAlign: 'center', color: '#7A6A5A', fontSize: 13, padding: '24px 0' }}>Chargement…</p>}

        {etape.e === 'fiches' && (
          <>
            <Titre>Créer un bon plan</Titre>
            <Sous>Pour quel commerce&nbsp;?</Sous>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {etape.fiches.map(f => <LigneFiche key={f.id} f={f} onClick={() => choisirSaFiche(f)} />)}
            </div>
            <Lien onClick={() => setEtape({ e: 'chercher' })}>Mon commerce n’est pas dans la liste</Lien>
            {!partenaire && <NotePartenaire />}
          </>
        )}

        {etape.e === 'chercher' && (
          <>
            <Titre>Publier un bon plan</Titre>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FFF4EC', border: '1px solid #F5D9C6', borderRadius: 14, padding: '11px 13px', margin: '4px 0 16px' }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>🎁</span>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: '#6B3A1F' }}>
                Un bon plan est publié au nom de <b>ton commerce</b>. Il te faut sa fiche sur l’app et le compte <b>Partenaire Local</b>
                {partenaire ? ' — tu l’as déjà.' : ' : on s’en occupe ensemble, en quelques étapes.'}
              </p>
            </div>
            <RechercheFiche onChoisir={choisirTrouvee} occupe={occupe} />
            <button type="button" onClick={allerCreer} style={{ ...btnPlein, marginTop: 16 }}>
              Mon commerce n’est pas sur l’app — créer sa fiche
            </button>
          </>
        )}

        {etape.e === 'creer' && (
          <ReferenceForm
            kind="commerce"
            googleAutorise
            onBack={() => setEtape({ e: 'chercher' })}
            onClose={onClose}
            onChoisirExistant={choisirResultat}
            onQuota={() => setEtape({ e: 'info', titre: 'Limite atteinte', texte: 'Tu as atteint le nombre de fiches que tu peux créer ce mois-ci. Écris-nous depuis Réglages › Aide et on t’ouvre l’accès.' })}
            onDone={d => {
              if (d.etablissement_id) { revendiquer(d.etablissement_id, 'ta fiche'); return }
              setEtape({ e: 'info', titre: 'Fiche envoyée', texte: 'Ta fiche est entre nos mains pour une rapide vérification. Dès qu’elle est en ligne, tu reçois une notification : reviens ici par le « + » pour publier ton bon plan.' })
            }}
          />
        )}

        {etape.e === 'activation' && (
          <div style={{ textAlign: 'center', padding: '22px 4px 8px' }}>
            {!etape.message ? (
              <>
                <div className="lpv-voileBarre" style={{ margin: '0 auto 18px' }} />
                <Titre>Activation de ton compte…</Titre>
                <Sous>Merci ! On finalise ton compte Partenaire Local, c’est l’affaire de quelques secondes.</Sous>
              </>
            ) : (
              <>
                <Titre>Encore un instant</Titre>
                <Sous>{etape.message}</Sous>
                <button type="button" style={btnPlein} onClick={() => { debut.current = Date.now(); setEtape({ e: 'activation', cible: etape.cible }) }}>Réessayer</button>
              </>
            )}
          </div>
        )}

        {etape.e === 'info' && (
          <div style={{ textAlign: 'center', padding: '16px 4px 4px' }}>
            <Titre>{etape.titre}</Titre>
            <Sous>{etape.texte}</Sous>
            <button type="button" style={btnPlein} onClick={onClose}>Compris</button>
          </div>
        )}
      </div>

      {paiement && (
        <SubscriptionModal
          context={paiement === 'creer'
            ? { kind: 'feature', featureLabel: 'Publier des bons plans', minPlan: 'pro' }
            : { kind: 'claim', etabId: paiement.etabId, etabNom: paiement.etabNom }}
          currentPlan={(profile?.plan as 'basic' | 'habitants' | 'pro') ?? 'basic'}
          retour="bonplan"
          onClose={() => setPaiement(null)}
        />
      )}
    </ClientPortal>
  )
}

export interface FicheTrouvee { id: string; nom: string; commune: string | null; type: EtablissementType | null; photo: string | null; claimed: boolean; mienne: boolean }

/**
 * Recherche de SA fiche dans toute l'app — tolérante aux accents et aux
 * fautes (/api/etablissements/recherche). Sans Google : rien n'est facturé.
 */
function RechercheFiche({ onChoisir, occupe }: { onChoisir: (f: FicheTrouvee) => void; occupe: string | null }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<FicheTrouvee[]>([])
  const [cherche, setCherche] = useState(false)
  const [cherchee, setCherchee] = useState('')
  useEffect(() => {
    const v = q.trim()
    if (v.length < 2) { setRes([]); setCherchee(''); return }
    let vivant = true
    const t = setTimeout(async () => {
      setCherche(true)
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`/api/etablissements/recherche?q=${encodeURIComponent(v)}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      }).catch(() => null)
      const d = r?.ok ? await r.json().catch(() => ({})) : {}
      if (!vivant) return
      setRes((d.fiches ?? []) as FicheTrouvee[])
      setCherchee(v)
      setCherche(false)
    }, 250)
    return () => { vivant = false; clearTimeout(t) }
  }, [q])

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B5E4E', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
        Ton commerce est peut-être déjà sur l’app
      </label>
      <div style={{ position: 'relative' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="7.5" /><line x1="21" y1="21" x2="16.6" y2="16.6" />
        </svg>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Nom de ton commerce, même approximatif"
          maxLength={60} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
          style={{ width: '100%', padding: '14px 42px 14px 42px', borderRadius: 14, border: '1.5px solid #E0D8CE', fontSize: 16, outline: 'none', boxSizing: 'border-box', backgroundColor: '#FDFAF6', colorScheme: 'light' }}
        />
        {q && (
          <button type="button" aria-label="Effacer" onClick={() => setQ('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#EDE6DA', color: '#6B5E4E', cursor: 'pointer', fontSize: 13 }}>✕</button>
        )}
      </div>
      <p style={{ margin: '6px 2px 0', fontSize: 11, color: '#9A8A7A', minHeight: 15 }}>
        {cherche ? 'Recherche…' : q.trim().length < 2 ? 'Accents et petites fautes de frappe ne gênent pas.' : ''}
      </p>
      {!cherche && cherchee && res.length === 0 && (
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#7A6A5A' }}>Rien à ce nom sur l’app : crée ta fiche juste en dessous.</p>
      )}
      {res.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {res.map(f => {
            const info = f.type ? ETAB_TYPES[f.type] : null
            const libre = !f.claimed || f.mienne
            return (
              <div key={f.id} style={{ ...carte, cursor: 'default', opacity: occupe && occupe !== f.id ? 0.5 : 1 }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, overflow: 'hidden', flexShrink: 0, background: info?.bg ?? '#FDE8DF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>
                  {f.photo ? <img src={f.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (info?.emoji ?? '🏪')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nom}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[info?.label, f.commune].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" disabled={!!occupe} onClick={() => onChoisir(f)}
                  style={{
                    flexShrink: 0, border: 'none', cursor: occupe ? 'wait' : 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '8px 12px',
                    ...(libre ? { color: '#fff', background: '#2D5A3D' } : { color: '#6B5E4E', background: '#F0EAE0' }),
                  }}>
                  {occupe === f.id ? '…' : f.mienne ? 'Choisir' : f.claimed ? 'Déjà gérée' : 'C’est le mien'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LigneFiche({ f, onClick }: { f: FicheBonPlan; onClick: () => void }) {
  const info = f.type ? ETAB_TYPES[f.type] : null
  const photo = f.photos?.[0]
  return (
    <button type="button" onClick={onClick} style={carte}>
      <div style={{ width: 46, height: 46, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: info?.bg ?? '#F0EBE3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
        {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (info?.emoji ?? '🏪')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nom}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>{[info?.label, f.commune].filter(Boolean).join(' · ')}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
    </button>
  )
}

function NotePartenaire() {
  return (
    <p style={{ margin: '12px 2px 0', fontSize: 11.5, color: '#7A6A5A', lineHeight: 1.5 }}>
      Publier un bon plan demande le compte <b>Partenaire Local</b> : on te le propose juste après le choix du commerce.
    </p>
  )
}

const Titre = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ margin: '0 0 4px', fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 22, fontWeight: 400, color: '#1A1209', letterSpacing: '-0.01em' }}>{children}</h2>
)
const Sous = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#7A6A5A', lineHeight: 1.5 }}>{children}</p>
)
const Lien = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: '#2D5A3D', fontSize: 13, fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
)

const carte: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 13px', borderRadius: 14,
  backgroundColor: '#fff', border: '1px solid #F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
}
const btnPlein: React.CSSProperties = {
  display: 'block', width: '100%', padding: '13px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
  backgroundColor: '#2D5A3D', color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
}
