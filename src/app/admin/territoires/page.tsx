'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/**
 * TERRITOIRES — brancher des groupes, régler la géographie.
 *
 * L'écran répond à une question simple : « ce groupe, il est où ? ». Il part
 * des groupes QUI ARRIVENT VRAIMENT — relevés dans les messages reçus — et
 * non d'une liste saisie à la main : les noms viennent des collecteurs, et une
 * faute de frappe dans un nom tapé ici ne se verrait jamais.
 *
 * Un groupe non rangé n'est pas une panne. Il retombe sur le territoire par
 * défaut, et la géographie corrige ensuite le rangement de chaque événement.
 * Le ranger sert à orienter le géocodage, qui lui se décide AVANT de savoir où
 * se tient l'événement — sans repère, « Bréau » part en Seine-et-Marne.
 */

interface Centre { id: string; nom: string; lat: number; lng: number }
interface Groupe { id: string; source: string; groupe: string; territoire_id: string }
interface Territoire {
  id: string; slug: string; nom: string
  rayon_affichage_km: number; rayon_insertion_km: number
  indice_geo: string; par_defaut: boolean; actif: boolean
  centres: Centre[]; groupes: Groupe[]
}
interface Vu { source: string; groupe: string; messages: number; dernier: string }

const COULEUR_SOURCE: Record<string, string> = {
  whatsapp: '#25D366', signal: '#3A76F0', facebook: '#1877F2',
}

async function entetes(extra?: Record<string, string>): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const out: Record<string, string> = { ...(extra ?? {}) }
  if (session?.access_token) out.Authorization = `Bearer ${session.access_token}`
  return out
}

function Pastille({ source }: { source: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
      backgroundColor: COULEUR_SOURCE[source] ?? '#9CA3AF', color: 'white',
      textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0,
    }}>{source}</span>
  )
}

export default function TerritoiresAdminPage() {
  const [territoires, setTerritoires] = useState<Territoire[]>([])
  const [vus, setVus] = useState<Vu[]>([])
  const [orphelins, setOrphelins] = useState<Centre[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  // Le territoire choisi dans le sélecteur de chaque ligne, avant validation.
  const [choix, setChoix] = useState<Record<string, string>>({})
  // Les réglages en cours de frappe, par territoire.
  const [brouillon, setBrouillon] = useState<Record<string, Partial<Territoire>>>({})

  const charger = useCallback(async () => {
    const r = await fetch('/api/admin/territoires', { headers: await entetes() })
    if (!r.ok) { setErreur('Lecture impossible (droits admin ?)'); setChargement(false); return }
    const d = await r.json()
    setTerritoires(d.territoires ?? [])
    setVus(d.vus ?? [])
    setOrphelins(d.centresOrphelins ?? [])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const ranger = async (source: string, groupe: string, territoire_id: string) => {
    const cle = `${source} :: ${groupe}`
    setOccupe(cle); setErreur(null)
    const r = await fetch('/api/admin/territoires', {
      method: 'POST',
      headers: await entetes({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source, groupe, territoire_id }),
    })
    if (!r.ok) setErreur((await r.json()).error ?? 'Erreur')
    else await charger()
    setOccupe(null)
  }

  const retirer = async (id: string) => {
    setOccupe(id)
    await fetch(`/api/admin/territoires?id=${id}`, { method: 'DELETE', headers: await entetes() })
    await charger(); setOccupe(null)
  }

  const enregistrerReglages = async (t: Territoire) => {
    const b = brouillon[t.id]
    if (!b) return
    setOccupe(t.id); setErreur(null)
    const r = await fetch('/api/admin/territoires', {
      method: 'PATCH',
      headers: await entetes({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: t.id, ...b }),
    })
    if (!r.ok) setErreur((await r.json()).error ?? 'Erreur')
    else { setBrouillon(p => { const n = { ...p }; delete n[t.id]; return n }); await charger() }
    setOccupe(null)
  }

  const declares = new Map<string, Groupe>()
  for (const t of territoires) for (const g of t.groupes) declares.set(`${g.source} :: ${g.groupe}`, g)
  const nonRanges = vus.filter(v => !declares.has(`${v.source} :: ${v.groupe}`))

  const champ: React.CSSProperties = {
    width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid #E8E0D5',
    fontSize: 13, backgroundColor: 'white', color: '#2C1810',
  }
  const carte: React.CSSProperties = {
    backgroundColor: 'white', borderRadius: 16, padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 14,
  }

  if (chargement) return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FBF7F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: '#9CA3AF' }}>Chargement…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FBF7F0', fontFamily: 'system-ui, sans-serif', paddingBottom: 40 }}>

      <div style={{ backgroundColor: '#2C1810', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/admin" style={{ color: '#C4622D', fontSize: 20, fontWeight: 'bold', textDecoration: 'none', lineHeight: 1 }}>←</Link>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Territoires</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>Où arrive quoi, et avec quel repère</div>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>

        {erreur && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
            {erreur}
          </div>
        )}

        {/* ── Les groupes qui arrivent et que personne n'a rangés ── */}
        <div style={{ ...carte, backgroundColor: nonRanges.length ? '#FFF7ED' : 'white' }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#2C1810', margin: 0 }}>
            Groupes reçus, pas encore rangés
          </p>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 12px' }}>
            Ils publient déjà. Sans rangement ils sont présumés « {territoires.find(t => t.par_defaut)?.nom ?? 'défaut'} » —
            ce qui oriente mal le géocodage de leurs lieux.
          </p>

          {!nonRanges.length && (
            <p style={{ fontSize: 13, color: '#16A34A', margin: 0 }}>Tous les groupes reçus sont rangés.</p>
          )}

          {nonRanges.map(v => {
            const cle = `${v.source} :: ${v.groupe}`
            const cible = choix[cle] ?? territoires[0]?.id ?? ''
            return (
              <div key={cle} style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '10px 0', borderTop: '1px solid #F0E8DC',
              }}>
                <Pastille source={v.source} />
                <span style={{ fontSize: 13, color: '#2C1810', fontWeight: 600, flex: 1, minWidth: 140 }}>{v.groupe}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                  {v.messages} msg · {v.dernier.slice(0, 10)}
                </span>
                <select
                  value={cible}
                  onChange={e => setChoix(p => ({ ...p, [cle]: e.target.value }))}
                  style={{ ...champ, width: 'auto' }}
                >
                  {territoires.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                </select>
                <button
                  onClick={() => ranger(v.source, v.groupe, cible)}
                  disabled={occupe === cle || !cible}
                  style={{
                    padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
                    backgroundColor: occupe === cle ? '#E8E0D5' : '#C4622D', color: occupe === cle ? '#9CA3AF' : 'white',
                    cursor: occupe === cle ? 'default' : 'pointer',
                  }}
                >{occupe === cle ? '…' : 'Ranger'}</button>
              </div>
            )
          })}
        </div>

        {/* ── Chaque territoire : ses réglages, ses centres, ses groupes ── */}
        {territoires.map(t => {
          const b = brouillon[t.id] ?? {}
          const modifie = Object.keys(b).length > 0
          const val = <K extends keyof Territoire>(k: K): Territoire[K] => (b[k] ?? t[k]) as Territoire[K]
          const poser = (k: keyof Territoire, v: unknown) =>
            setBrouillon(p => ({ ...p, [t.id]: { ...p[t.id], [k]: v } }))

          return (
            <div key={t.id} style={carte}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#2C1810' }}>{t.nom}</span>
                <code style={{ fontSize: 11, color: '#9CA3AF' }}>{t.slug}</code>
                {t.par_defaut && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#2D5A3D', backgroundColor: '#DCFCE7', padding: '2px 7px', borderRadius: 999 }}>
                    par défaut
                  </span>
                )}
                {!t.actif && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', backgroundColor: '#FEE2E2', padding: '2px 7px', borderRadius: 999 }}>
                    inactif
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6B7280' }}>
                  <div style={{ marginBottom: 4 }}>Rayon d&apos;accueil</div>
                  <input type="number" value={val('rayon_insertion_km')} style={champ}
                    onChange={e => poser('rayon_insertion_km', Number(e.target.value))} />
                </label>
                <label style={{ fontSize: 12, color: '#6B7280' }}>
                  <div style={{ marginBottom: 4 }}>Rayon d&apos;affichage</div>
                  <input type="number" value={val('rayon_affichage_km')} style={champ}
                    onChange={e => poser('rayon_affichage_km', Number(e.target.value))} />
                </label>
                <label style={{ fontSize: 12, color: '#6B7280', flex: 1, minWidth: 180 }}>
                  <div style={{ marginBottom: 4 }}>Repère envoyé à Google</div>
                  <input value={val('indice_geo')} style={{ ...champ, width: '100%' }}
                    onChange={e => poser('indice_geo', e.target.value)} />
                </label>
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 12px' }}>
                On accepte plus large qu&apos;on n&apos;affiche : un réglage d&apos;affichage plus généreux pourra
                montrer demain ce qu&apos;on aurait jeté à l&apos;entrée.
              </p>

              {modifie && (
                <button
                  onClick={() => enregistrerReglages(t)}
                  disabled={occupe === t.id}
                  style={{
                    padding: '9px 16px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
                    backgroundColor: '#C4622D', color: 'white', cursor: 'pointer', marginBottom: 14,
                  }}
                >{occupe === t.id ? 'Enregistrement…' : 'Enregistrer les réglages'}</button>
              )}

              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
                Points d&apos;ancrage : {t.centres.length
                  ? t.centres.map(c => c.nom).join(', ')
                  : <span style={{ color: '#B91C1C', fontWeight: 600 }}>aucun — ce territoire n&apos;accepte donc rien</span>}
              </div>

              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6, marginTop: 12 }}>
                Groupes rangés ici ({t.groupes.length})
              </div>
              {!t.groupes.length && (
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Aucun groupe déclaré.</p>
              )}
              {t.groupes.map(g => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #F0E8DC' }}>
                  <Pastille source={g.source} />
                  <span style={{ fontSize: 13, color: '#2C1810', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.groupe}
                  </span>
                  <button
                    onClick={() => retirer(g.id)}
                    disabled={occupe === g.id}
                    title="Retirer — le groupe retombera sur le territoire par défaut"
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                  >×</button>
                </div>
              ))}
            </div>
          )
        })}

        {orphelins.length > 0 && (
          <div style={{ ...carte, backgroundColor: '#FEF2F2' }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#991B1B', margin: '0 0 4px' }}>
              Points d&apos;ancrage sans territoire
            </p>
            <p style={{ fontSize: 12, color: '#7F1D1D', margin: 0 }}>
              {orphelins.map(c => c.nom).join(', ')} — ils ne servent à rien : l&apos;arbitrage
              géographique ignore un centre qui n&apos;appartient à personne.
            </p>
          </div>
        )}

        <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6, marginTop: 20 }}>
          Ranger un groupe ne fige rien : le territoire du groupe n&apos;est qu&apos;une présomption,
          qui sert à orienter le géocodage. Une fois le lieu situé, c&apos;est la géographie qui
          tranche — un événement palois annoncé dans un groupe cévenol part à Pau, et un
          événement hors de toutes les zones est refusé comme avant.
        </p>
      </div>
    </div>
  )
}
