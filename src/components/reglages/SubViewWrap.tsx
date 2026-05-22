'use client'

interface Props {
  title:    string
  onBack:   () => void
  children: React.ReactNode
}

const IcBack = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

export default function SubViewWrap({ title, onBack, children }: Props) {
  return (
    <div className="min-h-[100dvh] bg-creme font-inter">
      <div
        className="flex items-center gap-2.5 px-4 pt-3.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border bg-white text-texte"
          style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <IcBack />
        </button>
        <h1
          className="m-0 flex-1 truncate font-serif text-[18px] leading-none text-texte"
          style={{ letterSpacing: '-0.005em' }}
        >
          {title}
        </h1>
      </div>
      <div className="pt-3">{children}</div>
    </div>
  )
}
