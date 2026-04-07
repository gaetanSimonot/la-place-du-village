'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Note {
  id: string
  contenu: string
  created_at: string
  updated_at: string
}

export default function NotesAdmin() {
  const [notes, setNotes]             = useState<Note[]>([])
  const [loading, setLoading]         = useState(true)
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [editText, setEditText]       = useState('')
  const [saveStatus, setSaveStatus]   = useState<'saving' | 'saved' | null>(null)
  const [recording, setRecording]     = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const saveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef        = useRef<HTMLDivElement>(null)
  const inputRef         = useRef<HTMLTextAreaElement>(null)

  const fetchNotes = useCallback(async () => {
    const res  = await fetch('/api/admin/notes')
    const data = await res.json()
    setNotes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notes.length])

  // Auto-resize textarea
  const resizeInput = () => {
    const t = inputRef.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = t.scrollHeight + 'px'
  }

  // Auto-save lors de l'édition (debounce 800ms)
  const handleEditChange = (text: string) => {
    setEditText(text)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(async () => {
      await fetch(`/api/admin/notes/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: text }),
      })
      setNotes(prev => prev.map(n => n.id === editId ? { ...n, contenu: text } : n))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 1500)
    }, 800)
  }

  const sendNote = async () => {
    const text = input.trim()
    if (!text) return
    setSending(true)
    try {
      const res  = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur serveur')
      setNotes(prev => [...prev, data])
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : 'impossible d\'envoyer la note'))
    } finally {
      setSending(false)
    }
  }

  const deleteNote = async (id: string) => {
    await fetch(`/api/admin/notes/${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
    if (editId === id) setEditId(null)
  }

  const startRecording = async () => {
    if (recording) return
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        setTranscribing(true)
        const blob     = new Blob(chunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob)
        try {
          const res      = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const { text } = await res.json()
          if (text) {
            setInput(prev => (prev ? prev + ' ' : '') + text)
            setTimeout(resizeInput, 0)
          }
        } finally {
          setTranscribing(false)
          stream.getTracks().forEach(t => t.stop())
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      alert('Microphone non disponible')
    }
  }

  const stopRecording = () => {
    if (!recording) return
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const formatTime = (iso: string) => {
    const d    = new Date(iso)
    const now  = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return "à l'instant"
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  // Grouper les notes par date
  const grouped = notes.reduce<{ date: string; notes: Note[] }[]>((acc, note) => {
    const d = new Date(note.created_at)
    const dateKey = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    const last    = acc[acc.length - 1]
    if (last?.date === dateKey) last.notes.push(note)
    else acc.push({ date: dateKey, notes: [note] })
    return acc
  }, [])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 152px)' }}>

      {/* Zone messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-[#C4622D] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-center text-gray-400 py-16 text-sm">
            Aucune note encore<br />
            <span className="text-xs">Écris tes premières idées ✍️</span>
          </p>
        ) : grouped.map(group => (
          <div key={group.date}>
            {/* Séparateur date */}
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-[#E8E0D5]" />
              <span className="text-xs text-gray-400 capitalize px-1">{group.date}</span>
              <div className="flex-1 h-px bg-[#E8E0D5]" />
            </div>

            {group.notes.map(note => (
              <div key={note.id} className="flex justify-end mb-2">
                <div className="max-w-[85%]">
                  {editId === note.id ? (
                    // Mode édition
                    <div className="bg-[#C4622D] rounded-2xl rounded-tr-sm shadow-sm overflow-hidden">
                      <textarea
                        className="w-full bg-[#A3501F] text-white placeholder-orange-200 text-sm px-3 pt-3 pb-2 resize-none outline-none min-h-[80px] block"
                        value={editText}
                        onChange={e => handleEditChange(e.target.value)}
                        autoFocus
                        style={{ width: '100%' }}
                      />
                      <div className="flex items-center justify-between px-3 pb-2 pt-1">
                        <span className="text-xs text-orange-200 min-w-[80px]">
                          {saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? '✓ sauvegardé' : ''}
                        </span>
                        <div className="flex gap-3">
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="text-xs text-red-200 font-semibold"
                          >
                            Supprimer
                          </button>
                          <button
                            onClick={() => { setEditId(null); setSaveStatus(null) }}
                            className="text-xs text-white font-bold"
                          >
                            Fermer
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Mode lecture
                    <button
                      className="text-left bg-[#C4622D] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm active:opacity-75 transition-opacity"
                      onClick={() => { setEditId(note.id); setEditText(note.contenu) }}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.contenu}</p>
                      <p className="text-xs text-orange-200 mt-1.5 text-right">{formatTime(note.created_at)}</p>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Zone saisie */}
      <div className="border-t border-[#E8E0D5] bg-white px-3 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="flex-1 bg-[#FBF7F0] rounded-2xl px-4 py-2.5 text-sm text-[#2C1810] placeholder-gray-400 outline-none resize-none border border-[#E8E0D5] leading-relaxed"
            placeholder="Une idée, une amélioration…"
            value={input}
            rows={1}
            style={{ minHeight: '44px', maxHeight: '128px' }}
            onChange={e => { setInput(e.target.value); resizeInput() }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNote() }
            }}
          />

          {/* Bouton micro (maintenir appuyé) */}
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            disabled={transcribing}
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all select-none ${
              recording    ? 'bg-red-500 scale-110' :
              transcribing ? 'bg-gray-200' :
                             'bg-[#EDE0D4]'
            }`}
          >
            {transcribing ? (
              <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-lg">{recording ? '⏹' : '🎙'}</span>
            )}
          </button>

          {/* Bouton envoyer */}
          <button
            onClick={sendNote}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-full bg-[#C4622D] flex items-center justify-center shrink-0 disabled:opacity-30 active:scale-95 transition-transform"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 19V5M5 12l7-7 7 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        {recording && (
          <p className="text-center text-xs text-red-500 font-medium mt-2 animate-pulse">
            Enregistrement… relâche pour transcrire
          </p>
        )}
      </div>
    </div>
  )
}
