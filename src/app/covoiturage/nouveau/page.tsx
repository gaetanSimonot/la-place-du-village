'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import type { CovoitFormInput } from '@/lib/covoiturage'

const todayIso = () => new Date().toISOString().slice(0, 10)

const empty: CovoitFormInput = {
  depart: '', destination: '', date_trajet: todayIso(),
  heure_depart: '', prix: 0, places: 1,
  point_recup: '', fumeur: false, animaux: false, bagages: true,
  description: '',
}

export default function NouveauCovoitPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [form, setForm] = useState<CovoitFormInput>(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/covoiturage/nouveau')
  }, [authLoading, user, openAuthModal])

  const set = <K extends keyof CovoitFormInput>(k: K, v: CovoitFormInput[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { openAuthModal(); return }
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/covoiturages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      router.push(`/covoiturage/${d.covoiturage.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/covoiturage"
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
            Proposer un trajet
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
                value={form.point_recup ?? ''}
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
            <Field label="Heure" className="w-[120px]">
              <input
                type="time"
                value={form.heure_depart ?? ''}
                onChange={e => set('heure_depart', e.target.value)}
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
              />
            </Field>
          </div>
        </section>

        {/* Prix + places */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Tarif &amp; places</h3>
          <div className="flex gap-2">
            <Field label="Prix / personne" hint="0 = gratuit" className="flex-1">
              <div className="flex items-center rounded-xl border border-bord bg-white pr-3">
                <input
                  type="number"
                  min={0}
                  max={999}
                  step={0.5}
                  value={form.prix}
                  onChange={e => set('prix', Math.max(0, Math.min(999, Number(e.target.value))))}
                  className="block w-full bg-transparent px-3 py-2.5 text-[14px] text-texte outline-none"
                />
                <span className="text-[13px] font-bold text-texte-doux">€</span>
              </div>
            </Field>
            <Field label="Places dispo" className="w-[110px]">
              <input
                type="number"
                min={1}
                max={8}
                value={form.places}
                onChange={e => set('places', Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1)))}
                className="block w-full rounded-xl border border-bord bg-white px-3 py-2.5 text-[14px] text-texte outline-none focus:border-primary"
              />
            </Field>
          </div>
        </section>

        {/* Préférences */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Préférences</h3>
          <div className="grid grid-cols-3 gap-2">
            <Toggle
              icon="🚭"
              label="Fumeur"
              hint={form.fumeur ? 'Accepté' : 'Non-fumeur'}
              active={form.fumeur}
              onChange={v => set('fumeur', v)}
            />
            <Toggle
              icon="🐶"
              label="Animaux"
              hint={form.animaux ? 'Acceptés' : 'Refusés'}
              active={form.animaux}
              onChange={v => set('animaux', v)}
            />
            <Toggle
              icon="🎒"
              label="Bagages"
              hint={form.bagages ? 'Acceptés' : 'Pas de gros'}
              active={form.bagages}
              onChange={v => set('bagages', v)}
            />
          </div>
        </section>

        {/* Description */}
        <section className="rounded-2xl border border-bord bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <h3 className="m-0 mb-3 font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>Détails (optionnel)</h3>
          <textarea
            value={form.description ?? ''}
            onChange={e => set('description', e.target.value.slice(0, 500))}
            placeholder="Voiture, point de retour, contraintes horaires…"
            rows={3}
            className="block w-full resize-none rounded-xl border border-bord bg-white px-3 py-2.5 text-[13px] text-texte outline-none focus:border-primary"
          />
          <div className="mt-1 text-right text-[10px] text-texte-doux">
            {(form.description ?? '').length}/500
          </div>
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
          {saving ? 'Publication…' : 'Publier le trajet'}
        </button>
      </div>
    </main>
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
