'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import type { CovoitFormInput, Covoiturage } from '@/lib/covoiturage'

const todayIso = () => new Date().toISOString().slice(0, 10)

interface FormState {
  depart: string
  destination: string
  date_trajet: string
  heure_depart: string  // "HH:MM" ou "" libre
  prix: string          // string pour éviter NaN sur input vide
  places: string
  point_recup: string
  vehicule: string
  fumeur: boolean
  animaux: boolean
  bagages: boolean
  description: string
}

const empty: FormState = {
  depart: '', destination: '', date_trajet: todayIso(),
  heure_depart: '', prix: '', places: '1',
  point_recup: '', vehicule: '',
  fumeur: false, animaux: false, bagages: true,
  description: '',
}

function NouveauCovoitInner() {
  const router = useRouter()
  const params = useSearchParams()
  const editId = params.get('id')
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [form, setForm] = useState<FormState>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!editId)

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/covoiturage/nouveau' + (editId ? `?id=${editId}` : ''))
  }, [authLoading, user, openAuthModal, editId])

  // En mode édition : charger le trajet existant
  useEffect(() => {
    if (!editId) return
    let cancel = false
    ;(async () => {
      const res = await fetch(`/api/covoiturages/${editId}`)
      if (cancel) return
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Trajet introuvable'); setLoaded(true); return }
      const c = d.covoiturage as Covoiturage
      setForm({
        depart: c.depart,
        destination: c.destination,
        date_trajet: c.date_trajet,
        heure_depart: c.heure_depart ?? '',
        prix: c.prix > 0 ? String(c.prix) : '',
        places: String(c.places),
        point_recup: c.point_recup ?? '',
        vehicule: c.vehicule ?? '',
        fumeur: c.fumeur,
        animaux: c.animaux,
        bagages: c.bagages,
        description: c.description ?? '',
      })
      setLoaded(true)
    })()
    return () => { cancel = true }
  }, [editId])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { openAuthModal(); return }
    setSaving(true); setError(null)

    // Validation/parsing locale propre (string → number)
    const prixNum = form.prix.trim() === '' ? 0 : Number(form.prix.replace(',', '.'))
    const placesNum = parseInt(form.places || '1', 10)
    if (Number.isNaN(prixNum) || prixNum < 0 || prixNum > 999) {
      setError('Prix invalide (0 à 999 €)'); setSaving(false); return
    }
    if (Number.isNaN(placesNum) || placesNum < 1 || placesNum > 8) {
      setError('Places entre 1 et 8'); setSaving(false); return
    }
    // Validation heure souple : vide OU HH ou HHhMM ou HH:MM
    const heure = form.heure_depart.trim()
    if (heure && !/^([01]?\d|2[0-3])[h:]?([0-5]\d)?$/.test(heure)) {
      setError('Heure invalide (ex: 08:30)'); setSaving(false); return
    }
    const heureNormalisee = heure ? heure.replace('h', ':').padStart(5, '0') : ''

    const payload: CovoitFormInput = {
      depart:       form.depart.trim(),
      destination:  form.destination.trim(),
      date_trajet:  form.date_trajet,
      heure_depart: heureNormalisee || null,
      prix:         prixNum,
      places:       placesNum,
      point_recup:  form.point_recup.trim() || null,
      vehicule:     form.vehicule.trim() || null,
      fumeur:       form.fumeur,
      animaux:      form.animaux,
      bagages:      form.bagages,
      description:  form.description.trim() || null,
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const url = editId ? `/api/covoiturages/${editId}` : '/api/covoiturages'
      const method = editId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      router.push(`/covoiturage/${d.covoiturage.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  if (!loaded) {
    return <main className="min-h-[100dvh] bg-creme p-6 font-inter"><p className="text-texte-doux">Chargement…</p></main>
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href={editId ? `/covoiturage/${editId}` : '/covoiturage'}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            {editId ? 'Modifier le trajet' : 'Proposer un trajet'}
          </div>
        </div>
        <div className="w-10" />
      </div>

      <form onSubmit={submit} className="space-y-4 px-4 pt-5">
        {/* Itinéraire */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Itinéraire</h3>
          <div className="space-y-2.5">
            <Field label="Départ" required>
              <input
                value={form.depart}
                onChange={e => set('depart', e.target.value)}
                placeholder="Ganges"
                maxLength={120}
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
              />
            </Field>
            <Field label="Destination" required>
              <input
                value={form.destination}
                onChange={e => set('destination', e.target.value)}
                placeholder="Montpellier"
                maxLength={120}
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
              />
            </Field>
            <Field label="Point de récupération" hint="ex: Parking Carrefour Ganges">
              <input
                value={form.point_recup}
                onChange={e => set('point_recup', e.target.value)}
                placeholder="Optionnel"
                maxLength={200}
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
              />
            </Field>
          </div>
        </section>

        {/* Date + heure */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Quand ?</h3>
          <div className="flex gap-2">
            <Field label="Date" required className="flex-1">
              <input
                type="date"
                value={form.date_trajet}
                min={todayIso()}
                onChange={e => set('date_trajet', e.target.value)}
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
              />
            </Field>
            <Field label="Heure" hint="ex: 08:30" className="w-[130px]">
              <input
                type="text"
                inputMode="numeric"
                value={form.heure_depart}
                onChange={e => set('heure_depart', e.target.value.slice(0, 5))}
                placeholder="08:30"
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-center text-[14px] tabular-nums text-texte outline-none focus:border-primary"
              />
            </Field>
          </div>
        </section>

        {/* Prix + places */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Tarif &amp; places</h3>
          <div className="flex gap-2">
            <Field label="Prix / personne" hint="vide = gratuit" className="flex-1">
              <div className="flex items-center rounded-xl border border-bord bg-white pr-3 focus-within:border-primary">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.prix}
                  onChange={e => {
                    // Accepte chiffres + , ou . — pas plus de 5 caractères
                    const v = e.target.value.replace(/[^0-9.,]/g, '').slice(0, 6)
                    set('prix', v)
                  }}
                  placeholder="0"
                  className="block w-full bg-transparent px-3 py-2.5 text-[14px] tabular-nums text-texte outline-none"
                />
                <span className="text-[13px] font-bold text-texte-doux">€</span>
              </div>
            </Field>
            <Field label="Places" className="w-[100px]">
              <div className="flex items-center rounded-xl border border-bord bg-white focus-within:border-primary">
                <button
                  type="button"
                  onClick={() => set('places', String(Math.max(1, parseInt(form.places || '1', 10) - 1)))}
                  className="h-[42px] w-[34px] shrink-0 rounded-l-xl text-[18px] font-bold text-texte-doux hover:bg-cremeDeep"
                  aria-label="-1"
                >−</button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.places}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 1)
                    set('places', v || '1')
                  }}
                  className="block w-full bg-transparent py-2.5 text-center text-[14px] font-bold tabular-nums text-texte outline-none"
                />
                <button
                  type="button"
                  onClick={() => set('places', String(Math.min(8, parseInt(form.places || '1', 10) + 1)))}
                  className="h-[42px] w-[34px] shrink-0 rounded-r-xl text-[18px] font-bold text-texte-doux hover:bg-cremeDeep"
                  aria-label="+1"
                >+</button>
              </div>
            </Field>
          </div>
        </section>

        {/* Véhicule */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Véhicule (optionnel)</h3>
          <input
            value={form.vehicule}
            onChange={e => set('vehicule', e.target.value.slice(0, 80))}
            placeholder="Ex: Renault Clio grise · diesel"
            className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
          />
        </section>

        {/* Préférences */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Préférences</h3>
          <div className="grid grid-cols-3 gap-2">
            <Toggle icon="🚭" label="Fumeur"  hint={form.fumeur  ? 'Accepté' : 'Non-fumeur'} active={form.fumeur}  onChange={v => set('fumeur',  v)} />
            <Toggle icon="🐶" label="Animaux" hint={form.animaux ? 'Acceptés' : 'Refusés'}   active={form.animaux} onChange={v => set('animaux', v)} />
            <Toggle icon="🎒" label="Bagages" hint={form.bagages ? 'Acceptés' : 'Pas de gros'} active={form.bagages} onChange={v => set('bagages', v)} />
          </div>
        </section>

        {/* Description */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Détails (optionnel)</h3>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value.slice(0, 500))}
            placeholder="Voiture, point de retour, contraintes horaires…"
            rows={3}
            className="block w-full resize-none rounded-xl border border-bord bg-white px-3 py-2.5 text-[13px] text-texte outline-none focus:border-primary"
          />
          <div className="mt-1 text-right text-[10px] text-texte-doux">{form.description.length}/500</div>
        </section>

        {error && (
          <p className="m-0 rounded-xl border bg-[#FBE9E5] px-3.5 py-3 text-[13px] text-[#B53A22]" style={{ borderColor: '#F5C8A8' }}>
            {error}
          </p>
        )}
      </form>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white p-3.5" style={{ borderColor: '#EDE8E0' }}>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-none bg-primary text-[14px] font-bold text-white disabled:opacity-55"
        >
          {saving ? (editId ? 'Enregistrement…' : 'Publication…') : (editId ? 'Enregistrer les modifications' : 'Publier le trajet')}
        </button>
      </div>
    </main>
  )
}

export default function NouveauCovoitPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-creme p-6 font-inter"><p className="text-texte-doux">Chargement…</p></main>}>
      <NouveauCovoitInner />
    </Suspense>
  )
}

function Field({
  label, hint, required, className = '', children,
}: {
  label: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-texte-doux">
        {label}{required && <span className="ml-0.5 text-accent">*</span>}
        {hint && <span className="ml-1.5 normal-case font-medium text-texte-tres-doux">— {hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  icon, label, hint, active, onChange,
}: {
  icon: string
  label: string
  hint: string
  active: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-colors"
      style={{
        background:  active ? '#E8F2EB' : '#fff',
        borderColor: active ? '#2D5A3D' : '#E8E0D4',
        color:       active ? '#2D5A3D' : '#7A6A5A',
      }}
    >
      <span className="text-[20px] leading-none">{icon}</span>
      <span className="text-[11px] font-bold leading-tight">{label}</span>
      <span className="text-[9.5px] font-medium opacity-75 leading-tight">{hint}</span>
    </button>
  )
}
