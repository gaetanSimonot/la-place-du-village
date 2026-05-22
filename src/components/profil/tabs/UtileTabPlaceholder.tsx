'use client'
import { toast } from 'sonner'
import { IcSpark, IcChev } from '../icons'

/* Onglet "Utile" — layout fidèle mockup en état "module activé mais rien rempli".
   PR 2 fait le vrai stockage (tables user_offers, user_needs, user_tags, etc.). */

const NOT_READY_DESC =
  'Tu pourras déclarer tes compétences, besoins et tags dans la prochaine PR.'

function notReady() {
  toast('La déclaration utile arrive bientôt', { description: NOT_READY_DESC })
}

export default function UtileTabPlaceholder() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-[14px] pb-4">
      <ModuleActifCard />
      <SuggestionsBlock />
      <JePeuxOffrirBlock />
      <JeChercheBlock />
      <MesTagsBlock />
      <HubDecouverteBlock />
    </div>
  )

  /* ────────── Card "Module activé" (toggle visuel non câblé ici, vrai toggle en /reglages) ─ */
  function ModuleActifCard() {
    return (
      <div
        className="flex items-center gap-3 rounded-[14px] px-3 py-3"
        style={{ background: '#EAF3E6', border: '1px solid #C8DEC0' }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: '#2D5A3D' }}
          aria-hidden
        >
          <IcSpark size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
            Module activé
          </div>
          <div className="mt-[1px] text-[11px] text-texte-doux">
            Le moteur te branche sur la communauté
          </div>
        </div>
        <FauxSwitch on />
      </div>
    )
  }

  /* ────────── ✦ SUGGESTIONS — état vide V1, mockup montre cards mais on n'a pas encore le moteur ─ */
  function SuggestionsBlock() {
    return (
      <section>
        <SectionHeader kicker="✦ Suggestions" kickerColor="#3A5D8C" />
        <div
          className="rounded-[14px] border border-dashed px-4 py-5 text-center"
          style={{ borderColor: '#C9D8EC', background: '#F6F9FE' }}
        >
          <div className="text-[12.5px] font-extrabold text-[#3A5D8C]" style={{ letterSpacing: '-0.005em' }}>
            Les suggestions s&apos;activent bientôt
          </div>
          <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-texte-doux">
            Remplis tes compétences et tes besoins ci-dessous pour que la communauté te propose
            des occasions près de chez toi.
          </p>
        </div>
      </section>
    )
  }

  /* ────────── JE PEUX OFFRIR — placeholder + CTA ─ */
  function JePeuxOffrirBlock() {
    return (
      <section>
        <SectionHeader
          kicker="Je peux offrir"
          kickerColor="#2D5A3D"
          actionLabel="Modifier"
          onAction={notReady}
        />
        <button
          type="button"
          onClick={notReady}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed bg-white px-3 py-4 text-[12.5px] font-bold text-texte-doux"
          style={{ borderColor: '#D6CCB8' }}
        >
          <IcSpark size={14} /> Déclarer une compétence
        </button>
      </section>
    )
  }

  /* ────────── JE CHERCHE — placeholder + CTA ─ */
  function JeChercheBlock() {
    return (
      <section>
        <SectionHeader kicker="Je cherche" kickerColor="#C84B2F" />
        <button
          type="button"
          onClick={notReady}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed bg-white px-3 py-4 text-[12.5px] font-bold text-texte-doux"
          style={{ borderColor: '#E8C9BF' }}
        >
          <IcSpark size={14} /> Ajouter un besoin
        </button>
      </section>
    )
  }

  /* ────────── MES TAGS — placeholder + CTA ─ */
  function MesTagsBlock() {
    return (
      <section>
        <SectionHeader kicker="Mes tags · Intérêts" kickerColor="#3A5D8C" actionLabel="Modifier" onAction={notReady} />
        <button
          type="button"
          onClick={notReady}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed bg-white px-3 py-4 text-[12.5px] font-bold text-texte-doux"
          style={{ borderColor: '#C9D8EC' }}
        >
          <IcSpark size={14} /> Choisir mes intérêts
        </button>
      </section>
    )
  }

  /* ────────── HUB DÉCOUVERTE — gradient terre cuite, locked V1 ─ */
  function HubDecouverteBlock() {
    return (
      <button
        type="button"
        onClick={notReady}
        className="relative mt-2 flex w-full items-center gap-3 overflow-hidden rounded-[16px] border-none px-4 py-4 text-left text-white"
        style={{
          background: 'linear-gradient(135deg, #C84B2F 0%, #8B2E15 100%)',
          boxShadow: '0 6px 20px rgba(200,75,47,0.25)',
        }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
        >
          <IcSpark size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase" style={{ letterSpacing: '0.12em', opacity: 0.85 }}>
            Hub découverte
          </div>
          <div className="mt-[2px] text-[13.5px] font-extrabold" style={{ letterSpacing: '-0.005em' }}>
            Parcours les profils par catégorie
          </div>
          <div className="mt-[2px] text-[10.5px]" style={{ opacity: 0.8 }}>
            Bientôt — débloqué prochainement
          </div>
        </div>
        <IcChev size={18} />
      </button>
    )
  }
}

/* ── Helpers UI ────────────────────────────────────────────────────── */
function SectionHeader({
  kicker, kickerColor, actionLabel, onAction,
}: {
  kicker: string
  kickerColor: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <div
        className="text-[10.5px] font-extrabold uppercase"
        style={{ color: kickerColor, letterSpacing: '0.08em' }}
      >
        {kicker}
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="bg-transparent text-[11px] font-bold text-texte-doux"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  )
}

function FauxSwitch({ on }: { on: boolean }) {
  return (
    <span
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full"
      style={{ background: on ? '#2D5A3D' : '#E8E0D4' }}
      aria-hidden
    >
      <span
        className="absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow"
        style={{ left: on ? '18px' : '2px' }}
      />
    </span>
  )
}
