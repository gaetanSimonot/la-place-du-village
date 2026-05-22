'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PLANS_INFO, PLAN_ORDER, type Plan } from '@/lib/capabilities'
import SubscriptionModal from '@/components/SubscriptionModal'
import { GroupCard, NavRow, I } from '../shared'
import type { ReglagesSubView } from '../ReglagesView'

interface Props {
  plan: Plan
  isAdmin: boolean
  onOpenSub: (sub: ReglagesSubView) => void
  onDeleteAccount: () => void
}

export default function MonPlanTab({ plan, isAdmin, onOpenSub, onDeleteAccount }: Props) {
  const [showSub, setShowSub]   = useState(false)
  const [opening, setOpening]   = useState(false)
  const [showLegal, setShowLegal] = useState(false)

  const current = PLANS_INFO[plan]

  async function openStripePortal() {
    if (opening) return
    setOpening(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setOpening(false); return }
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
    setOpening(false)
  }

  const otherPlans = PLAN_ORDER.filter(p => p !== plan)

  return (
    <div className="flex flex-col gap-4">
      {/* Plan actuel — card gros highlighted couleur plan */}
      <section>
        <div
          className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase"
          style={{ color: '#7A6A5A', letterSpacing: '0.08em' }}
        >
          {I.spark(12)} Mon plan actuel
        </div>
        <div
          className="overflow-hidden rounded-[16px] border bg-white p-4"
          style={{ borderColor: current.color, boxShadow: `0 4px 14px ${current.color}22` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-white"
              style={{ background: current.color }}
            >
              {I.spark(22)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="font-serif text-[19px] leading-none text-texte"
                style={{ letterSpacing: '-0.01em' }}
              >
                {current.label}
              </div>
              <div className="mt-[3px] text-[12px] font-bold" style={{ color: current.color }}>
                {current.priceLabel}
              </div>
            </div>
          </div>
          <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-texte-doux">{current.tagline}</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
            {current.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-texte">
                <span
                  className="mt-[5px] flex h-3 w-3 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: current.color }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>
          {plan !== 'basic' && (
            <button
              type="button"
              onClick={openStripePortal}
              disabled={opening}
              className="mt-3.5 w-full rounded-[12px] border bg-white py-2.5 text-[12.5px] font-extrabold disabled:opacity-60"
              style={{ borderColor: '#E8E0D4', color: '#1A1209' }}
            >
              {opening ? 'Ouverture…' : 'Gérer mon abonnement (Stripe)'}
            </button>
          )}
        </div>
      </section>

      {/* Autres plans */}
      {otherPlans.length > 0 && (
        <section>
          <div
            className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase"
            style={{ color: '#7A6A5A', letterSpacing: '0.08em' }}
          >
            {I.rocket(12)} {plan === 'basic' ? 'Passer à un plan' : 'Autres plans'}
          </div>
          <div className="flex flex-col gap-2">
            {otherPlans.map(p => {
              const info = PLANS_INFO[p]
              const isUpgrade = PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(plan)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setShowSub(true)}
                  className="flex w-full items-center gap-3 rounded-[14px] border bg-white p-3.5 text-left"
                  style={{ borderColor: '#F0EAE0' }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white"
                    style={{ background: info.color }}
                  >
                    {I.spark(18)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
                      {info.label}
                    </div>
                    <div className="mt-[1px] text-[11px] text-texte-doux">{info.tagline}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[11.5px] font-extrabold" style={{ color: info.color }}>
                      {info.priceLabel}
                    </div>
                    {isUpgrade && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase"
                        style={{ background: info.bgColor, color: info.color, letterSpacing: '0.08em' }}
                      >
                        Upgrade
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Confidentialité — Membres bloqués */}
      <GroupCard kicker="Confidentialité" kickerColor="#7A6A5A" icon={I.shield(12)}>
        <NavRow
          icon={I.slash(16)}
          label="Membres bloqués"
          sub="Voir et débloquer les profils que tu as bloqués"
          onClick={() => onOpenSub('bloques')}
          isLast
        />
      </GroupCard>

      {/* Administration (admin only) */}
      {isAdmin && (
        <GroupCard kicker="Administration" kickerColor="#7A6A5A" icon={I.shield(12)}>
          <NavRow icon={I.shield(16)}  label="Tableau de bord"   sub="Membres, demandes, scraping, inbox" href="/admin" />
          <NavRow icon={I.spark(16)}   label="Hub carousel"      sub="Mise en avant éditoriale"           href="/admin/hub-carousel" />
          <NavRow icon={I.journal(16)} label="Journal du Village" sub="Numéros hebdo, modération"         href="/admin/journal" />
          <NavRow icon={I.chat(16)}    label="Tickets support"   sub="Messages des utilisateurs"          href="/admin/support" isLast />
        </GroupCard>
      )}

      {/* Mentions légales — section accordéon inline */}
      <section>
        <div
          className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase"
          style={{ color: '#7A6A5A', letterSpacing: '0.08em' }}
        >
          {I.doc(12)} Informations légales
        </div>
        <div
          className="overflow-hidden rounded-[16px] border bg-white"
          style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
        >
          <button
            type="button"
            onClick={() => setShowLegal(s => !s)}
            className="flex w-full items-center gap-3 bg-transparent px-3.5 py-3 text-left"
          >
            <div
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: '#F7F1E6', color: '#7A6A5A' }}
            >
              {I.doc(16)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
                Mentions légales
              </div>
              <div className="mt-[1px] truncate text-[11px] text-texte-doux">
                Données, responsabilités, fonctionnement
              </div>
            </div>
            <span
              className="shrink-0 text-texte-tres-doux transition-transform"
              style={{ transform: showLegal ? 'rotate(90deg)' : 'rotate(0)' }}
            >
              {I.chev(14)}
            </span>
          </button>
          {showLegal && (
            <div
              className="px-3.5 pb-4 pt-1 text-[12.5px] leading-[1.55] text-texte"
              style={{ borderTop: '1px solid #F0EAE0' }}
            >
              <p className="m-0 mb-2.5 pt-3">
                La Place du Village est une application communautaire locale permettant aux habitants,
                associations, commerces, producteurs et acteurs du territoire de partager
                informations, événements, annonces et initiatives locales.
              </p>
              <p className="m-0 mb-2.5">
                <strong>Vos données ne sont jamais revendues à des tiers.</strong> Elles servent
                uniquement au fonctionnement de l&apos;application.
              </p>
              <p className="m-0 mb-2.5">
                L&apos;application est un outil local indépendant qui ne repose pas sur les grands
                réseaux sociaux ou plateformes publicitaires — pour permettre aux habitants de
                s&apos;organiser librement entre eux.
              </p>
              <p className="m-0 mb-2.5">
                Chaque utilisateur reste responsable de ses publications. Les contenus illégaux,
                frauduleux ou nuisibles peuvent être supprimés pour préserver l&apos;esprit de la
                plateforme.
              </p>
              <p className="m-0 text-[11.5px] text-texte-doux">
                Pour toute demande concernant vos données, utilise le formulaire de contact dans
                l&apos;onglet Aide.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Supprimer mon compte */}
      <button
        type="button"
        onClick={onDeleteAccount}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[14px] border bg-white py-3 text-[13px] font-extrabold"
        style={{ borderColor: '#F0D4C8', color: '#B53A22' }}
      >
        {I.trash(16)} Supprimer mon compte
      </button>

      {showSub && (
        <SubscriptionModal
          context={{ kind: 'generic' }}
          currentPlan={plan}
          onClose={() => setShowSub(false)}
        />
      )}
    </div>
  )
}
