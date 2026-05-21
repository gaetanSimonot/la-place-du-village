'use client'
import Link from 'next/link'
import { SOURCE_META, type UnifiedConversation } from '@/lib/inbox-adapters'

interface Props {
  conv: UnifiedConversation
}

function fmtRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)    return "à l'instant"
  if (min < 60)   return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)     return `${h} h`
  const days = Math.floor(h / 24)
  if (days < 7)   return `${days} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function Avatar({ name, url, size = 44 }: { name: string | null; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  const initial = (name || '?')[0]?.toUpperCase() ?? '?'
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}

export default function ConversationListItem({ conv }: Props) {
  const meta = SOURCE_META[conv.source]
  const hasUnread = conv.unreadCount > 0

  return (
    <Link
      href={conv.href}
      className="flex items-center gap-3 rounded-2xl border border-bord bg-white px-3 py-3 no-underline transition-colors hover:border-bordSoft"
    >
      <Avatar name={conv.otherName} url={conv.otherAvatar} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Badge source */}
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.04em]"
            style={{ backgroundColor: meta.badgeBg, color: meta.badgeFg }}
          >
            {meta.label}
          </span>
          {/* Title (annonce / trajet / subject) */}
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-texte">
            {conv.title}
          </span>
          <span className="shrink-0 text-[10px] text-texte-tres-doux">
            {conv.lastMessage ? fmtRelative(conv.lastMessage.createdAt) : fmtRelative(conv.updatedAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          {/* Other name + dernier message */}
          <span className="min-w-0 flex-1 truncate text-[12px] text-texte-doux">
            {conv.otherName ? <span className="font-semibold text-texte">{conv.otherName}</span> : null}
            {conv.otherName && conv.lastMessage ? ' · ' : ''}
            {conv.lastMessage ? conv.lastMessage.content : (
              <span className="italic text-texte-tres-doux">Pas encore de message</span>
            )}
          </span>
          {hasUnread && (
            <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white">
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
