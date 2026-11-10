/**
 * CE QUE LES MOTEURS LISENT D'UNE FICHE.
 *
 * Les données structurées (schema.org, en JSON-LD) disent à Google, sans
 * qu'il ait à deviner : c'est un événement, il a lieu tel jour à telle heure,
 * à telle adresse. C'est ce qui ouvre l'affichage enrichi des résultats.
 *
 * RÈGLE : on n'invente rien. Un champ absent de la base est absent ici —
 * pas d'organisateur « La Place », pas de prix supposé, pas d'heure « 00:00 ».
 * Google accepte une donnée incomplète ; il sanctionne une donnée fausse.
 */

import { slugifier } from './lienEvenement'

export const SITE = 'https://laplaceduvillage.app'

/** Une adresse absolue : Google ne lit pas les chemins relatifs dans le JSON-LD. */
export function absolue(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  return `${SITE}${url.startsWith('/') ? '' : '/'}${url}`
}

/** Le JSON prêt à poser dans une balise script : `<` échappé, rien ne peut la refermer. */
export function enJsonLd(objet: unknown): string {
  return JSON.stringify(objet).replace(/</g, '\\u003c')
}

/** Retire les clés vides, récursivement : un `undefined` n'a rien à faire dans le JSON-LD. */
function nettoyer<T>(o: T): T {
  if (Array.isArray(o)) return o.map(nettoyer).filter(v => v !== undefined) as unknown as T
  if (o && typeof o === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null || v === '') continue
      const n = nettoyer(v)
      if (Array.isArray(n) && n.length === 0) continue
      out[k] = n
    }
    return out as T
  }
  return o
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

/** Le décalage de Paris ce jour-là : « +01:00 » l'hiver, « +02:00 » l'été. */
function decalageParis(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  const nom = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+01:00'
  const m = nom.match(/GMT([+-]\d{2}):?(\d{2})?/)
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+01:00'
}

/** « 2026-11-14 » + « 20:30:00 » → « 2026-11-14T20:30:00+01:00 » ; sans heure, le jour seul. */
export function dateIso(ymd: string, heure?: string | null): string {
  if (!heure || !/^\d{2}:\d{2}/.test(heure)) return ymd
  return `${ymd}T${heure.slice(0, 5)}:00${decalageParis(ymd)}`
}

/* ── Adresses ──────────────────────────────────────────────────────────── */

/**
 * « 2134 Mazel, 30570 Val-d'Aigoual » → rue, code postal, commune.
 *
 * La commune manque sur une partie des lieux, mais elle est presque toujours
 * écrite dans l'adresse, derrière le code postal : on la lit là.
 */
export function lireAdresse(adresse: string | null | undefined, commune?: string | null) {
  const a = (adresse ?? '').replace(/,?\s*France\s*$/i, '').trim()
  const m = a.match(/(?:^|,\s*)(\d{5})\s+([^,]+)$/)
  const rue = (m ? a.slice(0, m.index) : a).replace(/,\s*$/, '').trim()
  return {
    rue: rue || undefined,
    codePostal: m?.[1],
    commune: commune?.trim() || m?.[2]?.trim() || undefined,
  }
}

export function adressePostale(adresse: string | null | undefined, commune?: string | null) {
  const l = lireAdresse(adresse, commune)
  if (!l.rue && !l.codePostal && !l.commune) return undefined
  return nettoyer({
    '@type': 'PostalAddress',
    streetAddress: l.rue,
    postalCode: l.codePostal,
    addressLocality: l.commune,
    addressCountry: 'FR',
  })
}

/** La commune d'un lieu, lue au besoin dans son adresse. */
export function communeDe(lieu: { commune?: string | null; adresse?: string | null } | null | undefined): string | null {
  if (!lieu) return null
  return lireAdresse(lieu.adresse, lieu.commune).commune ?? null
}

export function slugCommune(commune: string): string {
  return slugifier(commune, 80)
}

/* ── Prix ──────────────────────────────────────────────────────────────── */

/**
 * Le prix est du texte libre (« 10 € », « Prix libre », « 12 euros en
 * prévente, 15 sur place »). On ne garde que ce qui se lit sans ambiguïté :
 * gratuit, ou UN montant. Le reste n'est pas traduit.
 */
export function lirePrix(prix: string | null | undefined): number | null {
  if (!prix) return null
  const p = prix.toLowerCase()
  if (/libre participation|prix libre|participation libre|chapeau/.test(p)) return null
  if (/gratuit|entr[ée]e libre|acc[eè]s libre/.test(p)) return 0
  const montants = p.match(/\d+(?:[.,]\d{1,2})?\s*(?:€|euros?\b)/g)
  if (!montants || montants.length !== 1) return null
  return Number(montants[0].replace(/[^\d.,]/g, '').replace(',', '.'))
}

/* ── Les fiches ────────────────────────────────────────────────────────── */

type LieuEvt = { nom?: string | null; adresse?: string | null; commune?: string | null; lat?: number | null; lng?: number | null } | null

export function jsonLdEvenement(e: {
  titre: string
  description?: string | null
  date_debut?: string | null
  date_fin?: string | null
  heure?: string | null
  prix?: string | null
  organisateurs?: string | null
  lieux?: LieuEvt
}, url: string, image: string | null) {
  if (!e.date_debut) return null
  const lieu = e.lieux
  const prix = lirePrix(e.prix)
  const multiJours = !!e.date_fin && e.date_fin !== e.date_debut
  return nettoyer({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.titre,
    description: e.description ? e.description.slice(0, 1000) : undefined,
    startDate: dateIso(e.date_debut, e.heure),
    endDate: multiJours ? e.date_fin! : undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: lieu ? {
      '@type': 'Place',
      name: lieu.nom ?? communeDe(lieu) ?? undefined,
      address: adressePostale(lieu.adresse, lieu.commune),
      geo: lieu.lat && lieu.lng ? { '@type': 'GeoCoordinates', latitude: lieu.lat, longitude: lieu.lng } : undefined,
    } : undefined,
    image: image ? [absolue(image)] : undefined,
    offers: prix !== null ? {
      '@type': 'Offer',
      price: prix,
      priceCurrency: 'EUR',
      url,
    } : undefined,
    organizer: e.organisateurs ? { '@type': 'Organization', name: e.organisateurs.slice(0, 200) } : undefined,
    url,
  })
}

export function jsonLdCommerce(c: {
  nom: string
  description_courte?: string | null
  description_longue?: string | null
  adresse?: string | null
  commune?: string | null
  lat?: number | null
  lng?: number | null
  photos?: string[] | null
  contact_tel?: string | null
  site_web?: string | null
}, url: string) {
  return nettoyer({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: c.nom,
    description: (c.description_courte || c.description_longue || '').slice(0, 1000) || undefined,
    address: adressePostale(c.adresse, c.commune),
    geo: c.lat && c.lng ? { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng } : undefined,
    image: (c.photos ?? []).slice(0, 3).map(absolue),
    telephone: c.contact_tel ?? undefined,
    sameAs: c.site_web && /^https?:\/\//i.test(c.site_web) ? [c.site_web] : undefined,
    url,
  })
}

type Salle = { nom: string; adresse?: string | null; commune?: string | null }

export function jsonLdFilm(f: {
  titre: string
  synopsis?: string | null
  affiche_url?: string | null
  realisateur?: string | null
  duree_min?: number | null
  annee?: number | null
}, url: string, seances: { date: string; heure: string | null; salle?: Salle }[]) {
  const film = nettoyer({
    '@type': 'Movie',
    name: f.titre,
    description: f.synopsis ? f.synopsis.slice(0, 1000) : undefined,
    image: absolue(f.affiche_url),
    director: f.realisateur ? { '@type': 'Person', name: f.realisateur } : undefined,
    duration: f.duree_min ? `PT${f.duree_min}M` : undefined,
    dateCreated: f.annee ? String(f.annee) : undefined,
    url,
  })
  return [
    { '@context': 'https://schema.org', ...film },
    ...seances.slice(0, 20).map(s => nettoyer({
      '@context': 'https://schema.org',
      '@type': 'ScreeningEvent',
      name: f.titre,
      startDate: dateIso(s.date, s.heure),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      workPresented: film,
      image: f.affiche_url ? [absolue(f.affiche_url)] : undefined,
      location: s.salle ? { '@type': 'MovieTheater', name: s.salle.nom, address: adressePostale(s.salle.adresse, s.salle.commune) } : undefined,
      url,
    })),
  ]
}

export function jsonLdSpectacle(sp: {
  titre: string
  synopsis?: string | null
  affiche_url?: string | null
  compagnie?: string | null
}, url: string, dates: { date: string; heure: string | null; lieu?: Salle }[]) {
  return dates.slice(0, 20).map(d => nettoyer({
    '@context': 'https://schema.org',
    '@type': 'TheaterEvent',
    name: sp.titre,
    description: sp.synopsis ? sp.synopsis.slice(0, 1000) : undefined,
    startDate: dateIso(d.date, d.heure),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: sp.affiche_url ? [absolue(sp.affiche_url)] : undefined,
    performer: sp.compagnie ? { '@type': 'PerformingGroup', name: sp.compagnie } : undefined,
    location: d.lieu ? { '@type': 'Place', name: d.lieu.nom, address: adressePostale(d.lieu.adresse, d.lieu.commune) } : undefined,
    url,
  }))
}
