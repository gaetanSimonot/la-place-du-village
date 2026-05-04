'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

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
  if (m < 1)  return 'à l\'instant'
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
      fontWeight: 800, fontSize: Math.round(size * 0.38), fontFamily: 'Syne, sans-serif',
    }}>{(name[0] ?? '?').toUpperCase()}</div>
  )
}

function CommentBubble({ c, parentAuthor, onReply }: {
  c: CommentData; parentAuthor?: string; onReply: () => void
}) {
  const name = c.profile?.display_name || c.profile?.email?.split('@')[0] || 'Anonyme'
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <Avatar name={name} url={c.profile?.avatar_url} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ backgroundColor: '#F5F1EC', borderRadius: '0 14px 14px 14px', padding: '8px 12px' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#2C1810', fontFamily: 'Syne, sans-serif' }}>{name}</span>
          {parentAuthor && (
            <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6, fontStyle: 'italic' }}>→ {parentAuthor}</span>
          )}
          <p style={{ fontSize: 14, color: '#374151', margin: '3px 0 0', lineHeight: 1.45, wordBreak: 'break-word' }}>{c.content}</p>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 4, paddingLeft: 2 }}>
          <span style={{ fontSize: 11, color: '#B0A898' }}>{timeAgo(c.created_at)}</span>
          <button onClick={onReply} style={{ border: 'none', background: 'none', fontSize: 11, fontWeight: 700, color: '#6B7280', cursor: 'pointer', padding: 0 }}>
            Répondre
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommentSheet({ evenementId, open, onClose, onCountChange }: Props) {
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [comments, setComments]   = useState<CommentData[]>([])
  const [loading, setLoading]     = useState(false)
  const [text, setText]           = useState('')
  const [replyTo, setReplyTo]     = useState<CommentData | null>(null)
  const [sending, setSending]     = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

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

  const topLevel = comments.filter(c => !c.parent_id)
  const repliesOf = (pid: string) => comments.filter(c => c.parent_id === pid)
  const authorOf  = (c: CommentData) => c.profile?.display_name || c.profile?.email?.split('@')[0] || 'Anonyme'
  const myName    = profile?.display_name || user?.email?.split('@')[0] || 'Moi'

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
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: '#2C1810', margin: 0 }}>
                Commentaires{comments.length > 0 ? ` · ${comments.length}` : ''}
              </h3>
              <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Liste */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loading ? (
                <div style={{ textAlign: 'center', paddingTop: 32 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
                </div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: 48 }}>
                  <p style={{ fontSize: 40, marginBottom: 10 }}>💬</p>
                  <p style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Syne, sans-serif', color: '#2C1810', marginBottom: 4 }}>Aucun commentaire</p>
                  <p style={{ fontSize: 13, color: '#9CA3AF' }}>Sois le premier à réagir</p>
                </div>
              ) : (
                topLevel.map(c => (
                  <div key={c.id}>
                    <CommentBubble c={c} onReply={() => { setReplyTo(c); setTimeout(() => inputRef.current?.focus(), 80) }} />
                    {repliesOf(c.id).map(r => (
                      <div key={r.id} style={{ marginLeft: 42, marginTop: 10 }}>
                        <CommentBubble c={r} parentAuthor={authorOf(c)} onReply={() => { setReplyTo(c); setTimeout(() => inputRef.current?.focus(), 80) }} />
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
                    Répondre à <strong style={{ color: '#2C1810' }}>{authorOf(replyTo)}</strong>
                  </span>
                  <button onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1 }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Avatar name={myName} url={profile?.avatar_url} size={32} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', backgroundColor: '#F5F1EC', borderRadius: 20, padding: '8px 10px 8px 14px', gap: 6 }}>
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder={user ? (replyTo ? `Répondre à ${authorOf(replyTo)}…` : 'Écris un commentaire…') : 'Connecte-toi pour commenter'}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
