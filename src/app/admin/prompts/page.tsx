'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface PromptIA {
  id: string
  nom: string
  description: string | null
  systeme: string
  updated_at: string
}

export default function PromptsIAPage() {
  const [prompts, setPrompts]       = useState<PromptIA[]>([])
  const [selected, setSelected]     = useState<PromptIA | null>(null)
  const [editText, setEditText]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/admin/prompts')
      .then(r => r.json())
      .then(data => { setPrompts(data); setLoading(false) })
  }, [])

  const select = (p: PromptIA) => {
    setSelected(p)
    setEditText(p.systeme)
    setSaved(false)
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    const res = await fetch('/api/admin/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, systeme: editText }),
    })
    if (res.ok) {
      setPrompts(prev => prev.map(p => p.id === selected.id ? { ...p, systeme: editText } : p))
      setSelected(prev => prev ? { ...prev, systeme: editText } : null)
      setSaved(true)
    }
    setSaving(false)
  }

  const reset = () => {
    if (!selected) return
    const original = prompts.find(p => p.id === selected.id)
    if (original) setEditText(original.systeme)
    setSaved(false)
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FBF7F0', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ backgroundColor: '#2C1810', color: 'white', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/admin" style={{ color: '#C4622D', fontSize: '20px', fontWeight: 'bold', textDecoration: 'none' }}>←</Link>
        <h1 style={{ fontWeight: 'bold', fontSize: '18px', flex: 1 }}>Prompts IA</h1>
        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Modèle : claude-haiku</span>
      </div>

      <div style={{ display: 'flex', height: 'calc(100dvh - 56px)' }}>

        {/* Liste gauche */}
        <div style={{ width: '280px', borderRight: '1px solid #E8E0D5', backgroundColor: 'white', overflowY: 'auto', flexShrink: 0 }}>
          {loading && (
            <div style={{ padding: '24px', color: '#9CA3AF', textAlign: 'center' }}>Chargement…</div>
          )}
          {prompts.map(p => (
            <button
              key={p.id}
              onClick={() => select(p)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '14px 16px', borderBottom: '1px solid #F3EDE5',
                backgroundColor: selected?.id === p.id ? '#FEF3EC' : 'transparent',
                borderLeft: selected?.id === p.id ? '3px solid #C4622D' : '3px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: '600', fontSize: '13px', color: '#2C1810', marginBottom: '2px' }}>{p.nom}</div>
              {p.description && (
                <div style={{ fontSize: '11px', color: '#9CA3AF', lineHeight: 1.3 }}>{p.description}</div>
              )}
              <div style={{ fontSize: '10px', color: '#C4B5A5', marginTop: '4px' }}>
                id: {p.id}
              </div>
            </button>
          ))}
        </div>

        {/* Éditeur droite */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4B5A5' }}>
              Sélectionne un prompt à gauche
            </div>
          ) : (
            <>
              {/* Entête éditeur */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E0D5', backgroundColor: 'white' }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#2C1810' }}>{selected.nom}</div>
                {selected.description && (
                  <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{selected.description}</div>
                )}
                <div style={{ fontSize: '11px', color: '#C4B5A5', marginTop: '6px' }}>
                  Variables disponibles : <code style={{ backgroundColor: '#F3EDE5', padding: '1px 4px', borderRadius: '3px' }}>{'{{today}}'}</code>
                  {selected.id === 'voice_edit' && (
                    <>
                      {' '}<code style={{ backgroundColor: '#F3EDE5', padding: '1px 4px', borderRadius: '3px' }}>{'{{currentForm}}'}</code>
                      {' '}<code style={{ backgroundColor: '#F3EDE5', padding: '1px 4px', borderRadius: '3px' }}>{'{{transcript}}'}</code>
                    </>
                  )}
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={editText}
                onChange={e => { setEditText(e.target.value); setSaved(false) }}
                style={{
                  flex: 1, resize: 'none', border: 'none', outline: 'none',
                  padding: '16px 20px', fontSize: '13px', lineHeight: '1.6',
                  fontFamily: 'monospace', backgroundColor: '#FFFDF9',
                  color: '#2C1810',
                }}
              />

              {/* Barre d'actions */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #E8E0D5', backgroundColor: 'white', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={save}
                  disabled={saving || editText === selected.systeme}
                  style={{
                    backgroundColor: saving || editText === selected.systeme ? '#E8E0D5' : '#C4622D',
                    color: saving || editText === selected.systeme ? '#9CA3AF' : 'white',
                    border: 'none', borderRadius: '8px', padding: '8px 20px',
                    fontWeight: '600', fontSize: '14px', cursor: saving || editText === selected.systeme ? 'default' : 'pointer',
                  }}
                >
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
                <button
                  onClick={reset}
                  disabled={editText === selected.systeme}
                  style={{
                    backgroundColor: 'transparent', color: '#9CA3AF',
                    border: '1px solid #E8E0D5', borderRadius: '8px', padding: '8px 16px',
                    fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                {saved && (
                  <span style={{ fontSize: '13px', color: '#22C55E', fontWeight: '600' }}>
                    ✓ Sauvegardé — actif dans &lt;60 s
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
