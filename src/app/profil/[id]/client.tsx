'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie } from '@/lib/types'

interface FullProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  bio: string | null
  ville: string | null
}

interface EventSnippet {
  id: string; titre: string; date_debut: string | null
  image_url: string | null; categorie: string
}

function Avatar({ name, url, size = 72 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(size * 0.38), fontFamily: 'Syne, sans-serif',
    }}>{(name[0] ?? '?').toUpperCase()}</div>
  )
}

export default function ProfilPageClient({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const [profile, setProfile]           = useState<FullProfile | null>(null)
  const [loading, setLoading]           = useState(true)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing]   = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [events, setEvents]             = useState<EventSnippet[]>([])
  const [editing, setEditing]           = useState(false)
  const [editName, setEditName]         = useState('')
  const [editBio, setEditBio]           = useState('')
  const [editVille, setEditVille]       = useState('')
  const [saving, setSaving]             = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const isOwn = user?.id === id

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [{ data: p }, { count: fc }, { count: ing }] = await Promise.all([
          supabase.from('profiles').select('id, display_name, avatar_url, email, bio, ville').eq('id', id).single(),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
        ])
        if (p) setProfile(p as FullProfile)
        setFollowerCount(fc ?? 0)
        setFollowingCount(ing ?? 0)
        if (user) {
          const { data: f } = await supabase.from('follows')
            .select('follower_id').eq('follower_id', user.id).eq('followed_id', id).maybeSingle()
          setIsFollowing(!!f)
        }
        const { data: interests } = await supabase
          .from('interests')
          .select('evenements(id, titre, date_debut, image_url, categorie)')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(12)
        setEvents(((interests ?? []) as unknown as { evenements: EventSnippet | null }[])
          .map(i => i.evenements).filter((e): e is EventSnippet => e !== null))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, user])

  const handleFollow = async () => {
    if (!user) return
    setFollowLoading(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', id)
      setIsFollowing(false); setFollowerCount(p => Math.max(0, p - 1))
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, followed_id: id })
      setIsFollowing(true); setFollowerCount(p => p + 1)
    }
    setFollowLoading(false)
  }

  const startEdit = () => {
    setEditName(profile?.display_name ?? '')
    setEditBio(profile?.bio ?? '')
    setEditVille(profile?.ville ?? '')
    setEditing(true)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadError('')
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { setUploadError('Erreur upload — vérifie le bucket "avatars" dans Supabase Storage'); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    setProfile(p => p ? { ...p, avatar_url: publicUrl } : p)
  }

  const saveEdit = async () => {
    if (!user || saving) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      display_name: editName.trim() || null,
      bio: editBio.trim() || null,
      ville: editVille.trim() || null,
    }).eq('id', user.id)
    if (!error) {
      setProfile(p => p ? { ...p, display_name: editName.trim() || null, bio: editBio.trim() || null, ville: editVille.trim() || null } : p)
      setEditing(false)
    }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!profile) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <p style={{ color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>Profil introuvable</p>
    </div>
  )

  const name = profile.display_name || profile.email?.split('@')[0] || 'Anonyme'

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FBF7F0', fontFamily: 'Inter, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #E8E0D5', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--primary)', cursor: 'pointer', padding: 0, fontWeight: 700 }}>←</button>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: '#2C1810', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h1>
        {isOwn && !editing && (
          <button onClick={startEdit} style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 999, padding: '4px 12px', background: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
            Modifier
          </button>
        )}
      </div>

      {/* Carte profil */}
      <div style={{ backgroundColor: '#fff', padding: '24px 20px', borderBottom: '1px solid #EDE8E0' }}>

        {/* Avatar + infos */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar name={name} url={profile.avatar_url} size={76} />
            {isOwn && editing && (
              <>
                <button onClick={() => fileRef.current?.click()} style={{
                  position: 'absolute', bottom: 0, right: 0, width: 26, height: 26,
                  borderRadius: '50%', border: '2px solid #fff',
                  backgroundColor: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 12,
                }}>📷</button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
              </>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            {editing ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Prénom ou pseudo"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E0D8CE', fontSize: 15, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: '#2C1810', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                <input value={editVille} onChange={e => setEditVille(e.target.value)}
                  placeholder="Ta ville"
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 10, border: '1.5px solid #E0D8CE', fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#6B7280', outline: 'none', boxSizing: 'border-box' }} />
              </>
            ) : (
              <>
                <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: '#2C1810', margin: '0 0 4px' }}>{name}</h2>
                {profile.ville && <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>📍 {profile.ville}</p>}
              </>
            )}
          </div>
        </div>

        {/* Bio */}
        {editing ? (
          <textarea value={editBio} onChange={e => setEditBio(e.target.value)}
            placeholder="Quelques mots sur toi…" rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E0D8CE', fontSize: 14, lineHeight: 1.5, fontFamily: 'Inter, sans-serif', color: '#2C1810', resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        ) : profile.bio ? (
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.55, margin: '0 0 14px' }}>{profile.bio}</p>
        ) : null}

        {uploadError && <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{uploadError}</p>}

        {/* Boutons save/cancel */}
        {editing && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', backgroundColor: '#F5F1EC', color: '#6B7280', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Annuler
            </button>
          </div>
        )}

        {/* Stats + follow */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#2C1810', fontFamily: 'Syne, sans-serif' }}>{followerCount}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>abonnés</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#2C1810', fontFamily: 'Syne, sans-serif' }}>{followingCount}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>abonnements</div>
            </div>
          </div>
          {!isOwn && user && (
            <button onClick={handleFollow} disabled={followLoading} style={{
              marginLeft: 'auto', padding: '9px 24px', borderRadius: 999,
              border: isFollowing ? '1.5px solid #E0D8CE' : 'none',
              backgroundColor: isFollowing ? '#fff' : 'var(--primary)',
              color: isFollowing ? '#6B7280' : '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif',
              transition: 'all 0.15s',
            }}>{isFollowing ? 'Abonné ✓' : 'Suivre'}</button>
          )}
          {!isOwn && !user && (
            <button onClick={() => router.push('/')} style={{
              marginLeft: 'auto', padding: '9px 24px', borderRadius: 999, border: 'none',
              backgroundColor: 'var(--primary)', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif',
            }}>Suivre</button>
          )}
        </div>
      </div>

      {/* Événements intéressants */}
      <div style={{ padding: '20px 16px 40px' }}>
        {events.length > 0 ? (
          <>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: '#2C1810', margin: '0 0 12px' }}>
              ⭐ Événements intéressants
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {events.map(e => {
                const cat = CATEGORIES[e.categorie as Categorie] ?? CATEGORIES.autre
                return (
                  <Link key={e.id} href={`/evenement/${e.id}`} style={{ textDecoration: 'none', display: 'block', borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
                    <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative', overflow: 'hidden' }}>
                      {e.image_url
                        ? <img src={e.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{cat.emoji}</div>
                      }
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ fontWeight: 700, fontSize: 12, color: '#2C1810', margin: 0, lineHeight: 1.35, maxHeight: '2.7em', overflow: 'hidden' }}>{e.titre}</p>
                      {e.date_debut && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0' }}>{new Date(e.date_debut + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', paddingTop: 32 }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>⭐</p>
            <p style={{ fontSize: 14, color: '#9CA3AF' }}>Aucun événement intéressant pour l&apos;instant</p>
          </div>
        )}
      </div>
    </div>
  )
}
