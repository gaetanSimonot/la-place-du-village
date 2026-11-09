import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { decoderFenetre } from './grib2'
import { messagesVoulus, champsEcmwf, existe, parLots } from './telechargement'
import {
  BUCKET_METEO, encoderPluie, encoderNuages, encoderTempOrage,
  type ZoneMeteo, type MetaMeteo, type JoursMeteo,
} from './zone'

/**
 * LA TÂCHE MÉTÉO — ce qu'elle fabrique et où elle le range.
 *
 *   meteo/<zone>/meta.json               la dernière sortie AROME, lue par la page
 *   meteo/<zone>/arome/<run>/hNN.png     une image-données par échéance
 *   meteo/<zone>/jours.json              l'ECMWF, pour 3 et 10 jours
 *
 * Les images d'une sortie ne changent jamais (cache long) ; seuls les deux
 * JSON sont réécrits. On garde la sortie précédente le temps qu'un
 * navigateur qui l'a déjà commencée finisse de la charger.
 */

const AROME = 'https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt'
const ECMWF = 'https://data.ecmwf.int/forecasts'

/** Heure par heure jusqu'à +24 h, puis de 3 en 3 jusqu'à +48 h. */
export const ECHEANCES = [...Array.from({ length: 25 }, (_, i) => i), 27, 30, 33, 36, 39, 42, 45, 48]

const PLUIE = '0/1/65', NEIGE = '0/1/66', GRESIL = '0/1/75'
const NUAGES_BAS = '0/6/3', NUAGES_MOY = '0/6/4', NUAGES_HAUTS = '0/6/5'
const T2M = '0/0/0'

const isoRun = (d: Date) => d.toISOString().slice(0, 13) + ':00:00Z'
const urlArome = (run: string, paquet: string, h: number) =>
  `${AROME}/${run}/arome/001/${paquet}/arome__001__${paquet}__${String(h).padStart(2, '0')}H__${run}.grib2`

async function assurerBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET_METEO)
  if (!data) await supabaseAdmin.storage.createBucket(BUCKET_METEO, { public: true })
}

async function lireJson<T>(chemin: string): Promise<T | null> {
  const { data } = await supabaseAdmin.storage.from(BUCKET_METEO).download(chemin)
  if (!data) return null
  try { return JSON.parse(await data.text()) as T } catch { return null }
}

async function deposer(chemin: string, corps: Buffer | string, type: string, cache: number) {
  const { error } = await supabaseAdmin.storage.from(BUCKET_METEO)
    .upload(chemin, corps, { contentType: type, cacheControl: String(cache), upsert: true })
  if (error) throw new Error(`dépôt ${chemin} : ${error.message}`)
}

/** La sortie AROME la plus récente dont la dernière échéance est publiée. */
async function dernierRunArome(): Promise<string | null> {
  const maintenant = Date.now()
  const base = Math.floor(maintenant / 3_600_000 / 3) * 3 * 3_600_000
  for (let k = 0; k < 5; k++) {
    const run = isoRun(new Date(base - k * 3 * 3_600_000))
    if (await existe(urlArome(run, 'SP2', ECHEANCES[ECHEANCES.length - 1]))) return run
  }
  return null
}

interface Brut { cumul: Float32Array; gresil: Float32Array; nuages: Float32Array; temp: Float32Array }

async function lireEcheance(run: string, h: number, z: ZoneMeteo): Promise<Brut> {
  const f = { lat0: z.lat0, lon0: z.lon0, pas: z.pas, lignes: z.lignes, colonnes: z.colonnes }
  const n = z.lignes * z.colonnes
  const [sp2, sp1] = await Promise.all([
    messagesVoulus(urlArome(run, 'SP2', h), new Set([PLUIE, NEIGE, GRESIL, NUAGES_BAS, NUAGES_MOY, NUAGES_HAUTS])),
    messagesVoulus(urlArome(run, 'SP1', h), new Set([T2M])),
  ])
  const champ = (m: Map<string, Uint8Array>, cle: string) => {
    const b = m.get(cle)
    return b ? decoderFenetre(b, f) : new Float32Array(n)
  }
  const pluie = champ(sp2, PLUIE), neige = champ(sp2, NEIGE), gresil = champ(sp2, GRESIL)
  const bas = champ(sp2, NUAGES_BAS), moy = champ(sp2, NUAGES_MOY), hauts = champ(sp2, NUAGES_HAUTS)
  if (!sp1.has(T2M)) throw new Error(`température absente à +${h} h`)
  const temp = champ(sp1, T2M)
  const cumul = new Float32Array(n), nuages = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    cumul[i] = (pluie[i] || 0) + (neige[i] || 0) + (gresil[i] || 0)
    // Recouvrement aléatoire des trois couches.
    const c = 1 - (1 - (bas[i] || 0) / 100) * (1 - (moy[i] || 0) / 100) * (1 - (hauts[i] || 0) / 100)
    nuages[i] = c * 100
    gresil[i] = gresil[i] || 0
  }
  return { cumul, gresil, nuages, temp }
}

export interface BilanArome { run: string | null; images: number; ko: number; ms: number; deja?: boolean }

export async function produireArome(z: ZoneMeteo, forcer = false): Promise<BilanArome> {
  const debut = Date.now()
  await assurerBucket()
  const run = await dernierRunArome()
  if (!run) return { run: null, images: 0, ko: 0, ms: Date.now() - debut }
  const metaChemin = `${z.slug}/meta.json`
  const ancien = await lireJson<MetaMeteo>(metaChemin)
  if (!forcer && ancien?.run === run) return { run, images: 0, ko: 0, ms: Date.now() - debut, deja: true }

  const bruts = new Map<number, Brut>()
  await parLots(ECHEANCES, 4, async h => { bruts.set(h, await lireEcheance(run, h, z)) })

  const dossierRun = run.slice(0, 13).replace(/[-:]/g, '')
  const n = z.lignes * z.colonnes
  const heures: MetaMeteo['heures'] = []
  let octets = 0
  for (const h of ECHEANCES) {
    const b = bruts.get(h)!
    const precedent = h === 0 ? null : bruts.get(h <= 24 ? h - 1 : h - 3)!
    const dt = h <= 24 ? 1 : 3
    const px = Buffer.alloc(n * 3)
    for (let i = 0; i < n; i++) {
      const mmh = precedent ? Math.max(0, b.cumul[i] - precedent.cumul[i]) / dt : 0
      const gresil = precedent ? Math.max(0, b.gresil[i] - precedent.gresil[i]) / dt : 0
      const c = (b.temp[i] || 273.15) - 273.15
      // Orage : du grésil en saison douce (la convection en fait), ou une
      // averse très forte.
      const orage = (gresil > 0.1 && c > 2) || mmh >= 25
      px[i * 3] = encoderPluie(mmh)
      px[i * 3 + 1] = encoderNuages(b.nuages[i] || 0)
      px[i * 3 + 2] = encoderTempOrage(c, orage)
    }
    const png = await sharp(px, { raw: { width: z.colonnes, height: z.lignes, channels: 3 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer()
    octets += png.length
    const chemin = `${z.slug}/arome/${dossierRun}/h${String(h).padStart(2, '0')}.png`
    await deposer(chemin, png, 'image/png', 31_536_000)
    heures.push({ t: new Date(Date.parse(run) + h * 3_600_000).toISOString(), png: chemin })
  }

  const meta: MetaMeteo = {
    version: 1, zone: z, run, genere: new Date().toISOString(),
    source: 'Météo-France — AROME 0,01°', heures,
  }
  await deposer(metaChemin, JSON.stringify(meta), 'application/json', 60)

  // Ménage : on ne garde que cette sortie et la précédente.
  const garder = new Set([dossierRun, ancien?.run ? ancien.run.slice(0, 13).replace(/[-:]/g, '') : ''])
  const { data: dossiers } = await supabaseAdmin.storage.from(BUCKET_METEO).list(`${z.slug}/arome`, { limit: 100 })
  for (const d of dossiers ?? []) {
    if (garder.has(d.name)) continue
    const { data: fichiers } = await supabaseAdmin.storage.from(BUCKET_METEO).list(`${z.slug}/arome/${d.name}`, { limit: 100 })
    const chemins = (fichiers ?? []).map(f => `${z.slug}/arome/${d.name}/${f.name}`)
    if (chemins.length) await supabaseAdmin.storage.from(BUCKET_METEO).remove(chemins)
  }

  return { run, images: heures.length, ko: Math.round(octets / 1024), ms: Date.now() - debut }
}

/* ── ECMWF : les jours ───────────────────────────────────────────────── */

/** De 3 en 3 h jusqu'à +144 h, puis de 6 en 6 h jusqu'à +240 h (10 jours). */
const PAS_ECMWF = [...Array.from({ length: 49 }, (_, i) => i * 3), ...Array.from({ length: 16 }, (_, i) => 150 + i * 6)]

const baseEcmwf = (run: Date, pas: number) => {
  const j = run.toISOString().slice(0, 10).replace(/-/g, '')
  const hh = String(run.getUTCHours()).padStart(2, '0')
  return `${ECMWF}/${j}/${hh}z/ifs/0p25/oper/${j}${hh}0000-${pas}h-oper-fc`
}

async function dernierRunEcmwf(): Promise<Date | null> {
  const base = Math.floor(Date.now() / 43_200_000) * 43_200_000
  for (let k = 0; k < 4; k++) {
    const run = new Date(base - k * 43_200_000)
    if (await existe(`${baseEcmwf(run, 240)}.index`)) return run
  }
  return null
}

export interface BilanJours { run: string | null; pas: number; ko: number; ms: number; deja?: boolean }

export async function produireJours(z: ZoneMeteo, forcer = false): Promise<BilanJours> {
  const debut = Date.now()
  await assurerBucket()
  const run = await dernierRunEcmwf()
  if (!run) return { run: null, pas: 0, ko: 0, ms: Date.now() - debut }
  const chemin = `${z.slug}/jours.json`
  const ancien = await lireJson<JoursMeteo>(chemin)
  if (!forcer && ancien?.run === run.toISOString()) return { run: run.toISOString(), pas: 0, ko: 0, ms: Date.now() - debut, deja: true }

  // La grille 0,25° qui couvre la zone, un point de marge de chaque côté.
  const pas = 0.25
  const lat0 = Math.ceil(z.lat0 / pas) * pas + pas
  const lon0 = Math.floor(z.lon0 / pas) * pas - pas
  const lignes = Math.ceil((z.lignes * z.pas) / pas) + 3
  const colonnes = Math.ceil((z.colonnes * z.pas) / pas) + 3
  const grille = { lat0, lon0, pas, lignes, colonnes }

  const etapes = await parLots(PAS_ECMWF, 4, async p => {
    const champs = await champsEcmwf(baseEcmwf(run, p), ['2t', 'tp', 'tcc'])
    const lire = (k: string) => { const b = champs.get(k); return b ? Array.from(decoderFenetre(b, grille)) : null }
    const t2m = lire('2t'), tp = lire('tp'), tcc = lire('tcc')
    if (!t2m) return null
    const enFraction = !!tcc && Math.max(...tcc.map(v => v || 0)) <= 1.0001
    return {
      t: new Date(run.getTime() + p * 3_600_000).toISOString(),
      t2m: t2m.map(v => Math.round((v - 273.15) * 10)),
      // tp en mètres, cumulé depuis le départ ; absent à +0 h.
      tp: (tp ?? t2m.map(() => 0)).map(v => Math.round((v || 0) * 10_000)),
      // tcc : en % chez l'ECMWF ; certaines versions l'écrivent entre 0 et 1.
      tcc: (tcc ?? t2m.map(() => 0)).map(v => Math.round((v || 0) * (enFraction ? 100 : 1))),
    }
  })

  const jours: JoursMeteo = {
    version: 1, run: run.toISOString(), genere: new Date().toISOString(),
    source: 'ECMWF — IFS 0,25°', grille,
    pas: etapes.filter((e): e is NonNullable<typeof e> => !!e),
  }
  const corps = JSON.stringify(jours)
  await deposer(chemin, corps, 'application/json', 300)
  return { run: jours.run, pas: jours.pas.length, ko: Math.round(corps.length / 1024), ms: Date.now() - debut }
}
