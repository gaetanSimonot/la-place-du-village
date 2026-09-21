'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTerritoire } from '@/components/TerritoireProvider'
import { lireConfigsClient, urlEcritureConfig } from '@/lib/configClient'
import ChoixInvites from '@/components/admin/ChoixInvites'
import { markHubDirty } from '@/lib/hubFresh'
import { useAuth } from '@/hooks/useAuth'
import { FEATURED_SLOTS, type FeaturedSlotRow } from '@/lib/featured'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import {
  SPLASH_PROMO_BOUNDS, SPLASH_PROMO_DEFAULTS, SPLASH_PROMO_VARIANTS, parseSplashPromo,
  type SplashPromoConfig, type SplashPromoVariantId,
} from '@/lib/splashPromo'
import SplashPromoView from '@/components/SplashPromoView'
import { parseVisibilite, type VisibiliteCinema } from '@/lib/cinema'
import { parseEntree, PAGES_ARRIVEE, type EntreeApp, type PageArrivee } from '@/lib/entreeApp'
import EmbedPicker, { type EmbedItem } from '@/components/EmbedPicker'
import { normaliserHerosListe, HEROS_VIDE, type HerosVillage, type PublicHeros } from '@/lib/villageHero'

interface EnrichedSlot extends FeaturedSlotRow {
  title?: string
  imageUrl?: string | null
  detailUrl?: string
}

/** Aspect ratio du hero du hub (180h sur viewport - 32px de gutters). */
const HUB_HERO_ASPECT = 2.0

function fmtRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 'expiré'
  const h = Math.floor(ms / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}j`
}

/**
 * fetch pour les écritures de cette page. Chaque écriture change l'accueil
 * (mise en avant, ordre des sections, slide intro) alors que /api/hub est
 * caché 60s par le CDN : on pose un drapeau pour que le prochain affichage
 * de l'accueil aille chercher une copie fraîche au lieu de la périmée.
 */
async function writeJson(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.ok) markHubDirty()
  return res
}

/** Gabarit commun des champs du héros. */
/** Petit bouton carre : monter, descendre, retirer une fiche du heros. */
const MINI_HEROS: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid #E5DDD2',
  background: '#FFFFFF', cursor: 'pointer', fontSize: 13, lineHeight: 1,
  color: '#5A4A3A', padding: 0,
}

const CHAMP = { width: '100%', padding: '9px 10px', borderRadius: 9, border: '1.5px solid #E5DDD2', fontSize: 12.5, boxSizing: 'border-box' as const }

export default function AdminHubCarousel() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()
  const [allSlots, setAllSlots] = useState<EnrichedSlot[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState(false)
  const [cropping, setCropping] = useState<EnrichedSlot | null>(null)
  // Slide intro "Bouche à oreille" en première position du carrousel hub_hero
  const [introEnabled, setIntroEnabled] = useState(false)
  const [introSaving, setIntroSaving]   = useState(false)
  // Image custom du slide intro (null = utiliser /hub-intro-slide.png par défaut)
  const [introImageUrl, setIntroImageUrl] = useState<string | null>(null)
  const [introImgUploading, setIntroImgUploading] = useState(false)
  const introImgInput = useRef<HTMLInputElement>(null)
  // Splashs promotionnels de l'offre Habitant (config('splash_promo'))
  const [splash, setSplash] = useState<SplashPromoConfig>(SPLASH_PROMO_DEFAULTS)
  const [splashSaving, setSplashSaving] = useState(false)
  const [splashSaved, setSplashSaved]   = useState(false)
  const [splashError, setSplashError]   = useState<string | null>(null)
  /** Visibilité du bloc « Au cinéma aujourd'hui » : masqué / admin / tous. */
  // L'entrée de l'app : écran d'accueil et page d'arrivée, une seule clé.
  const [entree, setEntree] = useState<EntreeApp>({ splash: true, page: 'carte' })
  const [entreeSaving, setEntreeSaving] = useState(false)

  const [cinemaVis, setCinemaVis] = useState<VisibiliteCinema>('admin')
  const [theatreVis, setTheatreVis] = useState<VisibiliteCinema>('admin')
  const [theatreInvites, setTheatreInvites] = useState<string[]>([])
  const [radioVis, setRadioVis] = useState<VisibiliteCinema>('admin')
  const [radioSaving, setRadioSaving] = useState(false)
  const [cinemaSaving, setCinemaSaving] = useState(false)
  const [theatreSaving, setTheatreSaving] = useState(false)
  /** Visibilité de l'Assistant Village dans la barre de recherche. */
  const [assistantVis, setAssistantVis] = useState<VisibiliteCinema>('admin')
  const [assistantSaving, setAssistantSaving] = useState(false)
  /** Le héros du Village — un seul à la fois, cf. src/lib/villageHero.ts. */
  // Une LISTE de fiches : l'encart les fait défiler. Vide = pas de héros.
  const [herosListe, setHerosListe] = useState<HerosVillage[]>([])
  const [herosSaving, setHerosSaving] = useState(false)
  /** Index de la fiche pour laquelle le sélecteur est ouvert. `null` = fermé. */
  const [herosPicker, setHerosPicker] = useState<number | null>(null)
  const [herosMsg, setHerosMsg] = useState<string | null>(null)
  /** Double clic requis avant de relancer le cycle de tout le monde. */
  const [resetAsked, setResetAsked] = useState(false)
  // Aperçu admin d'une variante : purement local, n'écrit rien et n'affecte
  // pas ce que voient les habitants.
  const [previewVariant, setPreviewVariant] = useState<SplashPromoVariantId | null>(null)
  /* Le territoire qu'on administre. Un visiteur ne peut pas en changer : pour
     tout le monde sauf l'admin c'est celui par defaut, et cet ecran se
     comporte alors exactement comme avant. */
  const { territoire: territoireAdmin } = useTerritoire()
  /* Le territoire voyage avec chaque appel admin : ce qu'on epingle
     appartient a la ville qu'on administre. */
  const qTerrSlots = territoireAdmin?.slug ? `?territoire=${encodeURIComponent(territoireAdmin.slug)}` : ''

  // Charge la config slide intro (toggle + image custom)
  useEffect(() => {
    if (authLoading || !user || !isAdmin) return
    /*
     * On administre LE TERRITOIRE COURANT. Les reglages editoriaux lus ici
     * sont les siens ; s'il n'en a pas, ils reviennent vides — jamais ceux
     * d'un autre. La regle est partagee avec le serveur (CLES_EDITORIALES).
     */
    lireConfigsClient([
      'hub_hero_intro_enabled', 'hub_hero_intro_image_url',       'splash_promo', 'cinema_village_public', 'theatre_village_public',
      'radio_village_public', 'assistant_visibilite', 'village_hero', 'entree_app',
    ], territoireAdmin?.id ?? null, !!territoireAdmin?.par_defaut).then(cfg => {
      const toggleRes = { data: { value: cfg.hub_hero_intro_enabled } }
      const imgRes    = { data: { value: cfg.hub_hero_intro_image_url } }
      const splashRes = { data: { value: cfg.splash_promo } }
      const cineRes   = { data: { value: cfg.cinema_village_public } }
      const theaRes   = { data: { value: cfg.theatre_village_public } }
      const radioRes  = { data: { value: cfg.radio_village_public } }
      const assistRes = { data: { value: cfg.assistant_visibilite } }
      const herosRes  = { data: { value: cfg.village_hero } }
      const entreeRes = { data: { value: cfg.entree_app } }
      setIntroEnabled(toggleRes.data?.value === 'true')
      setIntroImageUrl(imgRes.data?.value || null)
      setSplash(parseSplashPromo(splashRes.data?.value))
      setCinemaVis(parseVisibilite(cineRes.data?.value))
      setTheatreVis(parseVisibilite(theaRes.data?.value))
      setRadioVis(parseVisibilite(radioRes.data?.value))
      setAssistantVis(parseVisibilite(assistRes.data?.value))
      setHerosListe(normaliserHerosListe(herosRes.data?.value))
      setEntree(parseEntree(entreeRes.data?.value))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin, territoireAdmin?.id, territoireAdmin?.par_defaut])

  async function toggleIntro(next: boolean) {
    if (introSaving) return
    const prev = introEnabled
    setIntroEnabled(next)
    setIntroSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setIntroEnabled(prev); setIntroSaving(false); return }
    const res = await writeJson(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key: 'hub_hero_intro_enabled', value: next ? 'true' : 'false' }),
    })
    if (!res.ok) setIntroEnabled(prev)
    setIntroSaving(false)
  }

  async function handleIntroImagePick(file: File) {
    if (introImgUploading) return
    setIntroImgUploading(true)
    try {
      // Carrousel : ratio ~2:1 (180h x 360w typique), maxDim 1200, qualité 0.9
      const compressed = await compressImage(file, { maxDim: 1200, quality: 0.9 })
      const r = await uploadViaSignedUrl({ file: compressed, kind: 'hub-hero-intro' })
      const newUrl = `${r.publicUrl}?v=${Date.now()}`

      // Sauvegarde l'URL dans config
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setIntroImgUploading(false); return }
      const res = await writeJson(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ key: 'hub_hero_intro_image_url', value: newUrl }),
      })
      if (res.ok) setIntroImageUrl(newUrl)
    } catch (e) {
      console.error('[intro image upload]', e)
    } finally {
      setIntroImgUploading(false)
    }
  }

  async function resetIntroImage() {
    if (introImgUploading) return
    if (!confirm('Restaurer l\'image par défaut du slide intro ?')) return
    setIntroImgUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setIntroImgUploading(false); return }
    // Vide la config → HubView retombera sur /hub-intro-slide.png
    await writeJson(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ key: 'hub_hero_intro_image_url', value: '' }),
    })
    setIntroImageUrl(null)
    setIntroImgUploading(false)
  }


  /**
   * Les deux réglages d'entrée partent ensemble : ils vivent dans la même clé,
   * et la sauver en deux fois ferait un état transitoire où l'un est enregistré
   * et l'autre non.
   */
  async function enregistrerEntree(patch: Partial<EntreeApp>) {
    if (entreeSaving) return
    const avant = entree
    const next  = { ...entree, ...patch }
    setEntree(next); setEntreeSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body:    JSON.stringify({ key: 'entree_app', value: JSON.stringify(next) }),
    }).catch(() => null)
    if (!res?.ok) setEntree(avant)
    setEntreeSaving(false)
  }

  async function changerCinemaVis(next: VisibiliteCinema) {
    if (cinemaSaving || next === cinemaVis) return
    const avant = cinemaVis
    setCinemaVis(next); setCinemaSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body:    JSON.stringify({ key: 'cinema_village_public', value: next }),
    }).catch(() => null)
    if (!res?.ok) setCinemaVis(avant)
    setCinemaSaving(false)
  }

  async function changerTheatreVis(next: VisibiliteCinema) {
    if (theatreSaving || next === theatreVis) return
    const avant = theatreVis
    setTheatreVis(next); setTheatreSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body:    JSON.stringify({ key: 'theatre_village_public', value: next }),
    }).catch(() => null)
    if (!res?.ok) setTheatreVis(avant)
    setTheatreSaving(false)
  }

  async function changerRadioVis(next: VisibiliteCinema) {
    if (radioSaving || next === radioVis) return
    const avant = radioVis
    setRadioVis(next); setRadioSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body:    JSON.stringify({ key: 'radio_village_public', value: next }),
    }).catch(() => null)
    if (!res?.ok) setRadioVis(avant)
    setRadioSaving(false)
  }

  /**
   * Enregistre la LISTE entière dans la clé de config, à chaque changement.
   * Un bloc éditorial, pas six réglages indépendants : l'écrire d'un coup
   * évite les états mi-anciens mi-nouveaux, et la liste est minuscule.
   */
  async function enregistrerHerosListe(suivante: HerosVillage[]) {
    if (herosSaving) return
    setHerosListe(suivante); setHerosSaving(true); setHerosMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body:    JSON.stringify({ key: 'village_hero', value: JSON.stringify(suivante) }),
    }).catch(() => null)
    setHerosSaving(false)
    setHerosMsg(res?.ok ? 'Enregistré' : 'Échec de l’enregistrement')
    setTimeout(() => setHerosMsg(null), 2500)
  }

  /** Modifie UNE fiche de la liste, les autres intactes. */
  function modifierHeros(i: number, patch: Partial<HerosVillage>) {
    void enregistrerHerosListe(herosListe.map((h, k) => (k === i ? { ...h, ...patch } : h)))
  }

  /** Une fiche de plus, vide et masquée : on la remplit avant de l'ouvrir. */
  function ajouterHeros() {
    void enregistrerHerosListe([...herosListe, { ...HEROS_VIDE }])
  }

  function retirerHeros(i: number) {
    void enregistrerHerosListe(herosListe.filter((_, k) => k !== i))
  }

  /** Monte ou descend une fiche : l'ordre est celui du défilement. */
  function deplacerHeros(i: number, sens: -1 | 1) {
    const j = i + sens
    if (j < 0 || j >= herosListe.length) return
    const copie = [...herosListe]
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
    void enregistrerHerosListe(copie)
  }

  /**
   * Une fiche choisie au sélecteur remplit le héros : titre, sous-titre et
   * image. On ne remplace PAS ce qui a déjà été écrit à la main — c'est
   * presque toujours une reformulation volontaire.
   */
  function prendreCible(it: EmbedItem) {
    const i = herosPicker
    setHerosPicker(null)
    if (i === null || !herosListe[i]) return
    const h = herosListe[i]
    modifierHeros(i, {
      cible: { sorte: 'interne', kind: it.kind, id: it.id },
      titre: h.titre.trim() || it.title,
      sousTitre: h.sousTitre ?? it.subtitle,
      image: h.image ?? it.photo,
    })
  }

  async function changerAssistantVis(next: VisibiliteCinema) {
    if (assistantSaving || next === assistantVis) return
    const avant = assistantVis
    setAssistantVis(next); setAssistantSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(urlEcritureConfig(territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body:    JSON.stringify({ key: 'assistant_visibilite', value: next }),
    }).catch(() => null)
    if (!res?.ok) setAssistantVis(avant)
    setAssistantSaving(false)
  }


  /**
   * Splashs promo : un seul bouton pour tout le bloc (toggle + 4 nombres).
   * Pas de markHubDirty ici — ce réglage ne change pas /api/hub, il est lu par
   * /api/splash-promo qui n'est pas caché.
   */
  async function saveSplash(resetCycle = false) {
    if (splashSaving) return
    setSplashSaving(true)
    setSplashError(null)
    setSplashSaved(false)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSplashError('Session expirée, recharge la page.'); setSplashSaving(false); return }
    const res = await fetch(`/api/splash-promo${qTerrSlots}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(resetCycle ? { ...splash, resetCycle: true } : splash),
    })
    if (res.ok) {
      // On réaffiche la config telle qu'enregistrée (valeurs bornées côté serveur).
      const body = await res.json().catch(() => null)
      if (body?.config) setSplash(body.config)
      setSplashSaved(true)
      setResetAsked(false)
      setTimeout(() => setSplashSaved(false), 2500)
    } else {
      setSplashError('Enregistrement impossible.')
    }
    setSplashSaving(false)
  }

  /** Saisie d'un champ numérique : on laisse le champ vide devenir 0. */
  function setSplashNum(key: keyof typeof SPLASH_PROMO_BOUNDS, raw: string) {
    const n = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(n)) return
    const { min, max } = SPLASH_PROMO_BOUNDS[key]
    setSplash(s => ({ ...s, [key]: Math.min(max, Math.max(min, Math.round(n))) }))
    setSplashSaved(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) {
      router.replace('/')
      return
    }
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin, showExpired])

  async function reload() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/featured-slots?all=${showExpired ? '1' : ''}${qTerrSlots ? '&' + qTerrSlots.slice(1) : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setLoading(false)
      return
    }
    const { slots } = await res.json()
    const enriched = await enrich(slots as FeaturedSlotRow[])
    setAllSlots(enriched)
    setLoading(false)
  }

  async function enrich(slots: FeaturedSlotRow[]): Promise<EnrichedSlot[]> {
    if (!slots.length) return []

    const byType: Record<string, string[]> = {}
    slots.forEach(s => {
      byType[s.content_type] ??= []
      byType[s.content_type].push(s.content_id)
    })

    const titleMap: Record<string, { title: string; imageUrl: string | null; detailUrl: string }> = {}

    if (byType.evenement) {
      const { data } = await supabase
        .from('evenements')
        .select('id, titre, image_url')
        .in('id', byType.evenement)
      ;(data ?? []).forEach(d => { titleMap[`evenement:${d.id}`] = { title: d.titre, imageUrl: d.image_url, detailUrl: `/evenement/${d.id}` } })
    }
    if (byType.etablissement) {
      const { data } = await supabase
        .from('etablissements')
        .select('id, nom, photos')
        .in('id', byType.etablissement)
      ;(data ?? []).forEach(d => { titleMap[`etablissement:${d.id}`] = { title: d.nom, imageUrl: d.photos?.[0] ?? null, detailUrl: `/etablissement/${d.id}` } })
    }
    if (byType.producteur) {
      const { data } = await supabase
        .from('producers')
        .select('id, nom, photos')
        .in('id', byType.producteur)
      ;(data ?? []).forEach(d => { titleMap[`producteur:${d.id}`] = { title: d.nom, imageUrl: d.photos?.[0] ?? null, detailUrl: `/producteur/${d.id}` } })
    }
    if (byType.annonce) {
      const { data } = await supabase
        .from('annonces')
        .select('id, titre, photos')
        .in('id', byType.annonce)
      ;(data ?? []).forEach(d => { titleMap[`annonce:${d.id}`] = { title: d.titre, imageUrl: d.photos?.[0] ?? null, detailUrl: `/annonces/${d.id}` } })
    }
    if (byType.promotion) {
      const { data } = await supabase
        .from('promotions')
        .select('id, title, image_url')
        .in('id', byType.promotion)
      ;(data ?? []).forEach(d => { titleMap[`promotion:${d.id}`] = { title: d.title, imageUrl: d.image_url, detailUrl: `/promotions?id=${d.id}` } })
    }
    if (byType.forum_topic) {
      const { data } = await supabase
        .from('forum_topics')
        .select('id, titre, media')
        .in('id', byType.forum_topic)
      ;(data ?? []).forEach(d => {
        const media = d.media as Array<{ t?: string; url?: string }> | null
        const photo = Array.isArray(media) ? (media.find(m => m?.t === 'photo')?.url ?? null) : null
        titleMap[`forum_topic:${d.id}`] = { title: d.titre, imageUrl: photo, detailUrl: `/forum/${d.id}` }
      })
    }

    return slots.map(s => ({
      ...s,
      title:     titleMap[`${s.content_type}:${s.content_id}`]?.title ?? '(contenu introuvable)',
      imageUrl:  titleMap[`${s.content_type}:${s.content_id}`]?.imageUrl ?? null,
      detailUrl: titleMap[`${s.content_type}:${s.content_id}`]?.detailUrl,
    }))
  }

  async function patchSlot(id: string, patch: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await writeJson(`/api/featured-slots${qTerrSlots}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, ...patch }),
    })
    if (res.ok) reload()
  }

  async function deleteSlot(id: string) {
    if (!confirm('Supprimer ce slot ?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await writeJson(`/api/featured-slots?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) reload()
  }

  function bumpPriority(slot: EnrichedSlot, delta: number) {
    patchSlot(slot.id, { priority: slot.priority + delta })
  }

  function extendDuration(slot: EnrichedSlot, hours: number) {
    const newEnd = new Date(new Date(slot.ends_at).getTime() + hours * 3600 * 1000).toISOString()
    patchSlot(slot.id, { ends_at: newEnd })
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'var(--font-body), sans-serif', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #E5DDD2',
        backgroundColor: 'rgba(242,235,224,0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A1209', letterSpacing: '-0.02em' }}>
              Hub carousel
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
              Gestion éditoriale de la mise en avant
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7A6A5A', cursor: 'pointer' }}>
            <input type="checkbox" checked={showExpired} onChange={e => setShowExpired(e.target.checked)} />
            Voir expirés
          </label>
        </div>
      </div>

      {error && <p style={{ padding: 16, color: '#C0392B', fontSize: 13, textAlign: 'center' }}>{error}</p>}

      {/* Toggle slide intro "Bouche à oreille" + image custom */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: introEnabled ? '#E8F2EB' : '#FFFFFF',
          border: `1px solid ${introEnabled ? '#C8DEC0' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: introSaving ? 'default' : 'pointer',
          }}>
            <input
              type="checkbox"
              checked={introEnabled}
              disabled={introSaving}
              onChange={e => toggleIntro(e.target.checked)}
              style={{ accentColor: '#2D5A3D', cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
                Slide intro « Bouche à oreille »
              </div>
              <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                Affiche en première position du carrousel. Click = ouvre la modale
                « C&apos;est quoi La Place du Village ? ».
              </div>
            </div>
          </label>

          {/* Preview + upload image custom */}
          {introEnabled && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #C8DEC0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5B8A4A', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Image du slide
              </div>
              <div style={{
                position: 'relative',
                width: '100%', height: 160, borderRadius: 12, overflow: 'hidden',
                background: '#FBF3E6', border: '1px solid #E5DDD2',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={introImageUrl || '/hub-intro-slide.webp'}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span style={{
                  position: 'absolute', top: 8, left: 8,
                  background: '#FFFFFF', color: '#7A6A5A',
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 7px', borderRadius: 999,
                  border: '1px solid #E5DDD2',
                }}>
                  {introImageUrl ? 'Personnalisée' : 'Par défaut'}
                </span>
              </div>

              <input
                ref={introImgInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleIntroImagePick(f)
                  e.target.value = ''
                }}
              />

              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => introImgInput.current?.click()}
                  disabled={introImgUploading}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 8,
                    background: '#2D5A3D', color: '#FFFFFF',
                    border: 'none', fontSize: 12, fontWeight: 800,
                    cursor: introImgUploading ? 'default' : 'pointer',
                    opacity: introImgUploading ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {introImgUploading ? 'Upload…' : 'Changer l\'image'}
                </button>
                {introImageUrl && (
                  <button
                    type="button"
                    onClick={resetIntroImage}
                    disabled={introImgUploading}
                    style={{
                      padding: '9px 12px', borderRadius: 8,
                      background: '#FFFFFF', color: '#7A6A5A',
                      border: '1px solid #E5DDD2', fontSize: 12, fontWeight: 700,
                      cursor: introImgUploading ? 'default' : 'pointer',
                      opacity: introImgUploading ? 0.6 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    Restaurer défaut
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── L'entrée de l'app ───────────────────────────────────────────
          Deux réglages qui répondent à la même question — que voit-on en
          arrivant ? — donc un seul bloc. À ne pas confondre avec les splashs
          promo plus bas : ceux-là surgissent en cours de visite. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: '1px solid #E5DDD2', boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
            L&apos;entrée de l&apos;app
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 12, lineHeight: 1.45 }}>
            Ce qu&apos;on voit en ouvrant l&apos;application. Un changement
            s&apos;applique au lancement suivant, pas aux sessions déjà ouvertes.
          </div>

          {/* L'écran d'accueil éditorial */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 11,
            cursor: entreeSaving ? 'default' : 'pointer',
            padding: 11, borderRadius: 10,
            background: entree.splash ? '#F4FAF5' : '#FDFAF5',
            border: `1px solid ${entree.splash ? '#C8DEC0' : '#E5DDD2'}`,
          }}>
            <input
              type="checkbox"
              checked={entree.splash}
              disabled={entreeSaving}
              onChange={e => enregistrerEntree({ splash: e.target.checked })}
              style={{ width: 17, height: 17, marginTop: 1, accentColor: '#2D5A3D', cursor: 'inherit' }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#1A1209' }}>
                Écran d&apos;accueil
              </span>
              <span style={{ display: 'block', fontSize: 11, color: '#7A6A5A', marginTop: 3, lineHeight: 1.45 }}>
                Les tuiles du jour et le bouton « Explorer la Place », une fois
                par ouverture. Décoché, l&apos;app ouvre directement sur la page
                choisie ci-dessous. (Il n&apos;a jamais existé sur ordinateur.)
              </span>
            </span>
          </label>

          {/* La page d'arrivée */}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8A7A6A', margin: '14px 0 8px' }}>
            On arrive sur
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PAGES_ARRIVEE.map(o => {
              const actif = entree.page === o.id
              return (
                <button
                  key={o.id}
                  onClick={() => enregistrerEntree({ page: o.id as PageArrivee })}
                  disabled={entreeSaving}
                  style={{
                    padding: '10px 11px', borderRadius: 10, textAlign: 'left',
                    border: `1.5px solid ${actif ? '#2D5A3D' : '#E5DDD2'}`,
                    background: actif ? '#F4FAF5' : '#FDFAF5',
                    cursor: entreeSaving ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body), sans-serif',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: actif ? '#2D5A3D' : '#1A1209' }}>{o.label}</div>
                  <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 2 }}>{o.sous}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bloc cinéma sur la page Village — trois états nommés. « Masqué »
          l'emporte sur tout, y compris sur ton propre compte : c'est ce qui
          permet de le couper net sans rien décocher ailleurs. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: `1px solid ${cinemaVis === 'tous' ? '#F0B08A' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
            Bloc « Au cinéma aujourd&apos;hui »
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 10, lineHeight: 1.45 }}>
            Sur la page Village. Quel que soit le choix, il disparaît les jours
            sans séance — un cinéma fermé le mardi ne laisse pas de cadre vide.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { v: 'masque' as const, titre: 'Masqué',  sous: 'personne' },
              { v: 'admin'  as const, titre: 'Admin',   sous: 'toi seul' },
              { v: 'tous'   as const, titre: 'Tous',    sous: 'les habitants' },
            ]).map(o => {
              const actif = cinemaVis === o.v
              return (
                <button
                  key={o.v}
                  onClick={() => changerCinemaVis(o.v)}
                  disabled={cinemaSaving}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                    border: `1.5px solid ${actif ? '#C84B2F' : '#E5DDD2'}`,
                    background: actif ? '#FFF8F3' : '#FDFAF5',
                    cursor: cinemaSaving ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body), sans-serif',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: actif ? '#C0440A' : '#1A1209' }}>{o.titre}</div>
                  <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 2 }}>{o.sous}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bloc théâtre sur la page Village — mêmes trois états que le cinéma,
          et le même défaut : `admin`. Un module qu'on oublie de régler reste
          invisible, il ne s'ouvre jamais tout seul. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: `1px solid ${theatreVis === 'tous' ? '#F0B08A' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
            Bloc « Au théâtre »
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 10, lineHeight: 1.45 }}>
            Sur la page Village. Quel que soit le choix, il disparaît quand aucune
            représentation n&apos;est annoncée — une saison finie ne laisse pas de cadre vide.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { v: 'masque' as const, titre: 'Masqué', sous: 'personne' },
              { v: 'admin'  as const, titre: 'Admin',  sous: 'toi seul' },
              { v: 'tous'   as const, titre: 'Tous',   sous: 'les habitants' },
            ]).map(o => {
              const actif = theatreVis === o.v
              return (
                <button
                  key={o.v}
                  onClick={() => changerTheatreVis(o.v)}
                  disabled={theatreSaving}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                    border: `1.5px solid ${actif ? '#C84B2F' : '#E5DDD2'}`,
                    background: actif ? '#FFF8F3' : '#FDFAF5',
                    cursor: theatreSaving ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body), sans-serif',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: actif ? '#C0440A' : '#1A1209' }}>{o.titre}</div>
                  <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 2 }}>{o.sous}</div>
                </button>
              )
            })}
          </div>

          {/* Les invités n'apparaissent QUE sur « Admin ». En « Masqué »
              personne ne voit rien, eux compris ; en « Tous » le village voit
              déjà. Dans les deux cas la liste n'agit pas, et la montrer
              laisserait croire le contraire. */}
          {theatreVis === 'admin' && (
            <ChoixInvites
              cleVisibilite="theatre_village_public"
              slugTerritoire={territoireAdmin?.par_defaut ? null : territoireAdmin?.slug ?? null}
              invites={theatreInvites}
              onChange={setTheatreInvites}
            />
          )}
        </div>
      </div>

      {/* Bloc Radio Escapades sur la page Village — mêmes trois états que le
          cinéma. « Masqué » retire AUSSI la mention « Sélection Radio
          Escapades » des fiches d'événements : un badge qui renvoie à un
          module invisible ne veut rien dire. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: `1px solid ${radioVis === 'tous' ? '#F0B08A' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
            Bloc « Radio Escapades »
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 10, lineHeight: 1.45 }}>
            Un seul réglage pour tout le module : le bloc sur la page Village,
            la mention « Sélection Radio Escapades » sur les fiches, et le
            bouton d&apos;écoute en direct dans la barre du haut. Le bloc
            disparaît de lui-même tant qu&apos;aucune émission n&apos;est en
            ligne.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { v: 'masque' as const, titre: 'Masqué',  sous: 'personne' },
              { v: 'admin'  as const, titre: 'Admin',   sous: 'toi seul' },
              { v: 'tous'   as const, titre: 'Tous',    sous: 'les habitants' },
            ]).map(o => {
              const actif = radioVis === o.v
              return (
                <button
                  key={o.v}
                  onClick={() => changerRadioVis(o.v)}
                  disabled={radioSaving}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                    border: `1.5px solid ${actif ? '#C84B2F' : '#E5DDD2'}`,
                    background: actif ? '#FFF8F3' : '#FDFAF5',
                    cursor: radioSaving ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body), sans-serif',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: actif ? '#C0440A' : '#1A1209' }}>{o.titre}</div>
                  <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 2 }}>{o.sous}</div>
                </button>
              )
            })}
          </div>
          <a href="/radio/admin" style={{
            display: 'inline-block', marginTop: 12, fontSize: 12, fontWeight: 700,
            color: '#2D5A3D', textDecoration: 'none',
          }}>
            Monter l&apos;émission de la semaine →
          </a>
        </div>
      </div>

      {/* ── Le héros du Village ─────────────────────────────────────────
          Un emplacement, une ou PLUSIEURS fiches : au-delà de la première,
          l'encart les fait défiler tout seul, comme le bandeau « à la une ».
          L'ordre de cette liste est celui du défilement.

          Chaque fiche pointe soit sur une fiche de l'app (choisie au
          sélecteur), soit sur un lien du dehors — auquel cas le titre et
          l'image se saisissent à la main : beaucoup de sites, les cagnottes
          en particulier, refusent les robots, et aucun aperçu automatique ne
          les fera parler.

          Chaque fiche porte SA visibilité : on peut en préparer une en
          « Admin » pendant qu'une autre tourne déjà pour tout le village. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: `1px solid ${herosListe.some(h => h.public === 'tous') ? '#C8DEC0' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>Héros du Village</div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 12, lineHeight: 1.45 }}>
            L&apos;encart mis en avant sur la page Village. À partir de deux
            fiches, elles défilent l&apos;une après l&apos;autre.
          </div>

          {herosListe.length === 0 && (
            <div style={{ fontSize: 11.5, color: '#8A7A6A', marginBottom: 10 }}>
              Aucune fiche. L&apos;encart ne s&apos;affiche pas.
            </div>
          )}

          {herosListe.map((heros, i) => (
            <div key={i} style={{
              border: '1px solid #EDE6DA', borderRadius: 11, padding: 12, marginBottom: 10,
              background: '#FDFAF5',
            }}>
              {/* Barre de la fiche : son rang, et de quoi la déplacer ou la retirer. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', letterSpacing: '.06em' }}>
                  FICHE {i + 1}
                </span>
                <span style={{ flex: 1 }} />
                <button onClick={() => deplacerHeros(i, -1)} disabled={herosSaving || i === 0}
                        aria-label="Monter la fiche"
                        style={{ ...MINI_HEROS, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                <button onClick={() => deplacerHeros(i, 1)} disabled={herosSaving || i === herosListe.length - 1}
                        aria-label="Descendre la fiche"
                        style={{ ...MINI_HEROS, opacity: i === herosListe.length - 1 ? 0.35 : 1 }}>↓</button>
                <button onClick={() => retirerHeros(i)} disabled={herosSaving}
                        aria-label="Retirer cette fiche"
                        style={{ ...MINI_HEROS, color: '#B53A22' }}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {([
                  { v: 'masque' as const, titre: 'Masqué', sous: 'personne' },
                  { v: 'admin'  as const, titre: 'Admin',  sous: 'toi seul' },
                  { v: 'tous'   as const, titre: 'Tous',   sous: 'les habitants' },
                ]).map(o => {
                  const actif = heros.public === o.v
                  return (
                    <button
                      key={o.v}
                      onClick={() => modifierHeros(i, { public: o.v as PublicHeros })}
                      disabled={herosSaving}
                      style={{
                        flex: 1, padding: '8px 6px', borderRadius: 9, textAlign: 'center',
                        border: `1.5px solid ${actif ? '#2D5A3D' : '#E5DDD2'}`,
                        background: actif ? '#F4FAF5' : '#FFFFFF',
                        cursor: herosSaving ? 'default' : 'pointer',
                        fontFamily: 'var(--font-body), sans-serif',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: actif ? '#2D5A3D' : '#1A1209' }}>{o.titre}</div>
                      <div style={{ fontSize: 9.5, color: '#8A7A6A', marginTop: 1 }}>{o.sous}</div>
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button
                  onClick={() => setHerosPicker(i)}
                  style={{ flex: 1, padding: '9px 8px', borderRadius: 9, border: `1.5px solid ${heros.cible.sorte === 'interne' ? '#2D5A3D' : '#E5DDD2'}`, background: heros.cible.sorte === 'interne' ? '#F4FAF5' : '#FFFFFF', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1A1209' }}
                >
                  {heros.cible.sorte === 'interne' ? 'Changer la fiche…' : 'Choisir une fiche…'}
                </button>
                <button
                  onClick={() => modifierHeros(i, { cible: { sorte: 'lien', url: heros.cible.sorte === 'lien' ? heros.cible.url : '' } })}
                  style={{ flex: 1, padding: '9px 8px', borderRadius: 9, border: `1.5px solid ${heros.cible.sorte === 'lien' ? '#2D5A3D' : '#E5DDD2'}`, background: heros.cible.sorte === 'lien' ? '#F4FAF5' : '#FFFFFF', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1A1209' }}
                >
                  Un lien du dehors
                </button>
              </div>

              {heros.cible.sorte === 'interne' && (
                <div style={{ fontSize: 11, color: '#5B8A4A', marginBottom: 8 }}>
                  Fiche choisie — {heros.cible.kind}
                </div>
              )}
              {heros.cible.sorte === 'lien' && (
                <input
                  type="url"
                  defaultValue={heros.cible.url}
                  onBlur={e => modifierHeros(i, { cible: { sorte: 'lien', url: e.target.value.trim() } })}
                  placeholder="https://…"
                  style={{ ...CHAMP, marginBottom: 8 }}
                />
              )}

              <input
                defaultValue={heros.etiquette}
                onBlur={e => modifierHeros(i, { etiquette: e.target.value.trim() || 'À la une' })}
                placeholder="Étiquette — Entraide, Urgence…"
                style={{ ...CHAMP, marginBottom: 6 }}
              />
              <input
                defaultValue={heros.titre}
                onBlur={e => modifierHeros(i, { titre: e.target.value.trim() })}
                placeholder="Titre — sans lui, la fiche ne s’affiche pas"
                style={{ ...CHAMP, marginBottom: 6 }}
              />
              <input
                defaultValue={heros.sousTitre ?? ''}
                onBlur={e => modifierHeros(i, { sousTitre: e.target.value.trim() || null })}
                placeholder="Sous-titre"
                style={{ ...CHAMP, marginBottom: 6 }}
              />
              <input
                type="url"
                defaultValue={heros.image ?? ''}
                onBlur={e => modifierHeros(i, { image: e.target.value.trim() || null })}
                placeholder="Image (URL)"
                style={{ ...CHAMP, marginBottom: 10 }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1A1209', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={heros.surCarte}
                  onChange={e => modifierHeros(i, { surCarte: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                La reprendre à la une, en bandeau sur la carte
              </label>
            </div>
          ))}

          {/* Le bandeau de la carte ne montre qu’une chose : autant le dire
              ici plutôt que de laisser chercher pourquoi la deuxième coche ne
              donne rien. */}
          {herosListe.filter(h => h.surCarte).length > 1 && (
            <div style={{ fontSize: 11, color: '#B07B2A', marginBottom: 10, lineHeight: 1.45 }}>
              Plusieurs fiches sont cochées pour la carte : le bandeau n&apos;en
              montre qu&apos;une, la première de la liste.
            </div>
          )}

          <button
            onClick={ajouterHeros}
            disabled={herosSaving}
            style={{
              width: '100%', padding: '10px 8px', borderRadius: 10,
              border: '1.5px dashed #C8DEC0', background: '#F4FAF5',
              cursor: herosSaving ? 'default' : 'pointer',
              fontSize: 12.5, fontWeight: 800, color: '#2D5A3D',
              fontFamily: 'var(--font-body), sans-serif',
            }}
          >
            + Ajouter une fiche
          </button>

          {herosMsg && (
            <div style={{ fontSize: 11, marginTop: 8, color: herosMsg === 'Enregistré' ? '#2D5A3D' : '#B53A22' }}>{herosMsg}</div>
          )}
        </div>
      </div>

      {herosPicker !== null && (
        <EmbedPicker onSelect={prendreCible} onClose={() => setHerosPicker(null)} />
      )}

      {/* Assistant Village — la recherche conversationnelle. Même mécanique à
          trois états que le bloc cinéma : « Admin » est l'état de rodage, et
          la route API refait le calcul, elle ne se fie pas à l'écran. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12, background: '#FFFFFF',
          border: `1px solid ${assistantVis === 'tous' ? '#C8DEC0' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
            Assistant Village
          </div>
          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2, marginBottom: 10, lineHeight: 1.45 }}>
            Dans la barre de recherche : une ligne « Demander à l&apos;Assistant »
            apparaît quand la frappe ressemble à une question. La recherche
            habituelle continue de fonctionner à l&apos;identique.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { v: 'masque' as const, titre: 'Masqué',  sous: 'personne' },
              { v: 'admin'  as const, titre: 'Admin',   sous: 'toi seul' },
              { v: 'tous'   as const, titre: 'Tous',    sous: 'les habitants' },
            ]).map(o => {
              const actif = assistantVis === o.v
              return (
                <button
                  key={o.v}
                  onClick={() => changerAssistantVis(o.v)}
                  disabled={assistantSaving}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                    border: `1.5px solid ${actif ? '#2D5A3D' : '#E5DDD2'}`,
                    background: actif ? '#F4FAF5' : '#FDFAF5',
                    cursor: assistantSaving ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body), sans-serif',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: actif ? '#2D5A3D' : '#1A1209' }}>{o.titre}</div>
                  <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 2 }}>{o.sous}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Splashs promotionnels de l'offre Habitant */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: splash.enabled ? '#E8F2EB' : '#FFFFFF',
          border: `1px solid ${splash.enabled ? '#C8DEC0' : '#E5DDD2'}`,
          boxShadow: '0 1px 4px rgba(44,28,16,0.04)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: splashSaving ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={splash.enabled}
              disabled={splashSaving}
              onChange={e => { const v = e.target.checked; setSplash(s => ({ ...s, enabled: v })); setSplashSaved(false) }}
              style={{ accentColor: '#2D5A3D', cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
                Splashs promotionnels
              </div>
              <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                Interstitiels de mise en avant de l&apos;offre Habitant. Décoché, aucun splash
                promo ne peut s&apos;afficher, quels que soient les réglages ci-dessous.
              </div>
              {splash.activatedAt ? (
                <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 4 }}>
                  Lancé le {new Date(splash.activatedAt).toLocaleDateString('fr-FR')}. Les
                  habitants inscrits avant cette date voient le premier splash sans attendre ;
                  ceux arrivés après patientent le nombre de visites ci-dessous.
                </div>
              ) : (
                <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 4 }}>
                  Jamais activé. La date de lancement sera enregistrée au premier
                  enregistrement avec la case cochée, et ne bougera plus ensuite.
                </div>
              )}
            </div>
          </label>

          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: `1px dashed ${splash.enabled ? '#C8DEC0' : '#E5DDD2'}`,
            opacity: splash.enabled ? 1 : 0.55,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5B8A4A', marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Diffusion
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { key: 'firstDisplayAfterVisits', label: 'Avant le premier splash', unit: 'visites',
                  hint: 'Surtout pour les nouveaux visiteurs. 0 = dès la première visite.' },
                { key: 'cooldownDays', label: 'Entre deux splashs', unit: 'jours',
                  hint: 'Délai après qu’un splash a été fermé ou ignoré.' },
                { key: 'cycleResetDays', label: 'Après les 3 variantes', unit: 'jours',
                  hint: 'Pause une fois les trois splashs présentés, avant de recommencer.' },
                { key: 'displayDelaySeconds', label: 'Avant affichage à l’écran', unit: 'secondes',
                  hint: 'Évite que le splash surgisse au chargement de l’app.' },
              ] as const).map(f => (
                <div key={f.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  background: '#FDFAF6', border: '1px solid #E5DDD2',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1209' }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 1 }}>{f.hint}</div>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={SPLASH_PROMO_BOUNDS[f.key].min}
                    max={SPLASH_PROMO_BOUNDS[f.key].max}
                    step={1}
                    value={splash[f.key]}
                    disabled={splashSaving}
                    onChange={e => setSplashNum(f.key, e.target.value)}
                    style={{
                      width: 62, padding: '6px 8px', borderRadius: 8,
                      border: '1px solid #E5DDD2', backgroundColor: '#FFFFFF',
                      color: '#1A1209', fontSize: 13, fontWeight: 800, textAlign: 'right',
                      fontFamily: 'var(--font-body), sans-serif',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#7A6A5A', width: 58, flexShrink: 0 }}>{f.unit}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <button
                onClick={() => saveSplash()}
                disabled={splashSaving}
                style={{
                  padding: '9px 16px', borderRadius: 10, border: 'none',
                  backgroundColor: '#2D5A3D', color: '#FFFFFF',
                  fontSize: 12, fontWeight: 800,
                  cursor: splashSaving ? 'not-allowed' : 'pointer',
                  opacity: splashSaving ? 0.5 : 1,
                  fontFamily: 'var(--font-body), sans-serif',
                }}
              >
                {splashSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {splashSaved && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2D5A3D' }}>✓ Enregistré</span>
              )}
              {splashError && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#C0392B' }}>{splashError}</span>
              )}
            </div>
          </div>

          {/* Relancer le cycle — geste rare et global, donc confirmation en deux temps */}
          {splash.activatedAt && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E5DDD2' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5B8A4A', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Relancer
              </div>
              <div style={{ fontSize: 10, color: '#8A7A6A', marginBottom: 8, lineHeight: 1.45 }}>
                Remet <b>tout le monde</b> sur la variante 1, comme si la campagne
                démarrait aujourd&apos;hui. Les cooldowns en cours sont effacés : chacun
                reverra un splash dès sa prochaine visite. À utiliser pour repartir
                proprement, pas pour insister.
              </div>
              {!resetAsked ? (
                <button
                  onClick={() => setResetAsked(true)}
                  disabled={splashSaving}
                  style={{ ...btnStyle(splashSaving), width: 'auto', padding: '0 14px', height: 30, color: '#B53A22' }}
                >
                  Relancer le cycle
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => saveSplash(true)}
                    disabled={splashSaving}
                    style={{
                      padding: '7px 14px', borderRadius: 9, border: 'none',
                      backgroundColor: '#B53A22', color: '#fff', fontSize: 12, fontWeight: 800,
                      cursor: splashSaving ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-body), sans-serif',
                    }}
                  >
                    Oui, relancer pour tout le monde
                  </button>
                  <button onClick={() => setResetAsked(false)} style={{ ...btnStyle(false), width: 'auto', padding: '0 12px', height: 30 }}>
                    Annuler
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode test admin — hors du bloc grisé : il sert surtout AVANT
              l'activation, pour vérifier le comportement en conditions réelles. */}
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 10,
            background: splash.adminTestMode ? '#FFF1E8' : '#FDFAF6',
            border: `1px solid ${splash.adminTestMode ? '#F0D4C8' : '#E5DDD2'}`,
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: splashSaving ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={splash.adminTestMode}
                disabled={splashSaving}
                onChange={e => { const v = e.target.checked; setSplash(s => ({ ...s, adminTestMode: v })); setSplashSaved(false) }}
                style={{ accentColor: '#C0440A', cursor: 'pointer', marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1A1209' }}>
                  M&apos;inclure dans les splashs malgré mon abonnement
                </div>
                <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 2, lineHeight: 1.45 }}>
                  Un abonné payant ne voit jamais de splash — et ton compte est en plan
                  Partenaire. Coché, cette règle est levée <b>pour les comptes admin
                  uniquement</b> : tu reçois les splashs exactement comme un habitant,
                  avec les mêmes visites d&apos;attente, le même cooldown et la même
                  rotation. Ce n&apos;est pas un aperçu, c&apos;est la vraie cadence.
                </div>
              </div>
            </label>
          </div>

          {/* Variantes : aperçu à la demande. Volontairement HORS du bloc grisé —
              c'est précisément quand les splashs sont désactivés qu'on veut
              vérifier leur design. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${splash.enabled ? '#C8DEC0' : '#E5DDD2'}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5B8A4A', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Variantes
            </div>
            <div style={{ fontSize: 10, color: '#8A7A6A', marginBottom: 8 }}>
              L&apos;œil ouvre le splash ici même, pour vérifier son design. Rien n&apos;est
              envoyé aux habitants, aucun compteur n&apos;est touché, et ça marche même
              splashs désactivés.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SPLASH_PROMO_VARIANTS.map((v, i) => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  background: '#FDFAF6', border: '1px solid #E5DDD2',
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: '#F0EAE0', color: '#7A6A5A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900, flexShrink: 0,
                  }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1A1209' }}>{v.label}</span>
                  <button
                    onClick={() => setPreviewVariant(v.id)}
                    title={`Voir ${v.label}`}
                    aria-label={`Voir ${v.label}`}
                    style={{ ...btnStyle(false), color: '#2D5A3D' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {previewVariant && (
        <SplashPromoView
          variant={previewVariant}
          preview
          onClose={() => setPreviewVariant(null)}
          // En aperçu, le CTA ne doit pas ouvrir la modale d'abonnement
          // par-dessus l'admin : on vérifie le design, pas le parcours d'achat.
          onDiscover={() => setPreviewVariant(null)}
        />
      )}

      <div style={{ padding: '14px 12px' }}>
        {FEATURED_SLOTS.map(slot => {
          const items = allSlots.filter(s => s.slot === slot.id)

          // Slot 'homepage' : sous-grouper par content_type (events / promos /
          // annonces). Sinon liste plate comme avant.
          const isHomepage = slot.id === 'homepage'
          const homepageGroups = isHomepage ? [
            { type: 'evenement' as const, label: 'Events',     emoji: '📅' },
            { type: 'promotion' as const, label: 'Promotions', emoji: '🏷️' },
            { type: 'annonce'   as const, label: 'Annonces',   emoji: '📰' },
          ] : []

          return (
            <section key={slot.id} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, padding: '0 4px' }}>
                <span style={{ fontSize: 18 }}>{slot.emoji}</span>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A1209' }}>{slot.label}</h2>
                <span style={{ fontSize: 11, color: '#8A7A6A' }}>· {items.length} item{items.length > 1 ? 's' : ''}</span>
              </div>

              {isHomepage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {homepageGroups.map(g => {
                    const groupItems = items.filter(s => s.content_type === g.type)

                    // EVENTS : 3 positions fixes (pas une liste). L'admin
                    // assigne les positions depuis la fiche event.
                    if (g.type === 'evenement') {
                      const byPos = new Map<number, EnrichedSlot>()
                      for (const it of groupItems) {
                        if (typeof it.position === 'number') byPos.set(it.position, it)
                      }
                      return (
                        <div key={g.type}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 6px' }}>
                            <span style={{ fontSize: 13 }}>{g.emoji}</span>
                            <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {g.label}
                            </h3>
                            <span style={{ fontSize: 10, color: '#A89B8C' }}>· 3 positions · expire à minuit</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[1, 2, 3].map(pos => {
                              const taken = byPos.get(pos) ?? null
                              return (
                                <PositionCell
                                  key={pos}
                                  position={pos}
                                  slot={taken}
                                  onDelete={taken ? () => deleteSlot(taken.id) : undefined}
                                  onEditCrop={taken ? () => setCropping(taken) : undefined}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    }

                    // PROMOS / ANNONCES : liste classique
                    return (
                      <div key={g.type}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 6px' }}>
                          <span style={{ fontSize: 13 }}>{g.emoji}</span>
                          <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            {g.label}
                          </h3>
                          <span style={{ fontSize: 10, color: '#A89B8C' }}>· {groupItems.length}</span>
                        </div>
                        {groupItems.length === 0 ? (
                          <p style={{ padding: '10px 14px', backgroundColor: '#FDFAF6', borderRadius: 10, fontSize: 11.5, color: '#8A7A6A', fontStyle: 'italic', textAlign: 'center', margin: 0 }}>
                            Aucune {g.label.toLowerCase().slice(0, -1)} featured.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {groupItems.map((s, idx) => (
                              <SlotCard
                                key={s.id}
                                slot={s}
                                isFirst={idx === 0}
                                isLast={idx === groupItems.length - 1}
                                onUp={() => bumpPriority(s, +1)}
                                onDown={() => bumpPriority(s, -1)}
                                onExtend={h => extendDuration(s, h)}
                                onDelete={() => deleteSlot(s.id)}
                                onEditCrop={() => setCropping(s)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : items.length === 0 ? (
                <p style={{ padding: '14px 16px', backgroundColor: '#FDFAF6', borderRadius: 12, fontSize: 12, color: '#8A7A6A', fontStyle: 'italic', textAlign: 'center' }}>
                  Aucun contenu featured. Le hub utilise le fallback automatique.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((s, idx) => (
                    <SlotCard
                      key={s.id}
                      slot={s}
                      isFirst={idx === 0}
                      isLast={idx === items.length - 1}
                      onUp={() => bumpPriority(s, +1)}
                      onDown={() => bumpPriority(s, -1)}
                      onExtend={h => extendDuration(s, h)}
                      onDelete={() => deleteSlot(s.id)}
                      onEditCrop={() => setCropping(s)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {cropping && cropping.imageUrl && (
        <CropOverlay
          src={cropping.imageUrl}
          position={cropping.image_position ?? '50% 50%'}
          aspect={HUB_HERO_ASPECT}
          onCancel={() => setCropping(null)}
          onSave={async pos => {
            await patchSlot(cropping.id, { image_position: pos })
            setCropping(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Cellule fixe pour une position (1/2/3) du carrousel "Aujourd'hui".
 * Affiche soit l'event choisi par l'admin, soit un placeholder "vide →
 * fallback auto event du jour". Pas de bouton "Choisir" — l'admin assigne
 * une position depuis la fiche event (via FeatureModal).
 */
function PositionCell({
  position, slot, onDelete, onEditCrop,
}: {
  position: number
  slot: EnrichedSlot | null
  onDelete?: () => void
  onEditCrop?: () => void
}) {
  const label = position === 1 ? 'Grosse tuile' : position === 2 ? 'Mini gauche' : 'Mini droite'
  if (!slot) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 12,
        border: '1.5px dashed #D7CFC0', backgroundColor: '#FDFAF6',
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9,
          backgroundColor: '#F0EAE0', color: '#7A6A5A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 900, flexShrink: 0,
        }}>{position}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A6A5A' }}>Position {position} · {label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#A89B8C', fontStyle: 'italic' }}>
            Vide — sera comblée par un event du jour
          </p>
        </div>
      </div>
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 12,
      border: '1.5px solid #2D5A3D', backgroundColor: '#FFF',
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 9,
        backgroundColor: '#E8F2EB', color: '#2D5A3D',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 900, flexShrink: 0,
      }}>{position}</span>
      {slot.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.imageUrl} alt="" style={{
          width: 40, height: 40, borderRadius: 8, objectFit: 'cover',
          objectPosition: slot.image_position ?? '50% 50%', flexShrink: 0,
        }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Position {position} · {label}
        </p>
        {slot.detailUrl ? (
          <Link href={slot.detailUrl} style={{
            display: 'block', margin: '2px 0 0', fontSize: 12.5, fontWeight: 700,
            color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', textDecoration: 'none',
          }}>{slot.title}</Link>
        ) : (
          <p style={{ margin: '2px 0 0', fontSize: 12.5, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.title}</p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {onEditCrop && slot.imageUrl && (
          <button onClick={onEditCrop} aria-label="Cadrage" style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid #E5DDD2',
            background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A1209" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} aria-label="Retirer" style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid #F0D4C8',
            background: '#FDF4F0', color: '#B53A22', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function SlotCard({
  slot, isFirst, isLast,
  onUp, onDown, onExtend, onDelete, onEditCrop,
}: {
  slot: EnrichedSlot
  isFirst: boolean
  isLast:  boolean
  onUp:     () => void
  onDown:   () => void
  onExtend: (hours: number) => void
  onDelete: () => void
  onEditCrop: () => void
}) {
  const expired = new Date(slot.ends_at) <= new Date()
  const hasImg = !!slot.imageUrl
  const cropped = !!slot.image_position
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14,
      backgroundColor: '#fff',
      border: expired ? '1.5px solid #E5DDD2' : '1px solid #E5DDD2',
      opacity: expired ? 0.6 : 1,
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <button
        type="button"
        onClick={hasImg ? onEditCrop : undefined}
        disabled={!hasImg}
        title={hasImg ? 'Cliquer pour cadrer dans le hub' : 'Pas d\'image'}
        style={{
          position: 'relative',
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          border: 'none', padding: 0,
          backgroundColor: '#F0EBE3',
          backgroundImage: slot.imageUrl ? `url(${slot.imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: slot.image_position ?? 'center',
          cursor: hasImg ? 'pointer' : 'default',
        }}
      >
        {hasImg && (
          <span style={{
            position: 'absolute', right: -4, bottom: -4,
            width: 18, height: 18, borderRadius: '50%',
            backgroundColor: cropped ? '#2D5A3D' : '#fff',
            border: '1.5px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: cropped ? '#fff' : '#2D5A3D',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
              <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
          </span>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={slot.detailUrl ?? '#'}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slot.title ?? '(contenu)'}
          </p>
        </Link>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#8A7A6A' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{slot.content_type}</span>
          {' · '}
          <span style={{ color: slot.source === 'admin' ? '#2D5A3D' : slot.source === 'boost_purchase' ? '#E8622A' : '#3A5BC7' }}>
            {slot.source === 'admin' ? 'éditorial' : slot.source === 'boost_purchase' ? 'boost payant' : slot.source === 'pro_credit' ? 'crédit pro' : slot.source}
          </span>
          {' · '}
          priority {slot.priority}
          {' · '}
          {expired ? 'expiré' : `expire dans ${fmtRemaining(slot.ends_at)}`}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onUp}   disabled={isFirst} style={btnStyle(isFirst)}>▲</button>
        <button onClick={onDown} disabled={isLast}  style={btnStyle(isLast)}>▼</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={() => onExtend(24)}  style={btnStyle(false)} title="+1 jour">+1j</button>
        <button onClick={onDelete} style={{ ...btnStyle(false), color: '#C0392B' }}>✕</button>
      </div>
    </div>
  )
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 26, borderRadius: 7,
    border: '1px solid #E5DDD2', backgroundColor: '#FDFAF6',
    color: '#2D5A3D', fontSize: 11, fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontFamily: 'var(--font-body), sans-serif',
  }
}

/**
 * Modale plein écran : cadrage d'une image (object-position) avec preview
 * à l'aspect du hero du hub. Le user clique/drag pour repositionner le crop.
 * Pattern inspiré de EventEditDrawer.CropStep, adapté à un aspect arbitraire.
 */
function CropOverlay({
  src, position, aspect, onCancel, onSave,
}: {
  src: string
  position: string
  aspect: number
  onCancel: () => void
  onSave: (position: string) => void | Promise<void>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [pos, setPos] = useState(position || '50% 50%')
  const [saving, setSaving] = useState(false)

  const [px, py] = pos.split(' ').map(v => parseFloat(v) || 0)

  function computeLayout(cW: number, cH: number, nW: number, nH: number) {
    // Image fittée en object-contain dans le container (rW × rH)
    const ir = nW / nH, cr = cW / cH
    let rW: number, rH: number, oX: number, oY: number
    if (ir > cr) { rW = cW; rH = cW / ir; oX = 0; oY = (cH - rH) / 2 }
    else         { rH = cH; rW = cH * ir; oX = (cW - rW) / 2; oY = 0 }
    // Crop window dans l'image : représente la zone visible après object-cover
    // dans un rectangle d'aspect ratio `aspect`. On limite par la dimension la plus courte.
    let cropW: number, cropH: number
    if (rW / rH > aspect) {
      // Image plus large que target : crop hauteur entière, largeur réduite
      cropH = rH
      cropW = rH * aspect
    } else {
      cropW = rW
      cropH = rW / aspect
    }
    return { rW, rH, oX, oY, cropW, cropH }
  }

  const layout = (() => {
    const c = containerRef.current
    if (!c || !natural) return null
    const { width: cW, height: cH } = c.getBoundingClientRect()
    const l = computeLayout(cW, cH, natural.w, natural.h)
    return {
      ...l,
      cropLeft: l.oX + (l.rW - l.cropW) * px / 100,
      cropTop:  l.oY + (l.rH - l.cropH) * py / 100,
    }
  })()

  const handlePointer = (e: React.PointerEvent) => {
    const c = containerRef.current
    if (!c || !natural) return
    const rect = c.getBoundingClientRect()
    const l = computeLayout(rect.width, rect.height, natural.w, natural.h)
    const rX = Math.max(0, Math.min(1, (e.clientX - rect.left - l.oX) / l.rW))
    const rY = Math.max(0, Math.min(1, (e.clientY - rect.top  - l.oY) / l.rH))
    setPos(`${Math.round(rX * 100)}% ${Math.round(rY * 100)}%`)
  }

  const D = 'rgba(0,0,0,0.62)'

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try { await onSave(pos) } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      backgroundColor: '#000',
      display: 'flex', flexDirection: 'column',
      userSelect: 'none',
      fontFamily: 'var(--font-body), sans-serif',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: '#B0B0B0',
          fontSize: 13, cursor: 'pointer', padding: '6px 4px',
        }}>← Annuler</button>
        <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>Cadrer pour le hub</p>
        <button onClick={handleSave} disabled={saving} style={{
          backgroundColor: '#2D5A3D', color: '#fff',
          padding: '8px 14px', borderRadius: 10,
          border: 'none', fontSize: 13, fontWeight: 800,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? '…' : 'Enregistrer'}</button>
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'relative', flex: 1, overflow: 'hidden',
          touchAction: 'none', cursor: 'crosshair',
        }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={e => { if (e.buttons > 0) handlePointer(e) }}
      >
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
          onLoad={e => { const i = e.currentTarget; setNatural({ w: i.naturalWidth, h: i.naturalHeight }) }}
        />
        {layout && (
          <div style={{ position: 'absolute', top: layout.oY, left: layout.oX, width: layout.rW, height: layout.rH, pointerEvents: 'none' }}>
            {/* Masques sombres */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: layout.cropLeft - layout.oX, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: layout.rW - (layout.cropLeft - layout.oX) - layout.cropW, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.cropTop - layout.oY, backgroundColor: D }} />
            <div style={{ position: 'absolute', bottom: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.rH - (layout.cropTop - layout.oY) - layout.cropH, backgroundColor: D }} />
            {/* Crop window */}
            <div style={{
              position: 'absolute',
              top: layout.cropTop - layout.oY,
              left: layout.cropLeft - layout.oX,
              width: layout.cropW,
              height: layout.cropH,
              border: '2px solid #fff',
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            }} />
          </div>
        )}
      </div>

      <p style={{
        margin: 0, padding: '10px 16px 16px',
        color: '#B0B0B0', fontSize: 12, textAlign: 'center', flexShrink: 0,
      }}>
        Touche / clique pour repositionner le cadrage. Aspect : carousel hub (≈2:1).
      </p>
    </div>
  )
}
