'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

function renderContent(content: string) {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g
  const parts: React.ReactNode[] = []
  let last = 0; let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index))
    parts.push(
      <Link key={m.index} href={`/profil/${m[2]}`} onClick={e => e.stopPropagation()}
        style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
        @{m[1]}
      </Link>
    )
    last = m.index + m[0].length
  }
  if (last < content.length) parts.push(content.slice(last))
  return parts.length > 0 ? <>{parts}</> : <>{content}</>
}

interface Profile { id: string; display_name: string | null; avatar_url: string | null; email: string | null }
interface CommentData {
  id: string; user_id: string; content: string; parent_id: string | null; created_at: string
  profile: Profile | null
}

interface Props {
  evenementId: string
  open: boolean
  onClose: () => void
  onCountChange?: (n: number) => void
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1)  return 'Ã  l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function Avatar({ name, url, size = 34 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(size * 0.38), fontFamily: 'Inter, sans-serif',
    }}>{(name[0] ?? '?').toUpperCase()}</div>
  )
}

function CommentBubble({ c, parentAuthor, onReply, isOwn, onMenuOpen, isEditing, editText, onEditChange, onSaveEdit, onCancelEdit }: {
  c: CommentData; parentAuthor?: string; onReply: () => void
  isOwn?: boolean; onMenuOpen?: () => void
  isEditing?: boolean; editText?: string
  onEditChange?: (v: string) => void; onSaveEdit?: () => void; onCancelEdit?: () => void
}) {
  const name = c.profile?.display_name || c.profile?.email?.split('@')[0] || 'Anonyme'
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <Link href={`/profil/${c.user_id}`} style={{ flexShrink: 0, textDecoration: 'none' }}>
        <Avatar name={name} url={c.profile?.avatar_url} size={34} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ backgroundColor: '#F5F1EC', borderRadius: '0 14px 14px 14px', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div>
              <Link href={`/profil/${c.user_id}`} style={{ textDecoration: 'none' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#2C1810', fontFamily: 'Inter, sans-serif' }}>{name}</span>
              </Link>
              {parentAuthor && (
                <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6, fontStyle: 'italic' }}>â†’ {parentAuthor}</span>
              )}
            </div>
            {isOwn && (
              <button
                onClick={onMenuOpen}
                style={{ border: 'none', background: 'none', color: '#B0A898', cursor: 'pointer', padding: '0 0 0 10px', fontSize: 17, lineHeight: 1, flexShrink: 0, letterSpacing: 1 }}
              >â€¢â€¢â€¢</button>
            )}
          </div>
          {isEditing ? (
            <div>
              <textarea
                value={editText}
                onChange={e => onEditChange?.(e.target.value)}
                autoFocus
                rows={3}
                style={{
                  width: '100%', border: '1.5px solid var(--primary)', borderRadius: 8,
                  padding: '6px 8px', fontSize: 14, lineHeight: 1.4, resize: 'none',
                  fontFamily: 'Inter, sans-serif', color: '#2C1810', backgroundColor: '#fff',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={onSaveEdit} style={{
                  flex: 1, padding: '7px', borderRadius: 8, border: 'none',
                  backgroundColor: 'var(--primary)', color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>Enregistrer</button>
                <button onClick={onCancelEdit} style={{
                  flex: 1, padding: '7px', borderRadius: 8, border: 'none',
                  backgroundColor: '#E8E4DE', color: '#6B7280',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>Annuler</button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.45, wordBreak: 'break-word' }}>{renderContent(c.content)}</p>
          )}
        </div>
        {!isEditing && (
          <div style={{ display: 'flex', gap: 14, marginTop: 4, paddingLeft: 2 }}>
            <span style={{ fontSize: 11, color: '#B0A898' }}>{timeAgo(c.created_at)}</span>
            <button onClick={onReply} style={{ border: 'none', background: 'none', fontSize: 11, fontWeight: 700, color: '#6B7280', cursor: 'pointer', padding: 0 }}>
              RÃ©pondre
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommentSheet({ evenementId, open, onClose, onCountChange }: Props) {
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [comments, setComments]     = useState<CommentData[]>([])
  const [loading, setLoading]       = useState(false)
  const [text, setText]             = useState('')
  const [replyTo, setReplyTo]       = useState<CommentData | null>(null)
  const [sending, setSending]       = useState(false)
  const [menuId, setMenuId]         = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editText, setEditText]     = useState('')
  const [mentionSuggestions, setMentionSuggestions] = useState<Profile[]>([])
  const inputRef       = useRef<HTMLTextAreaElement>(null)
  const listRef        = useRef<HTMLDivElement>(null)
  const mentionTimer   = useRef<ReturnType<typeof setTimeout>>()

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    const pos = e.target.selectionStart ?? val.length
    const before = val.slice(0, pos)
    const atMatch = before.match(/@([^\s@]*)$/)
    if (atMatch && atMatch[1].length >= 1) {
      const query = atMatch[1]
      clearTimeout(mentionTimer.current)
      mentionTimer.current = setTimeout(async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, email')
          .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5)
        setMentionSuggestions((data ?? []) as Profile[])
      }, 200)
    } else {
      clearTimeout(mentionTimer.current)
      setMentionSuggestions([])
    }
  }

  const insertMention = (p: Profile) => {
    const el = inputRef.current
    if (!el) return
    const pos = el.selectionStart ?? text.length
    const before = text.slice(0, pos)
    const after = text.slice(pos)
    const name = p.display_name || p.email?.split('@')[0] || 'Utilisateur'
    const newBefore = before.replace(/@([^\s@]*)$/, `@[${name}](${p.id}) `)
    setText(newBefore + after)
    setMentionSuggestions([])
    setTimeout(() => { el.focus(); el.setSelectionRange(newBefore.length, newBefore.length) }, 0)
  }

  const loadComments = useCallback(async () => {
    setLoading(true)
    const { data: raw } = await supabase
      .from('comments')
      .select('id, user_id, content, parent_id, created_at')
      .eq('evenement_id', evenementId)
      .order('created_at', { ascending: true })
    const list = (raw ?? []) as Omit<CommentData, 'profile'>[]
    const ids  = Array.from(new Set(list.map(c => c.user_id)))
    let pmap: Record<string, Profile> = {}
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, display_name, avatar_url, email').in('id', ids)
      pmap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    }
    const merged: CommentData[] = list.map(c => ({ ...c, profile: pmap[c.user_id] ?? null }))
    setComments(merged)
    onCountChange?.(merged.length)
    setLoading(false)
  }, [evenementId, onCountChange])

  useEffect(() => { if (open) loadComments() }, [open, loadComments])

  const send = async () => {
    if (!user) { openAuthModal(); return }
    if (!text.trim() || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ evenement_id: evenementId, user_id: user.id, content: text.trim(), parent_id: replyTo?.id ?? null })
      .select('id, user_id, content, parent_id, created_at')
      .single()
    if (!error && data) {
      const newComment: CommentData = {
        ...(data as Omit<CommentData, 'profile'>),
        profile: { id: user.id, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null, email: user.email ?? null },
      }
      setComments(prev => {
        const next = [...prev, newComment]
        onCountChange?.(next.length)
        return next
      })
    }
    setText(''); setReplyTo(null); setSending(false)
    setTimeout(() => listRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 80)
  }

  const handleDelete = async (id: string) => {
    setMenuId(null)
    await supabase.from('comments').delete().eq('id', id)
    setComments(prev => {
      const next = prev.filter(c => c.id !== id && c.parent_id !== id)
      onCountChange?.(next.length)
      return next
    })
  }

  const startEdit = (c: CommentData) => {
    setMenuId(null)
    setEditingId(c.id)
    setEditText(c.content)
  }

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return
    const { error } = await supabase.from('comments').update({ content: editText.trim() }).eq('id', editingId)
    if (!error) {
      setComments(prev => prev.map(c => c.id === editingId ? { ...c, content: editText.trim() } : c))
    }
    setEditingId(null); setEditText('')
  }

  const topLevel   = comments.filter(c => !c.parent_id)
  const repliesOf  = (pid: string) => comments.filter(c => c.parent_id === pid)
  const authorOf   = (c: CommentData) => c.profile?.display_name || c.profile?.email?.split('@')[0] || 'Anonyme'
  const myName     = profile?.display_name || user?.email?.split('@')[0] || 'Moi'
  const menuComment = menuId ? comments.find(c => c.id === menuId) ?? null : null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bg"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: 'rgba(0,0,0,0.42)' }}
          />
          <motion.div key="sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 38 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
              backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
              height: '88dvh', display: 'flex', flexDirection: 'column',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {/* Handle */}
            <div style={{ padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto' }} />
            </div>

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 16px 10px', flexShrink: 0, borderBottom: '1px solid #EDE8E0',
            }}>
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: '#2C1810', margin: 0 }}>
                Commentaires{comments.length > 0 ? ` Â· ${comments.length}` : ''}
              </h3>
              <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer' }}>âœ•</button>
            </div>

            {/* Liste */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loading ? (
                <div style={{ textAlign: 'center', paddingTop: 32 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
                </div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: 48 }}>
                  <p style={{ fontSize: 40, marginBottom: 10 }}>ðŸ’¬</p>
                  <p style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Inter, sans-serif', color: '#2C1810', marginBottom: 4 }}>Aucun commentaire</p>
                  <p style={{ fontSize: 13, color: '#9CA3AF' }}>Sois le premier Ã  rÃ©agir</p>
                </div>
              ) : (
                topLevel.map(c => (
                  <div key={c.id}>
                    <CommentBubble
                      c={c}
                      onReply={() => { setReplyTo(c); setTimeout(() => inputRef.current?.focus(), 80) }}
                      isOwn={user?.id === c.user_id}
                      onMenuOpen={() => setMenuId(c.id)}
                      isEditing={editingId === c.id}
                      editText={editText}
                      onEditChange={setEditText}
                      onSaveEdit={saveEdit}
                      onCancelEdit={() => { setEditingId(null); setEditText('') }}
                    />
                    {repliesOf(c.id).map(r => (
                      <div key={r.id} style={{ marginLeft: 42, marginTop: 10 }}>
                        <CommentBubble
                          c={r}
                          parentAuthor={authorOf(c)}
                          onReply={() => { setReplyTo(c); setTimeout(() => inputRef.current?.focus(), 80) }}
                          isOwn={user?.id === r.user_id}
                          onMenuOpen={() => setMenuId(r.id)}
                          isEditing={editingId === r.id}
                          editText={editText}
                          onEditChange={setEditText}
                          onSaveEdit={saveEdit}
                          onCancelEdit={() => { setEditingId(null); setEditText('') }}
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Zone saisie */}
            <div style={{
              flexShrink: 0, borderTop: '1px solid #EDE8E0',
              padding: '8px 12px',
              paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
            }}>
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#F5F1EC', borderRadius: 8, padding: '5px 10px', marginBottom: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 0 1 0 12h-3"/>
                  </svg>
                  <span style={{ fontSize: 12, color: '#6B7280', flex: 1 }}>
                    RÃ©pondre Ã  <strong style={{ color: '#2C1810' }}>{authorOf(replyTo)}</strong>
                  </span>
                  <button onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1 }}>âœ•</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Avatar name={myName} url={profile?.avatar_url} size={32} />
                <div style={{ flex: 1, position: 'relative' }}>
                {/* Dropdown mention */}
                {mentionSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                    backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
                    overflow: 'hidden', zIndex: 10,
                  }}>
                    {mentionSuggestions.map(p => {
                      const name = p.display_name || p.email?.split('@')[0] || 'Utilisateur'
                      return (
                        <button key={p.id} onMouseDown={e => { e.preventDefault(); insertMention(p) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          {p.avatar_url
                            ? <img src={p.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                            : <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, fontFamily: 'Inter, sans-serif' }}>{name[0].toUpperCase()}</div>
                          }
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#2C1810', fontFamily: 'Inter, sans-serif' }}>{name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              <div style={{ display: 'flex', alignItems: 'flex-end', backgroundColor: '#F5F1EC', borderRadius: 20, padding: '8px 10px 8px 14px', gap: 6 }}>
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder={user ? (replyTo ? `RÃ©pondre Ã  ${authorOf(replyTo)}â€¦` : 'Ã‰cris un commentaireâ€¦') : 'Connecte-toi pour commenter'}
                    rows={1}
                    readOnly={!user}
                    onClick={() => { if (!user) openAuthModal() }}
                    style={{
                      flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent',
                      fontSize: 14, color: '#2C1810', resize: 'none', lineHeight: 1.4,
                      fontFamily: 'Inter, sans-serif', maxHeight: 100, overflowY: 'auto',
                    }}
                  />
                  <AnimatePresence>
                    {text.trim() && (
                      <motion.button
                        key="send"
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        onClick={send}
                        disabled={sending}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            </div>
          </motion.div>

          {/* Menu 3 points â€” au-dessus du sheet */}
          {menuComment && (
            <>
              <div
                onClick={() => setMenuId(null)}
                style={{ position: 'fixed', inset: 0, zIndex: 310, backgroundColor: 'rgba(0,0,0,0.22)' }}
              />
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 311,
                backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
                padding: '14px 16px',
                paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
                fontFamily: 'Inter, sans-serif',
              }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />
                <button
                  onClick={() => startEdit(menuComment)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                    padding: '14px 4px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 15, fontWeight: 600, color: '#2C1810',
                    borderBottom: '1px solid #F0EBE3',
                  }}
                >
                  <span style={{ fontSize: 19 }}>âœï¸</span> Modifier
                </button>
                <button
                  onClick={() => handleDelete(menuComment.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                    padding: '14px 4px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 15, fontWeight: 600, color: '#EF4444',
                    borderBottom: '1px solid #F0EBE3',
                  }}
                >
                  <span style={{ fontSize: 19 }}>ðŸ—‘ï¸</span> Supprimer
                </button>
                <button
                  onClick={() => setMenuId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
                    padding: '14px 4px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 14, fontWeight: 600, color: '#9CA3AF',
                  }}
                >
                  Annuler
                </button>
              </div>
            </>
          )}
        </>
      )}
    </AnimatePresence>
  )
}
