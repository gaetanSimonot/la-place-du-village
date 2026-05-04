'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Plan = 'basic' | 'pro' | 'max'

const PLANS: { id: Plan; label: string; icon: string; activeColor: string; activeBg: string; desc: string }[] = [
  { id: 'basic', label: 'Basic',  icon: '○', activeColor: '#2D5A3D', activeBg: '#E8F2EB', desc: 'Accès standard gratuit.' },
  { id: 'pro',   label: 'Pro',    icon: '★', activeColor: '#3A5BC7', activeBg: '#EEF3FF', desc: '1 promo/mois dans le bandeau · newsletter · card mise en avant.' },
  { id: 'max',   label: 'MAX',    icon: '✦', activeColor: '#E8622A', activeBg: '#FFF0EB', desc: 'Splash screen · profil pro dans l\'annuaire · tout Pro inclus.' },
]

const PRO_TYPES = [
  { id: 'producteur',  label: '🌿 Producteur local' },
  { id: 'artisan',     label: '🔨 Artisan' },
  { id: 'restaurateur',label: '🍽 Restaurateur' },
  { id: 'commercant',  label: '🛍 Commerçant' },
  { id: 'association', label: '🤝 Association' },
  { id: 'prestataire', label: '💼 Prestataire de service' },
  { id: 'autre',       label: '● Autre' },
]

interface Producer { id: string; nom: string; is_max: boolean; photo: string | null; commune: string | null }
interface Membre {
  id: string; email: string; name: string; avatar: string
  created_at: string; last_sign_in: string | null
  plan: Plan; pro_type: string | null
  display_name: string | null; bio: string | null
  producer: Producer | null
}

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 12, outline: 'none', backgroundColor: '#fff', color: '#2C1810', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
const secLabel: React.CSSProperties = { margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#9A8A7A', textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function MembresAdmin() {
  const [membres, setMembres]   = useState<Membre[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving]     = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Edit fields — reset on expand
  const [editName, setEditName]       = useState('')
  const [editBio, setEditBio]         = useState('')
  const [editPlan, setEditPlan]       = useState<Plan>('basic')
  const [editProType, setEditProType] = useState('')
  const [editNom, setEditNom]         = useState('')
  const [editCommune, setEditCommune] = useState('')

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const t = await token()
    const r = await fetch('/api/admin/membres', { headers: { Authorization: `Bearer ${t}` } })
    const d = await r.json()
    setMembres(d.membres ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  const expand = (m: Membre) => {
    if (expandedId === m.id) { setExpandedId(null); return }
    setExpandedId(m.id)
    setEditName(m.display_name ?? m.name ?? '')
    setEditBio(m.bio ?? '')
    setEditPlan(m.plan)
    setEditProType(m.pro_type ?? '')
    setEditNom(m.producer?.nom ?? '')
    setEditCommune(m.producer?.commune ?? '')
  }

  const saveMember = async (e: React.MouseEvent, membre: Membre) => {
    e.stopPropagation()
    setSaving(membre.id)
    setSaveError(null)
    const t = await token()
    const res = await fetch('/api/admin/membres', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ user_id: membre.id, plan: editPlan, pro_type: editProType || null, display_name: editName || null }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setSaveError(d.error ?? `Erreur ${res.status}`)
    }
    await fetchAll()
    setSaving(null)
  }

  const createProducer = async (e: React.MouseEvent, membre: Membre) => {
    e.stopPropagation()
    if (!editNom.trim()) return
    setSaving(`p-${membre.id}`)
    const t = await token()
    await fetch('/api/admin/producteurs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ nom: editNom.trim(), commune: editCommune.trim() || null, user_email: membre.email, is_max: true }),
    })
    await fetchAll()
    setSaving(null)
  }

  const saveProducer = async (e: React.MouseEvent, producerId: string) => {
    e.stopPropagation()
    setSaving(`p-${producerId}`)
    const t = await token()
    await fetch(`/api/admin/producteurs/${producerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ nom: editNom.trim(), commune: editCommune.trim() || null }),
    })
    await fetchAll()
    setSaving(null)
  }

  const removeProducer = async (e: React.MouseEvent, producerId: string) => {
    e.stopPropagation()
    if (!confirm('Retirer la fiche de l\'annuaire ?')) return
    setSaving(`p-${producerId}`)
    const t = await token()
    await fetch(`/api/admin/producteurs/${producerId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
    await fetchAll()
    setSaving(null)
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
  const planCfg = (p: Plan) => PLANS.find(x => x.id === p)!

  const filtered = membres.filter(m =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.producer?.nom ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#9A8A7A', fontFamily: 'Inter, sans-serif' }}>
      Chargement des membres…
    </div>
  )

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Search + stats */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0EBE0', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email, boutique…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 13, outline: 'none', backgroundColor: '#FBF7F0', color: '#2C1810' }}
        />
        <span style={{ fontSize: 11, color: '#9A8A7A', whiteSpace: 'nowrap' }}>
          {membres.filter(m => m.plan === 'pro').length} Pro · {membres.filter(m => m.plan === 'max').length} MAX
        </span>
      </div>

      <div style={{ paddingBottom: 40 }}>
        {filtered.map(m => {
          const isExpanded   = expandedId === m.id
          const plan         = planCfg(m.plan)
          const isSaving     = saving === m.id
          const isProdSaving = saving === `p-${m.id}` || (m.producer ? saving === `p-${m.producer.id}` : false)

          return (
            <div key={m.id} style={{ borderBottom: '1px solid #F5F0E8' }}>

              {/* ── Collapsed row ── */}
              <div
                onClick={() => expand(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', backgroundColor: isExpanded ? '#F8F4ED' : 'transparent', transition: 'background 0.15s' }}
              >
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.avatar
                    ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 15, color: '#2D5A3D', fontWeight: 700 }}>{(m.name || m.email)[0]?.toUpperCase()}</span>}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1209' }}>
                      {m.name || <span style={{ color: '#9A8A7A' }}>Sans nom</span>}
                    </span>
                    {m.producer && (
                      <span style={{ fontSize: 10, color: '#2D5A3D', fontWeight: 700, backgroundColor: '#E8F2EB', padding: '1px 6px', borderRadius: 999 }}>
                        {PRO_TYPES.find(t => t.id === m.pro_type)?.label.split(' ')[0] ?? '🌿'} {m.producer.nom}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#B0A898' }}>
                    Inscrit {fmt(m.created_at)}{m.last_sign_in && ` · Actif ${fmt(m.last_sign_in)}`}
                  </p>
                </div>

                {/* Plan badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, backgroundColor: plan.activeBg, color: plan.activeColor }}>
                    {plan.icon} {plan.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#C0B8B0', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </div>
              </div>

              {/* ── Expanded panel ── */}
              {isExpanded && (
                <div style={{ backgroundColor: '#F8F4ED', borderTop: '1px solid #EDE8DF', padding: '16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {/* Fiche personnelle */}
                  <div>
                    <p style={secLabel}>Fiche personnelle</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {m.avatar && <img src={m.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 11, color: '#9A8A7A' }}>{m.email}</p>
                        </div>
                      </div>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="Nom affiché"
                        onClick={e => e.stopPropagation()}
                        style={inp}
                      />
                      <textarea
                        value={editBio}
                        onChange={e => setEditBio(e.target.value)}
                        placeholder="Bio courte (optionnel)"
                        onClick={e => e.stopPropagation()}
                        rows={2}
                        style={{ ...inp, resize: 'none', lineHeight: 1.5 }}
                      />
                    </div>
                  </div>

                  {/* Abonnement */}
                  <div>
                    <p style={secLabel}>Abonnement</p>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {PLANS.map(p => (
                        <button
                          key={p.id}
                          onClick={e => { e.stopPropagation(); setEditPlan(p.id) }}
                          style={{
                            flex: 1, padding: '9px 4px', borderRadius: 9, cursor: 'pointer',
                            border: editPlan === p.id ? `2px solid ${p.activeColor}` : '1.5px solid #E0D8CE',
                            backgroundColor: editPlan === p.id ? p.activeBg : '#fff',
                            color: editPlan === p.id ? p.activeColor : '#B0A898',
                            fontSize: 11, fontWeight: 800, transition: 'all 0.15s',
                          }}
                        >
                          {p.icon} {p.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 11, color: '#7A6A5A', lineHeight: 1.5 }}>
                      {PLANS.find(p => p.id === editPlan)?.desc}
                    </p>

                    {/* Type pro — pour Pro et Max */}
                    {(editPlan === 'pro' || editPlan === 'max') && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ ...secLabel, marginBottom: 6 }}>Type de profil professionnel</p>
                        <select
                          value={editProType}
                          onChange={e => setEditProType(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          style={{ ...inp, cursor: 'pointer' }}
                        >
                          <option value="">— Sélectionner —</option>
                          {PRO_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </div>
                    )}

                    <button
                      onClick={e => saveMember(e, m)}
                      disabled={isSaving}
                      style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', backgroundColor: '#2C1810', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isSaving ? 0.6 : 1 }}
                    >
                      {isSaving ? 'Enregistrement…' : 'Sauvegarder les modifications'}
                    </button>
                    {saveError && (
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#C4622D', textAlign: 'center' }}>⚠ {saveError}</p>
                    )}
                  </div>

                  {/* Fiche annuaire — Max seulement */}
                  {editPlan === 'max' && (
                    <div style={{ paddingTop: 14, borderTop: '1px solid #E8E0D5' }}>
                      <p style={secLabel}>Fiche dans l&apos;annuaire</p>

                      {m.producer ? (
                        <>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            {m.producer.photo && (
                              <img src={m.producer.photo} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                            )}
                            <input
                              value={editNom} onChange={e => setEditNom(e.target.value)}
                              placeholder="Nom de la boutique"
                              onClick={e => e.stopPropagation()}
                              style={{ ...inp, flex: 2 }}
                            />
                            <input
                              value={editCommune} onChange={e => setEditCommune(e.target.value)}
                              placeholder="Commune"
                              onClick={e => e.stopPropagation()}
                              style={{ ...inp, flex: 1 }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={e => saveProducer(e, m.producer!.id)}
                              disabled={isProdSaving}
                              style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isProdSaving ? 0.6 : 1 }}
                            >
                              {isProdSaving ? '…' : 'Sauvegarder la fiche'}
                            </button>
                            <button
                              onClick={e => removeProducer(e, m.producer!.id)}
                              disabled={isProdSaving}
                              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8D0C8', backgroundColor: '#FFF8F5', color: '#C4622D', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Retirer
                            </button>
                          </div>
                          <p style={{ margin: '8px 0 0', fontSize: 10, color: '#B0A898' }}>
                            Pour éditer les produits, photos et contacts complets → section Annuaire
                          </p>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9A8A7A' }}>Pas encore de fiche dans l&apos;annuaire.</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={editNom} onChange={e => setEditNom(e.target.value)}
                              placeholder="Nom de la boutique / ferme"
                              onClick={e => e.stopPropagation()}
                              style={{ ...inp, flex: 1 }}
                            />
                            <button
                              onClick={e => createProducer(e, m)}
                              disabled={!editNom.trim() || isProdSaving}
                              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!editNom.trim() || isProdSaving) ? 0.5 : 1 }}
                            >
                              {isProdSaving ? '…' : '+ Créer'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9A8A7A', fontSize: 13 }}>
            Aucun membre trouvé.
          </div>
        )}
      </div>
    </div>
  )
}
