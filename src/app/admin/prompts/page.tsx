'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface PromptIA {
  id: string
  nom: string
  description: string | null
  systeme: string
  updated_at: string
}

const VARS: Record<string, string[]> = {
  extract_single:   ['{{today}}'],
  extract_multiple: ['{{today}}'],
  scrape:           ['{{today}}'],
  doublon_check:    [],
  doublon_batch:    [],
  doublon_fusion:   [],
  voice_edit:       ['{{today}}', '{{currentForm}}', '{{transcript}}'],
}

export default function PromptsIAPage() {
  const [prompts, setPrompts]   = useState<PromptIA[]>([])
  const [editing, setEditing]   = useState<PromptIA | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(true)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/admin/prompts')
      .then(r => r.json())
      .then(data => { setPrompts(data); setLoading(false) })
  }, [])

  const open = (p: PromptIA) => {
    setEditing(p)
    setEditText(p.systeme)
    setSaved(false)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  const close = () => {
    if (editText !== editing?.systeme && !confirm('Fermer sans sauvegarder ?')) return
    setEditing(null)
    setSaved(false)
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    const res = await fetch('/api/admin/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editing.id, systeme: editText }),
    })
    if (res.ok) {
      setPrompts(prev => prev.map(p => p.id === editing.id ? { ...p, systeme: editText } : p))
      setEditing(prev => prev ? { ...prev, systeme: editText } : null)
      setSaved(true)
    }
    setSaving(false)
  }

  const dirty = editText !== editing?.systeme

  // ── Vue éditeur (plein écran) ─────────────────────────────────────────────
  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: '#FBF7F0', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header éditeur */}
      <div style={{ backgroundColor: '#2C1810', color: 'white', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <button
          onClick={close}
          style={{ color: '#C4622D', fontSize: '20px', fontWeight: 'bold', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {editing.nom}
          </div>
          {editing.description && (
            <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>{editing.description}</div>
          )}
        </div>
        {dirty && (
          <span style={{ fontSize: '11px', color: '#F59E0B', fontWeight: '600', flexShrink: 0 }}>modifié</span>
        )}
      </div>

      {/* Variables disponibles */}
      {VARS[editing.id]?.length > 0 && (
        <div style={{ backgroundColor: '#3D2318', padding: '8px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Variables :</span>
          {VARS[editing.id].map(v => (
            <code key={v} style={{ fontSize: '11px', backgroundColor: '#2C1810', color: '#C4622D', padding: '1px 6px', borderRadius: '4px' }}>{v}</code>
          ))}
        </div>
      )}

      {/* Textarea principale */}
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={e => { setEditText(e.target.value); setSaved(false) }}
        spellCheck={false}
        style={{
          flex: 1, resize: 'none', border: 'none', outline: 'none',
          padding: '16px', fontSize: '13px', lineHeight: '1.7',
          fontFamily: 'monospace', backgroundColor: '#FFFDF9', color: '#2C1810',
          overflowY: 'auto',
        }}
      />

      {/* Barre actions */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid #E8E0D5', backgroundColor: 'white',
        display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0,
      }}>
        <button
          onClick={save}
          disabled={saving || !dirty}
          style={{
            flex: 1, padding: '12px',
            backgroundColor: saving || !dirty ? '#E8E0D5' : '#C4622D',
            color: saving || !dirty ? '#9CA3AF' : 'white',
            border: 'none', borderRadius: '10px',
            fontWeight: '700', fontSize: '15px',
            cursor: saving || !dirty ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {saved && (
          <span style={{ fontSize: '12px', color: '#22C55E', fontWeight: '600', flexShrink: 0 }}>
            ✓ Actif
          </span>
        )}
        {dirty && !saving && (
          <button
            onClick={() => { setEditText(editing.systeme); setSaved(false) }}
            style={{
              padding: '12px 14px', backgroundColor: 'transparent',
              color: '#9CA3AF', border: '1px solid #E8E0D5',
              borderRadius: '10px', fontSize: '13px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  )

  // ── Vue liste ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FBF7F0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: '#2C1810', color: 'white', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/admin" style={{ color: '#C4622D', fontSize: '20px', fontWeight: 'bold', textDecoration: 'none' }}>←</Link>
        <h1 style={{ fontWeight: 'bold', fontSize: '18px', flex: 1 }}>Prompts IA</h1>
        <span style={{ fontSize: '11px', color: '#6B7280' }}>claude-haiku</span>
      </div>

      <div style={{ padding: '12px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>Chargement…</div>
        )}

        {prompts.map(p => (
          <button
            key={p.id}
            onClick={() => open(p)}
            style={{
              display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
              padding: '16px', marginBottom: '8px',
              backgroundColor: 'white', borderRadius: '12px',
              border: '1px solid #E8E0D5', cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: '#2C1810', marginBottom: '3px' }}>
                {p.nom}
              </div>
              {p.description && (
                <div style={{ fontSize: '12px', color: '#9CA3AF', lineHeight: 1.4 }}>{p.description}</div>
              )}
              <div style={{ fontSize: '11px', color: '#D4C5B5', marginTop: '6px', fontFamily: 'monospace' }}>
                {p.id}
              </div>
            </div>
            <div style={{ color: '#C4622D', fontSize: '18px', marginLeft: '12px', flexShrink: 0 }}>›</div>
          </button>
        ))}
      </div>
    </div>
  )
}
