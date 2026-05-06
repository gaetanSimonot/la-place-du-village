'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import type { Etablissement } from '@/lib/types'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAY_KEYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const ETAB_TYPE_OPTIONS = ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite'] as const

const INPUT_S: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E0D8CE', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#2C1810', backgroundColor: '#FDFAF6' }
const LABEL_S: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B5E4E', textTransform: 'uppercase', letterSpacing: '0.04em' }

function AdminEditDrawer({ etab, onClose, onSaved }: { etab: Etablissement; onClose: () => void; onSaved: (patch: Partial<Etablissement>) => void }) {
  const [form, setForm] = useState({
    nom: etab.nom, type: etab.type, commune: etab.commune ?? '', adresse: etab.adresse ?? '',
    description_courte: etab.description_courte ?? '', description_longue: etab.description_longue ?? '',
    contact_tel: etab.contact_tel ?? '', contact_whatsapp: etab.contact_whatsapp ?? '', site_web: etab.site_web ?? '',
    statut: etab.statut, plan: etab.plan, is_featured: etab.is_featured,
    note_google: etab.note_google?.toString() ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    const patch = {
      nom: form.nom, type: form.type,
      commune: form.commune || null, adresse: form.adresse || null,
      description_courte: form.description_courte || null, description_longue: form.description_longue || null,
      contact_tel: form.contact_tel || null, contact_whatsapp: form.contact_whatsapp || null, site_web: form.site_web || null,
      statut: form.statut, plan: form.plan, is_featured: form.is_featured,
      note_google: form.note_google ? parseFloat(form.note_google) : null,
    }
    const res = await fetch(`/api/etablissements/${etab.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => { onSaved(patch as Partial<Etablissement>); onClose() }, 900) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.42)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 48px', fontFamily: 'Inter, sans-serif', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />
        {saved ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ fontWeight: 800, fontSize: 17, color: '#2C1810', margin: 0 }}>Sauvegardé !</p>
          </div>
        ) : (
          <>
            <p style={{ fontWeight: 800, fontSize: 17, color: '#2C1810', margin: '0 0 16px' }}>✏️ Éditer l&apos;établissement</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={LABEL_S}>Nom</label><input value={form.nom} onChange={e => set('nom', e.target.value)} style={INPUT_S} /></div>
              <div>
                <label style={LABEL_S}>Type</label>
                <select value={form.type} onChange={e => set('type', e.target.value)} style={INPUT_S}>
                  {ETAB_TYPE_OPTIONS.map(t => <option key={t} value={t}>{ETAB_TYPES[t]?.label ?? t}</option>)}
                </select>
              </div>
              <div><label style={LABEL_S}>Commune</label><input value={form.commune} onChange={e => set('commune', e.target.value)} style={INPUT_S} /></div>
              <div><label style={LABEL_S}>Adresse</label><input value={form.adresse} onChange={e => set('adresse', e.target.value)} style={INPUT_S} /></div>
              <div><label style={LABEL_S}>Description courte</label><input value={form.description_courte} onChange={e => set('description_courte', e.target.value)} style={INPUT_S} /></div>
              <div><label style={LABEL_S}>Description longue</label><textarea value={form.description_longue} onChange={e => set('description_longue', e.target.value)} rows={3} style={{ ...INPUT_S, resize: 'vertical' as const }} /></div>
              <div><label style={LABEL_S}>Tél</label><input value={form.contact_tel} onChange={e => set('contact_tel', e.target.value)} style={INPUT_S} /></div>
              <div><label style={LABEL_S}>WhatsApp</label><input value={form.contact_whatsapp} onChange={e => set('contact_whatsapp', e.target.value)} style={INPUT_S} /></div>
              <div><label style={LABEL_S}>Site web</label><input value={form.site_web} onChange={e => set('site_web', e.target.value)} style={INPUT_S} /></div>
              <div><label style={LABEL_S}>Note Google</label><input value={form.note_google} onChange={e => set('note_google', e.target.value)} type="number" min="1" max="5" step="0.1" style={INPUT_S} /></div>
              <div>
                <label style={LABEL_S}>Statut</label>
                <select value={form.statut} onChange={e => set('statut', e.target.value)} style={INPUT_S}>
                  {['actif', 'publie', 'archive', 'en_attente'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL_S}>Plan</label>
                <select value={form.plan} onChange={e => set('plan', e.target.value)} style={INPUT_S}>
                  <option value="basic">Basic</option><option value="pro">Pro</option><option value="max">Max</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <input type="checkbox" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)} id="etab_feat" style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <label htmlFor="etab_feat" style={{ fontSize: 14, fontWeight: 600, color: '#2C1810', cursor: 'pointer' }}>Mis en avant</label>
              </div>
              <button onClick={save} disabled={saving}
                style={{ marginTop: 8, padding: 14, borderRadius: 16, border: 'none', backgroundColor: saving ? '#D0C8C0' : '#2D5A3D', color: '#fff', fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ClaimModal({ etabId, etabNom, onClose, onSuccess }: { etabId: string; etabNom: string; onClose: () => void; onSuccess: () => void }) {
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const INPUT: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E0D8CE', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box', color: '#2C1810', backgroundColor: '#FDFAF6' }
  const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B5E4E', textTransform: 'uppercase', letterSpacing: '0.04em' }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch(`/api/etablissements/${etabId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: contact.trim(), message: message.trim() }),
    })
    setLoading(false)
    if (res.ok) { setDone(true); setTimeout(onSuccess, 1500) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.42)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 48px', fontFamily: 'Inter, sans-serif', maxHeight: '85dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ fontWeight: 800, fontSize: 17, color: '#2C1810', margin: '0 0 6px' }}>Demande envoyée !</p>
            <p style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.5, margin: 0 }}>Nous vous contacterons pour vérifier et valider.</p>
          </div>
        ) : (
          <>
            <p style={{ fontWeight: 800, fontSize: 17, color: '#2C1810', margin: '0 0 4px' }}>Revendiquer &laquo;{etabNom}&raquo;</p>
            <p style={{ fontSize: 13, color: '#8A8A8A', margin: '0 0 18px', lineHeight: 1.5 }}>Vous êtes le propriétaire ou le gérant ? Envoyez-nous une demande, nous validerons et vous donnerons accès à la fiche.</p>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Contact (tél, email…)</label>
                <input value={contact} onChange={e => setContact(e.target.value)} placeholder="06 12 34 56 78" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Message (optionnel)</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Précisez si besoin…" style={{ ...INPUT, resize: 'vertical' as const }} />
              </div>
              <button type="submit" disabled={loading}
                style={{ padding: 14, borderRadius: 16, border: 'none', backgroundColor: loading ? '#D0C8C0' : '#2D5A3D', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {loading ? 'Envoi…' : 'Envoyer ma demande →'}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  )
}

export default function EtablissementPageClient({ id, onBack }: { id: string; onBack?: () => void }) {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [etab, setEtab] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [claimOpen, setClaimOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const isAdmin = user?.email === 'gaetan.simonot@gmail.com'

  useEffect(() => {
    fetch(`/api/etablissements/${id}`)
      .then(r => r.json())
      .then(d => { setEtab(d.etablissement); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  function goBack() {
    if (onBack) { onBack(); return }
    if (window.history.length > 1) router.back()
    else router.push('/')
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#8A8A8A', fontSize: 14 }}>
      Chargement…
    </div>
  )

  if (!etab) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#8A8A8A', fontSize: 14 }}>
      Établissement introuvable.
    </div>
  )

  const typeInfo = ETAB_TYPES[etab.type]
  const photos = etab.photos ?? []
  const isOwner = !!user && etab.user_id === user.id
  const horairesEntries = etab.horaires ? DAY_KEYS.map((k, i) => ({ day: DAYS[i], val: (etab.horaires as Record<string, string>)[k] ?? null })) : []

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF6', fontFamily: 'Inter, sans-serif', paddingBottom: 32 }}>
      {/* Header / Photos */}
      <div style={{ position: 'relative', height: photos.length > 0 ? 280 : 120, backgroundColor: typeInfo.bg, overflow: 'hidden' }}>
        {photos.length > 0 && (
          <>
            <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {photos.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
                {photos.map((_, i) => (
                  <button key={i} onClick={() => setPhotoIdx(i)}
                    style={{ width: i === photoIdx ? 20 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', backgroundColor: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.5)', padding: 0, transition: 'width 0.2s' }} />
                ))}
              </div>
            )}
          </>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 40%)' }} />
        <button onClick={goBack}
          style={{ position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.38)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        {isAdmin && (
          <button onClick={() => setEditOpen(true)}
            style={{ position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.38)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        )}
      </div>

      {/* Contenu principal */}
      <div style={{ padding: '20px 18px 0' }}>
        {/* Badge type + nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: typeInfo.color, backgroundColor: typeInfo.bg, borderRadius: 999, padding: '3px 10px', letterSpacing: '0.04em' }}>
            {typeInfo.emoji} {typeInfo.label}
          </span>
          {etab.is_featured && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#B45309', backgroundColor: '#FEF3C7', borderRadius: 999, padding: '3px 8px' }}>★ Mis en avant</span>
          )}
        </div>

        <h1 style={{ fontWeight: 800, fontSize: 22, color: '#1C1917', margin: '0 0 4px', lineHeight: 1.2 }}>{etab.nom}</h1>
        {etab.commune && <p style={{ fontSize: 13, color: '#6B5E4E', margin: '0 0 4px' }}>📍 {etab.commune}{etab.adresse ? ` · ${etab.adresse}` : ''}</p>}
        {etab.note_google && (
          <p style={{ fontSize: 13, color: '#92400E', margin: '0 0 14px', fontWeight: 700 }}>
            ⭐ {etab.note_google.toFixed(1)} <span style={{ fontWeight: 400, color: '#6B5E4E' }}>Google</span>
          </p>
        )}

        {/* Description */}
        {etab.description_courte && (
          <p style={{ fontSize: 14, color: '#3C2C20', lineHeight: 1.6, margin: '0 0 6px', fontFamily: 'Lora, serif' }}>{etab.description_courte}</p>
        )}
        {etab.description_longue && (
          <p style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.6, margin: '0 0 16px', fontFamily: 'Lora, serif' }}>{etab.description_longue}</p>
        )}

        {/* Contacts */}
        {(etab.contact_tel || etab.contact_whatsapp || etab.site_web) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {etab.contact_tel && (
              <a href={`tel:${etab.contact_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, backgroundColor: '#F0F7F2', textDecoration: 'none' }}>
                <span style={{ fontSize: 18 }}>📞</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#2D5A3D' }}>{etab.contact_tel}</span>
              </a>
            )}
            {etab.contact_whatsapp && (
              <a href={`https://wa.me/${etab.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, backgroundColor: '#F0FDF4', textDecoration: 'none' }}>
                <span style={{ fontSize: 18 }}>💬</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>WhatsApp</span>
              </a>
            )}
            {etab.site_web && (
              <a href={etab.site_web} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, backgroundColor: '#F8F4EE', textDecoration: 'none' }}>
                <span style={{ fontSize: 18 }}>🌐</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etab.site_web.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>
        )}

        {/* Horaires */}
        {horairesEntries.length > 0 && horairesEntries.some(h => h.val) && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#6B5E4E', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Horaires</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {horairesEntries.map(({ day, val }) => val && (
                <div key={day} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#3C2C20' }}>
                  <span style={{ fontWeight: 600, width: 90 }}>{day}</span>
                  <span style={{ color: '#6B5E4E' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claim / Owner section */}
        {!isOwner && !etab.user_id && (
          <div style={{ padding: '14px 16px', borderRadius: 16, backgroundColor: '#F8F4EE', border: '1.5px dashed #D0C8C0', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#3C2C20', margin: '0 0 4px' }}>Vous gérez cet établissement ?</p>
            <p style={{ fontSize: 12, color: '#8A8A8A', lineHeight: 1.5, margin: '0 0 12px' }}>Revendiquez cette fiche pour la compléter et la gérer.</p>
            <button onClick={() => { if (!user) openAuthModal(); else setClaimOpen(true) }}
              style={{ padding: '10px 20px', borderRadius: 999, backgroundColor: '#2D5A3D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Revendiquer cette fiche
            </button>
          </div>
        )}

        {isOwner && (
          <div style={{ padding: '14px 16px', borderRadius: 16, backgroundColor: '#E8F2EB', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2D5A3D', margin: 0 }}>✓ Vous gérez cette fiche</p>
          </div>
        )}
      </div>

      {claimOpen && (
        <ClaimModal
          etabId={etab.id}
          etabNom={etab.nom}
          onClose={() => setClaimOpen(false)}
          onSuccess={() => setClaimOpen(false)}
        />
      )}
      {editOpen && (
        <AdminEditDrawer
          etab={etab}
          onClose={() => setEditOpen(false)}
          onSaved={patch => setEtab(prev => prev ? { ...prev, ...patch } : prev)}
        />
      )}
    </div>
  )
}
