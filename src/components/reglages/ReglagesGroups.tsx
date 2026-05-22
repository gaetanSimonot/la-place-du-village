'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { DisplaySettings, Profile } from '@/contexts/AuthContext'
import { PLANS_INFO, type Plan } from '@/lib/capabilities'

/* ── Icons SVG inline (line stroke 1.8) ──────────────────────────────── */
type IconRenderer = (size?: number) => React.ReactNode
function makeIcon(path: React.ReactNode): IconRenderer {
  return function Icon(size = 18) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    )
  }
}

const I = {
  grid:     makeIcon(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>),
  lock:     makeIcon(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>),
  image:    makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></>),
  text:     makeIcon(<><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></>),
  leaf:     makeIcon(<><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></>),
  spark:    makeIcon(<><path d="M12 2v6m0 8v6m10-10h-6m-8 0H2m15.071-7.071-4.243 4.243m-5.657 5.657-4.243 4.243M19.071 19.071l-4.243-4.243m-5.657-5.657L4.929 4.929"/></>),
  heart:    makeIcon(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>),
  chat:     makeIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>),
  globe:    makeIcon(<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>),
  eye:      makeIcon(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
  eyeOff:   makeIcon(<><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.94 18.94 0 0 1 5.16-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.94 18.94 0 0 1-2.16 3.19"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></>),
  cal:      makeIcon(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  mega:     makeIcon(<><polygon points="3 11 22 2 22 22 3 13"/><line x1="3" y1="11" x2="3" y2="13"/></>),
  gift:     makeIcon(<><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>),
  bell:     makeIcon(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>),
  shield:   makeIcon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  slash:    makeIcon(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
  card:     makeIcon(<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>),
  help:     makeIcon(<><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
  doc:      makeIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>),
  logout:   makeIcon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>),
  chev:     makeIcon(<polyline points="9 6 15 12 9 18"/>),
  sparkSm:  makeIcon(<><path d="M12 2v6m0 8v6m10-10h-6m-8 0H2"/></>),
  store:    makeIcon(<><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 21V12h6v9"/></>),
  journal:  makeIcon(<><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></>),
  group:    makeIcon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  rocket:   makeIcon(<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>),
}

/* ── Defaults display_settings ─────────────────────────────────────── */
const DEFAULTS: DisplaySettings = {
  banner: true,
  bio: true,
  fiche_pro: true,
  module_utile: true,
  pages_suivies: false,
  publications: true,
}

type PrivacyOption = 'public' | 'search_only' | 'masque'

type SubKey = 'annonces' | 'events' | 'producteur' | 'etabs' | 'abonnements'

interface Props {
  profile: Profile
  email:   string
  isAdmin: boolean
  onOpenSub: (sub: SubKey) => void
  onDeleteAccount: () => void
  signOut: () => Promise<void>
}

export default function ReglagesGroups({ profile, email, isAdmin, onOpenSub, onDeleteAccount, signOut }: Props) {
  /* ── State ──────────────────────────────────────────────────── */
  const [settings, setSettings] = useState<DisplaySettings>(profile.display_settings ?? DEFAULTS)
  const [privacy, setPrivacy]   = useState<PrivacyOption>(
    profile.is_public === false && profile.searchable === false ? 'masque'
    : profile.is_public === false ? 'search_only'
    : 'public',
  )
  const [openingPortal, setOpeningPortal] = useState(false)
  const [signingOut, setSigningOut]       = useState(false)
  const [plan, setPlan] = useState<Plan>((profile.plan as Plan) ?? 'basic')
  const [etabCount, setEtabCount]         = useState<number>(0)
  const [etabFirstId, setEtabFirstId]     = useState<string | null>(null)
  const [hasProducer, setHasProducer]     = useState<boolean>(false)
  const planInfo = PLANS_INFO[plan]

  // Refresh du plan en arrière-plan (au cas où il aurait changé via webhook Stripe)
  useEffect(() => {
    if (!profile.id) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('plan')
      .eq('user_id', profile.id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data?.plan) setPlan(data.plan as Plan)
      })

    // Compte rapide etabs + producer pour conditional rendering des rows
    supabase
      .from('etablissements')
      .select('id', { count: 'exact' })
      .eq('user_id', profile.id)
      .then(({ data, count }) => {
        if (cancelled) return
        setEtabCount(count ?? 0)
        setEtabFirstId(data?.[0]?.id ?? null)
      })
    supabase
      .from('producers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .then(({ count }) => {
        if (!cancelled) setHasProducer((count ?? 0) > 0)
      })

    return () => { cancelled = true }
  }, [profile.id])

  /* ── Helpers tokens ──────────────────────────────────────────── */
  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  /* ── Mutations ──────────────────────────────────────────────── */
  async function patchDisplay(key: keyof DisplaySettings, value: boolean) {
    setSettings(s => ({ ...s, [key]: value })) // optimistic
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
    }
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
      setPrivacy(prev) // rollback
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Erreur')
    }
  }

  async function openStripePortal() {
    if (openingPortal) return
    setOpeningPortal(true)
    const token = await getToken()
    if (!token) { setOpeningPortal(false); return }
    const r = await fetch('/api/stripe/manage', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) {
      const d = await r.json()
      if (d.url) { window.location.href = d.url; return }
    } else {
      const d = await r.json().catch(() => ({}))
      toast.error(d.error ?? 'Erreur ouverture du portail')
    }
    setOpeningPortal(false)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  function notReady() {
    toast('Bientôt', { description: 'Cette section arrive dans une PR dédiée.' })
  }

  /* ── Render ─────────────────────────────────────────────────── */
  const initial = (profile.display_name ?? email ?? '·').trim().charAt(0).toUpperCase() || '·'

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-3">
      {/* ── Card compte ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-3.5 rounded-[16px] border bg-white p-3.5"
        style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
      >
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[20px] text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
            {profile.display_name ?? 'Sans nom'}
          </div>
          <div className="truncate text-[11.5px] text-texte-doux">{email}</div>
        </div>
        <span
          className="shrink-0 rounded-full bg-cremeDeep px-2.5 py-1 text-[9.5px] font-extrabold uppercase"
          style={{ color: '#7A6A5A', letterSpacing: '0.08em' }}
        >
          {planInfo.label}
        </span>
      </div>

      {/* ── Banner abonnement ────────────────────────────────── */}
      <button
        type="button"
        onClick={openStripePortal}
        disabled={openingPortal}
        className="relative flex items-center gap-3 overflow-hidden rounded-[16px] border-none px-4 py-3.5 text-left text-white disabled:opacity-70"
        style={{
          background: 'linear-gradient(135deg, #2D5A3D 0%, #1A4028 100%)',
          boxShadow: '0 6px 18px rgba(45,90,61,0.20)',
        }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
        >
          {I.spark(20)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase" style={{ letterSpacing: '0.12em', opacity: 0.85 }}>
            Mon abonnement
          </div>
          <div className="mt-[2px] font-serif text-[17px] leading-none" style={{ letterSpacing: '-0.005em' }}>
            Plan {planInfo.label} — {planInfo.priceLabel}
          </div>
          <div className="mt-[3px] text-[10.5px]" style={{ opacity: 0.85 }}>
            {plan === 'basic' ? 'Passer en Pro pour des annonces illimitées' : openingPortal ? 'Ouverture…' : 'Gérer mon abonnement'}
          </div>
        </div>
        {I.chev(18)}
      </button>

      {/* ── AFFICHAGE DE MON PROFIL ────────────────────────── */}
      <GroupCard kicker="★ Affichage de mon profil" kickerColor="#3A5D8C" icon={I.grid(12)}>
        <ToggleRow icon={I.image(16)}  label="Bannière"             sub="Photo de couverture visible"      checked={settings.banner}        onChange={v => patchDisplay('banner', v)} />
        <ToggleRow icon={I.text(16)}   label="Bio"                  sub="Présentation visible"             checked={settings.bio}           onChange={v => patchDisplay('bio', v)} />
        <ToggleRow icon={I.leaf(16)}   label="Ma fiche producteur"  sub="Vitrine pro visible"              checked={settings.fiche_pro}     onChange={v => patchDisplay('fiche_pro', v)} />
        <ToggleRow icon={I.spark(16)}  label="Module Profil utile"  sub="Offres, besoins, suggestions"     checked={settings.module_utile}  onChange={v => patchDisplay('module_utile', v)} />
        <ToggleRow icon={I.heart(16)}  label="Pages suivies"        sub="Lieux & profils que tu suis"      checked={settings.pages_suivies} onChange={v => patchDisplay('pages_suivies', v)} />
        <ToggleRow icon={I.chat(16)}   label="Mes publications"     sub="Mur visible des autres"           checked={settings.publications}  onChange={v => patchDisplay('publications', v)} isLast />
      </GroupCard>

      {/* ── QUI PEUT VOIR MON PROFIL ─────────────────────── */}
      <GroupCard kicker="Qui peut voir mon profil" kickerColor="#7C5C3B" icon={I.lock(12)}>
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
      </GroupCard>

      {/* ── MON ESPACE ──────────────────────────────────── */}
      <GroupCard kicker="Mon espace" kickerColor="#2D5A3D">
        <NavRow icon={I.cal(16)}  label="Mes événements"     sub="Publiés, brouillons"           onClick={() => onOpenSub('events')} />
        <NavRow icon={I.mega(16)} label="Mes annonces"       sub="Actives, vendues, archivées"   onClick={() => onOpenSub('annonces')} />
        <NavRow
          icon={I.gift(16)}
          label="Mes promotions"
          sub="Pour les commerçants"
          href="/promotions"
          badge="Pro"
        />
        {hasProducer && (
          <NavRow icon={I.leaf(16)}  label="Ma fiche producteur" sub="Vitrine, produits, carte" onClick={() => onOpenSub('producteur')} />
        )}
        {etabCount === 1 && etabFirstId && (
          <NavRow icon={I.store(16)} label="Mon établissement"   sub="Fiche, horaires, photos" href={`/etablissement/${etabFirstId}`} />
        )}
        {etabCount > 1 && (
          <NavRow icon={I.store(16)} label="Mes établissements"  sub={`${etabCount} fiches gérées`} onClick={() => onOpenSub('etabs')} />
        )}
        <NavRow icon={I.journal(16)} label="Mes articles" sub="Brouillons, soumissions, publiés" href="/journal/articles" />
        <NavRow icon={I.group(16)}   label="Mes abonnements" sub="Profils & lieux que je suis"    onClick={() => onOpenSub('abonnements')} />
        <NavRow icon={I.rocket(16)}  label="Visibilité & boost" sub="Mettre en avant mes contenus" href="/profil/visibilite" isLast />
      </GroupCard>

      {/* ── PRÉFÉRENCES ─────────────────────────────────── */}
      <GroupCard kicker="Préférences" kickerColor="#7A6A5A">
        <GenreRow profile={profile} />
        <NavRow icon={I.bell(16)}   label="Notifications"     sub="Push, email, fréquence"        onClick={notReady} />
        <NavRow icon={I.shield(16)} label="Sécurité du compte" sub="Mot de passe, sessions"       onClick={notReady} />
        <NavRow icon={I.slash(16)}  label="Membres bloqués"   sub="Personne pour le moment"       onClick={notReady} danger isLast />
      </GroupCard>

      {/* ── ADMINISTRATION (admin only) ──────────────────── */}
      {isAdmin && (
        <GroupCard kicker="Administration" kickerColor="#7A6A5A" icon={I.shield(12)}>
          <NavRow icon={I.shield(16)}  label="Tableau de bord"   sub="Membres, demandes, scraping, inbox" href="/admin" />
          <NavRow icon={I.spark(16)}   label="Hub carousel"      sub="Mise en avant éditoriale"           href="/admin/hub-carousel" />
          <NavRow icon={I.journal(16)} label="Journal du Village" sub="Numéros hebdo, modération"         href="/admin/journal" />
          <NavRow icon={I.chat(16)}    label="Tickets support"   sub="Messages des utilisateurs"          href="/admin/support" isLast />
        </GroupCard>
      )}

      {/* ── COMPTE ──────────────────────────────────────── */}
      <GroupCard kicker="Compte" kickerColor="#7A6A5A">
        <NavRow icon={I.card(16)}   label="Facturation"      sub="Stripe portal"            onClick={openStripePortal} />
        <NavRow icon={I.help(16)}   label="Aide & contact"   sub="FAQ, signaler un bug"     href="/support" />
        <NavRow icon={I.doc(16)}    label="Mentions légales" sub="CGU, vie privée"          onClick={notReady} />
        <NavRow icon={I.slash(16)}  label="Supprimer mon compte" sub="Définitif — RGPD"     onClick={onDeleteAccount} danger isLast />
      </GroupCard>

      {/* ── Déconnexion ─────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] border bg-white py-3 text-[13px] font-extrabold disabled:opacity-60"
        style={{ borderColor: '#F0D4C8', color: '#B53A22' }}
      >
        {I.logout(16)} {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </div>
  )
}

/* ── Group card ──────────────────────────────────────────────────────── */
function GroupCard({
  kicker, kickerColor, icon, children,
}: {
  kicker: string
  kickerColor: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div
        className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase"
        style={{ color: kickerColor, letterSpacing: '0.08em' }}
      >
        {icon} {kicker}
      </div>
      <div
        className="overflow-hidden rounded-[16px] border bg-white"
        style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
      >
        {children}
      </div>
    </section>
  )
}

/* ── Toggle row ─────────────────────────────────────────────────────── */
function ToggleRow({
  icon, label, sub, checked, onChange, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  checked: boolean
  onChange: (v: boolean) => void
  isLast?: boolean
}) {
  return (
    <label
      className="flex w-full items-center gap-3 px-3.5 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EAE0' }}
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: checked ? '#E8F2EB' : '#F7F1E6',
          color: checked ? '#2D5A3D' : '#7A6A5A',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {label}
        </div>
        {sub && <div className="mt-[1px] truncate text-[11px] text-texte-doux">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? '#2D5A3D' : '#E8E0D4' }}
      >
        <span
          className="absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </button>
    </label>
  )
}

/* ── Radio row ──────────────────────────────────────────────────────── */
function RadioRow({
  icon, label, sub, selected, onClick, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  selected: boolean
  onClick: () => void
  isLast?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 bg-transparent px-3.5 py-3 text-left"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EAE0' }}
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: selected ? '#E8F2EB' : '#F7F1E6',
          color: selected ? '#2D5A3D' : '#7A6A5A',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {label}
        </div>
        <div className="mt-[1px] text-[11px] leading-[1.4] text-texte-doux">{sub}</div>
      </div>
      <span
        className="relative inline-block h-[22px] w-[22px] shrink-0 rounded-full"
        style={{ border: `2px solid ${selected ? '#2D5A3D' : '#D6CCB8'}` }}
      >
        {selected && (
          <span
            className="absolute left-1/2 top-1/2 inline-block h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: '#2D5A3D' }}
          />
        )}
      </span>
    </button>
  )
}

/* ── Nav row (chevron) ─────────────────────────────────────────────── */
function NavRow({
  icon, label, sub, onClick, href, badge, danger, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  onClick?: () => void
  href?: string
  badge?: string
  danger?: boolean
  isLast?: boolean
}) {
  const body = (
    <>
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: danger ? '#FBE9E5' : '#F7F1E6',
          color: danger ? '#B53A22' : '#2D5A3D',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div
          className="text-[13px] font-extrabold"
          style={{ color: danger ? '#B53A22' : '#1A1209', letterSpacing: '-0.005em' }}
        >
          {label}
        </div>
        {sub && <div className="mt-[1px] truncate text-[11px] text-texte-doux">{sub}</div>}
      </div>
      {badge && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase"
          style={{ background: '#E8F2EB', color: '#2D5A3D', letterSpacing: '0.08em' }}
        >
          {badge}
        </span>
      )}
      <span className="shrink-0 text-texte-tres-doux">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </span>
    </>
  )
  const className = 'flex w-full items-center gap-3 bg-transparent px-3.5 py-3 text-inherit no-underline'
  const style = { borderBottom: isLast ? 'none' : '1px solid #F0EAE0' } as const
  if (href) {
    return <Link href={href} className={className} style={style}>{body}</Link>
  }
  return <button type="button" onClick={onClick} className={className} style={style}>{body}</button>
}

/* ── Genre row : pills inline ─────────────────────────────────────── */
function GenreRow({ profile }: { profile: Profile }) {
  const [current, setCurrent] = useState<'homme' | 'femme' | 'autre' | null>(profile.genre ?? null)
  const [saving, setSaving] = useState(false)

  const OPTIONS: Array<{ value: 'homme' | 'femme' | 'autre' | null; label: string }> = [
    { value: 'homme', label: 'Homme' },
    { value: 'femme', label: 'Femme' },
    { value: 'autre', label: 'Autre' },
    { value: null,    label: 'NSP' },
  ]

  async function update(v: 'homme' | 'femme' | 'autre' | null) {
    if (saving || v === current) return
    const prev = current
    setCurrent(v) // optimistic
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
      setCurrent(prev) // rollback
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'Erreur')
    }
    setSaving(false)
  }

  return (
    <div
      className="flex flex-col gap-2 px-3.5 py-3"
      style={{ borderBottom: '1px solid #F0EAE0' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: '#F7F1E6', color: '#7A6A5A' }}
        >
          {I.sparkSm(16)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
            Genre
          </div>
          <div className="mt-[1px] text-[11px] text-texte-doux">Optionnel — affichage uniquement</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-[46px]">
        {OPTIONS.map(opt => {
          const active = current === opt.value
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => update(opt.value)}
              disabled={saving}
              className="rounded-full border px-3 py-1 text-[11.5px] font-bold disabled:opacity-60"
              style={{
                borderColor: active ? '#2D5A3D' : '#E8E0D4',
                background: active ? '#E8F2EB' : '#FFFFFF',
                color: active ? '#2D5A3D' : '#1A1209',
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
