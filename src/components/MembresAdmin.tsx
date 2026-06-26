'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PLANS_INFO, PLAN_ORDER, type Plan } from '@/lib/capabilities'

const PAGE_SIZE = 25  // rendu progressif : lignes affichées par paliers de scroll

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
interface Etab { id: string; nom: string; plan: string; photos: string[] }
interface Membre {
  id: string; email: string; name: string; avatar: string
  created_at: string; last_sign_in: string | null
  plan: Plan; pro_type: string | null
  display_name: string | null; bio: string | null
  producer: Producer | null
  etablissements: Etab[]
}

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 12, outline: 'none', backgroundColor: '#fff', color: '#2C1810', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-body), sans-serif' }
const secLabel: React.CSSProperties = { margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#9A8A7A', textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function MembresAdmin() {
  const [membres, setMembres]   = useState<Membre[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving]     = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

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

  const deleteMember = async (e: React.MouseEvent, membre: Membre) => {
    e.stopPropagation()
    if (!confirm(`Supprimer DÉFINITIVEMENT le compte de ${membre.email} ?\n\nToutes ses annonces, événements, posts, messages et fiches pro seront effacés. Cette action est irréversible.`)) return
    setSaving(`del-${membre.id}`)
    setSaveError(null)
    const t = await token()
    const res = await fetch(`/api/admin/membres/${membre.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setSaveError(d.error ?? `Erreur ${res.status}`)
      setSaving(null)
      return
    }
    await fetchAll()
    setSaving(null)
    setExpandedId(null)
  }

  const changeEmail = async (e: React.MouseEvent, membre: Membre) => {
    e.stopPropagation()
    const next = window.prompt(`Nouvelle adresse email pour ${membre.email} :`, membre.email)
    if (next == null) return
    const email = next.trim().toLowerCase()
    if (!email || email === membre.email.toLowerCase()) return
    if (!confirm(`Changer l'email de ce membre en :\n${email}\n\n(override admin, sans confirmation par mail — auth + profil + Stripe)`)) return
    setSaving(`mail-${membre.id}`)
    setSaveError(null)
    const t = await token()
    const res = await fetch('/api/admin/membres/change-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ user_id: membre.id, email }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setSaveError(d.error ?? `Erreur ${res.status}`)
      setSaving(null)
      return
    }
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
  const planCfg = (p: Plan) => PLANS_INFO[p] ?? PLANS_INFO.basic

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return membres
    return membres.filter(m =>
      m.email.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.producer?.nom ?? '').toLowerCase().includes(q) ||
      m.etablissements.some(e => e.nom.toLowerCase().includes(q))
    )
  }, [membres, search])

  // Stats globales (sur la liste complète, pas filtrée)
  const stats = useMemo(() => ({
    total:     membres.length,
    pro:       membres.filter(m => m.plan === 'pro').length,
    habitants: membres.filter(m => m.plan === 'habitants').length,
    basic:     membres.filter(m => m.plan === 'basic').length,
    fiches:    membres.filter(m => m.etablissements.length > 0).length,
  }), [membres])

  // Rendu progressif : on repart à PAGE_SIZE quand la recherche change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search])

  // Charge le palier suivant quand le sentinel entre dans le viewport (scroll)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  const visible = filtered.slice(0, visibleCount)

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-body), sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px' }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, minWidth: 78, height: 56, borderRadius: 12, backgroundColor: '#F2EDE4' }} />
        ))}
      </div>
      <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid #F0EBE0' }}>
        <div style={{ height: 36, borderRadius: 8, backgroundColor: '#F2EDE4' }} />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F5F0E8' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#F2EDE4', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: '40%', height: 11, borderRadius: 4, backgroundColor: '#F2EDE4', marginBottom: 6 }} />
            <div style={{ width: '65%', height: 9, borderRadius: 4, backgroundColor: '#F5F0E8' }} />
          </div>
          <div style={{ width: 64, height: 20, borderRadius: 999, backgroundColor: '#F2EDE4' }} />
        </div>
      ))}
    </div>
  )

  async function cleanupOrphans() {
    if (saving === 'cleanup') return
    if (!confirm('Nettoyer les profils orphelins (user supprimé d\'auth mais profile resté en DB) ?')) return
    setSaving('cleanup')
    setSaveError(null)
    const t = await token()
    const res = await fetch('/api/admin/cleanup-orphan-profiles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaveError(d.error ?? `Erreur ${res.status}`)
    } else {
      alert(`${d.deleted ?? 0} profil(s) orphelin(s) supprimé(s)`)
      await fetchAll()
    }
    setSaving(null)
  }

  return (
    <div style={{ fontFamily: 'var(--font-body), sans-serif' }}>
      {/* Cartes de stats */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px', overflowX: 'auto' }}>
        <StatCard label="Membres"     value={stats.total}     color="#2C1810" bg="#F5F0E8" />
        <StatCard label="Partenaires" value={stats.pro}       color="#3A5BC7" bg="#EEF3FF" />
        <StatCard label="Habitants"   value={stats.habitants} color="#2D5A3D" bg="#E8F2EB" />
        <StatCard label="Basic"       value={stats.basic}     color="#7A6A5A" bg="#F0EBE0" />
        <StatCard label="Fiches pro"  value={stats.fiches}    color="#C4622D" bg="#FFF0E5" />
      </div>

      {/* Search + cleanup orphelins */}
      <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid #F0EBE0', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email, boutique…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E0D8CE', fontSize: 13, outline: 'none', backgroundColor: '#FBF7F0', color: '#2C1810' }}
        />
        <button
          onClick={cleanupOrphans}
          disabled={saving === 'cleanup'}
          title="Supprimer les profils orphelins (membres déjà supprimés d'auth mais profile resté)"
          style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid #F0D4C8', backgroundColor: '#FFF5F1', color: '#B53A22', fontSize: 11, fontWeight: 700, cursor: saving === 'cleanup' ? 'default' : 'pointer', opacity: saving === 'cleanup' ? 0.6 : 1, whiteSpace: 'nowrap', fontFamily: 'inherit' }}
        >
          {saving === 'cleanup' ? 'Nettoyage…' : '🧹 Orphelins'}
        </button>
      </div>

      <div style={{ paddingBottom: 40 }}>
        {visible.map(m => {
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
                    {m.etablissements.map(e => (
                      <span key={e.id} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                        backgroundColor: e.plan === 'pro' ? '#EEF3FF' : '#F0EBE0',
                        color: e.plan === 'pro' ? '#3A5BC7' : '#7A6A5A',
                      }}>🏪 {e.nom}</span>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#B0A898' }}>
                    Inscrit {fmt(m.created_at)}{m.last_sign_in && ` · Actif ${fmt(m.last_sign_in)}`}
                  </p>
                </div>

                {/* Plan badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, backgroundColor: plan.bgColor, color: plan.color }}>
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
                          <p style={{ margin: 0, fontSize: 11, color: '#9A8A7A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
                        </div>
                        <button
                          onClick={e => changeEmail(e, m)}
                          disabled={saving === `mail-${m.id}`}
                          style={{ flexShrink: 0, padding: '5px 9px', borderRadius: 8, border: '1px solid #E0D8CE', background: '#fff', color: '#7A6A5A', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', opacity: saving === `mail-${m.id}` ? 0.6 : 1 }}
                        >
                          {saving === `mail-${m.id}` ? '…' : '✎ Email'}
                        </button>
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
                      {PLAN_ORDER.map(id => {
                        const info = PLANS_INFO[id]
                        return (
                          <button
                            key={id}
                            onClick={e => { e.stopPropagation(); setEditPlan(id) }}
                            style={{
                              flex: 1, padding: '9px 4px', borderRadius: 9, cursor: 'pointer',
                              border: editPlan === id ? `2px solid ${info.color}` : '1.5px solid #E0D8CE',
                              backgroundColor: editPlan === id ? info.bgColor : '#fff',
                              color: editPlan === id ? info.color : '#B0A898',
                              fontSize: 11, fontWeight: 800, transition: 'all 0.15s',
                            }}
                          >
                            {info.icon} {info.label}
                          </button>
                        )
                      })}
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 11, color: '#7A6A5A', lineHeight: 1.5 }}>
                      {PLANS_INFO[editPlan].tagline} · {PLANS_INFO[editPlan].features.slice(0, 3).join(' · ')}
                    </p>

                    {/* Type pro — pour Partenaire Local */}
                    {editPlan === 'pro' && (
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

                    {/* Zone danger — suppression définitive du compte */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E8C9BF' }}>
                      <button
                        onClick={e => deleteMember(e, m)}
                        disabled={saving === `del-${m.id}`}
                        style={{ width: '100%', padding: '9px', borderRadius: 9, border: '1px solid #F0D4C8', backgroundColor: '#FFF5F1', color: '#B53A22', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: saving === `del-${m.id}` ? 0.6 : 1, fontFamily: 'var(--font-body), sans-serif' }}
                      >
                        {saving === `del-${m.id}` ? 'Suppression…' : 'Supprimer définitivement ce compte'}
                      </button>
                    </div>
                  </div>

                  {/* Fiche annuaire (producteur) — Partenaire Local */}
                  {editPlan === 'pro' && (
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

                  {/* Établissements revendiqués */}
                  {m.etablissements.length > 0 && (
                    <div style={{ paddingTop: 14, borderTop: '1px solid #E8E0D5' }}>
                      <p style={secLabel}>Établissements revendiqués</p>
                      {m.etablissements.map(e => (
                        <a key={e.id} href={`/etablissement/${e.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 9, padding: '7px 10px', marginBottom: 6 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flexShrink: 0, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {e.photos?.[0] ? <img src={e.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14 }}>🏪</span>}
                          </div>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nom}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, padding: '2px 7px',
                            backgroundColor: e.plan === 'pro' ? '#EEF3FF' : '#F0EBE0',
                            color: e.plan === 'pro' ? '#3A5BC7' : '#7A6A5A',
                          }}>{e.plan === 'pro' ? 'Partenaire' : 'Basic'}</span>
                        </a>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>
          )
        })}

        {/* Sentinel : charge le palier suivant en scrollant */}
        {visible.length < filtered.length && (
          <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '18px 0', color: '#B0A898', fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
              {visible.length} / {filtered.length}
            </span>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9A8A7A', fontSize: 13 }}>
            Aucun membre trouvé.
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ flex: '1 0 auto', minWidth: 78, padding: '10px 12px', borderRadius: 12, backgroundColor: bg, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
    </div>
  )
}
