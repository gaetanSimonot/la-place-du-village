'use client'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DisplaySettings, Profile } from '@/contexts/AuthContext'
import PushToggle from '../PushToggle'
import {
  Accordion,
  ToggleRow,
  RadioRow,
  I,
  DEFAULT_DISPLAY,
  deriveCurrentPrivacy,
  type PrivacyOption,
} from '../shared'

interface Props {
  profile: Profile
}

export default function ProfilTab({ profile }: Props) {
  const { patchProfileLocal } = useAuth()
  const [settings, setSettings] = useState<DisplaySettings>(profile.display_settings ?? DEFAULT_DISPLAY)
  const [privacy, setPrivacy]   = useState<PrivacyOption>(deriveCurrentPrivacy(profile.is_public, profile.searchable))

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  async function patchDisplay(key: keyof DisplaySettings, value: boolean) {
    const next = { ...settings, [key]: value }
    setSettings(next) // optimistic
    const token = await getToken()
    if (!token) return
    const res = await fetch('/api/profile/display-settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      setSettings(s => ({ ...s, [key]: !value })) // rollback
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Erreur')
      return
    }
    // Sync le context pour que /profil et les re-mounts du tab voient la nouvelle valeur
    patchProfileLocal({ display_settings: next })
  }

  async function patchPrivacy(option: PrivacyOption) {
    const prev = privacy
    setPrivacy(option) // optimistic
    const token = await getToken()
    if (!token) return
    const res = await fetch('/api/profile/privacy', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ option }),
    })
    if (!res.ok) {
      setPrivacy(prev)
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Erreur')
      return
    }
    // Sync le context (mapping option → 2 booléens)
    const map = {
      public:      { is_public: true,  searchable: true  },
      search_only: { is_public: false, searchable: true  },
      masque:      { is_public: false, searchable: false },
    } as const
    patchProfileLocal(map[option])
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Notifications push — directement en haut, toujours visible */}
      <PushToggle />

      {/* Accordéon « Mon profil » (niveau 1) — sous-sections repliables (niveau 2) */}
      <Accordion title="Mon profil" icon={I.user(18)} iconColor="#2D5A3D" defaultOpen>
        <Accordion title="Genre" icon={I.user(15)} variant="inner">
          <GenrePills profile={profile} />
        </Accordion>

        <Accordion title="Affichage de mon profil" icon={I.grid(15)} iconColor="#3A5D8C" variant="inner">
          <ToggleRow icon={I.image(16)}  label="Bannière"             sub="Photo de couverture visible"  checked={settings.banner}        onChange={v => patchDisplay('banner', v)} />
          <ToggleRow icon={I.text(16)}   label="Bio"                  sub="Présentation visible"         checked={settings.bio}           onChange={v => patchDisplay('bio', v)} />
          <ToggleRow icon={I.leaf(16)}   label="Ma fiche producteur"  sub="Vitrine pro visible"          checked={settings.fiche_pro}     onChange={v => patchDisplay('fiche_pro', v)} />
          <ToggleRow icon={I.spark(16)}  label="Module Profil utile"  sub="Offres, besoins, suggestions" checked={settings.module_utile}  onChange={v => patchDisplay('module_utile', v)} />
          <ToggleRow icon={I.heart(16)}  label="Pages suivies"        sub="Lieux & profils que tu suis"  checked={settings.pages_suivies} onChange={v => patchDisplay('pages_suivies', v)} />
          <ToggleRow icon={I.chat(16)}   label="Mes publications"     sub="Mur visible des autres"       checked={settings.publications}  onChange={v => patchDisplay('publications', v)} isLast />
        </Accordion>

        <Accordion title="Qui peut voir mon profil" icon={I.lock(15)} iconColor="#7C5C3B" variant="inner" isLast>
          <RadioRow
            icon={I.globe(16)}
            label="Public"
            sub="Visible dans l'annuaire et la recherche"
            selected={privacy === 'public'}
            onClick={() => patchPrivacy('public')}
          />
          <RadioRow
            icon={I.eye(16)}
            label="Visible en recherche seulement"
            sub="Masqué de l'annuaire, trouvable par recherche"
            selected={privacy === 'search_only'}
            onClick={() => patchPrivacy('search_only')}
          />
          <RadioRow
            icon={I.eyeOff(16)}
            label="Masqué"
            sub="N'apparaît ni dans l'annuaire ni dans la recherche"
            selected={privacy === 'masque'}
            onClick={() => patchPrivacy('masque')}
            isLast
          />
        </Accordion>
      </Accordion>
    </div>
  )
}

/* ── Genre : pills inline (contenu d'une sous-section) ─────────────── */
function GenrePills({ profile }: { profile: Profile }) {
  const { patchProfileLocal } = useAuth()
  const [current, setCurrent] = useState<'homme' | 'femme' | 'autre' | null>(profile.genre ?? null)
  const [saving, setSaving]   = useState(false)

  const OPTIONS: Array<{ value: 'homme' | 'femme' | 'autre' | null; label: string }> = [
    { value: 'homme', label: 'Homme' },
    { value: 'femme', label: 'Femme' },
    { value: 'autre', label: 'Autre' },
    { value: null,    label: 'NSP'  },
  ]

  async function update(v: 'homme' | 'femme' | 'autre' | null) {
    if (saving || v === current) return
    const prev = current
    setCurrent(v)
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSaving(false); return }
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ genre: v }),
    })
    if (!res.ok) {
      setCurrent(prev)
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Erreur')
    } else {
      patchProfileLocal({ genre: v })
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-2 px-3.5 py-3">
      <div className="text-[11px] text-texte-doux">Optionnel — utilisé pour l&apos;affichage uniquement.</div>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map(opt => {
          const active = current === opt.value
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => update(opt.value)}
              disabled={saving}
              className="rounded-full border px-3 py-1.5 text-[12px] font-bold disabled:opacity-60"
              style={{
                borderColor: active ? '#2D5A3D' : '#E8E0D4',
                background:  active ? '#E8F2EB' : '#FFFFFF',
                color:       active ? '#2D5A3D' : '#1A1209',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
