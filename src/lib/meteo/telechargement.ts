import { lireEntete, type EnteteGrib } from './grib2'

/**
 * TÉLÉCHARGER SEULEMENT LES CHAMPS UTILES.
 *
 * Un fichier AROME d'une heure pèse 15 à 25 Mo et contient une dizaine de
 * champs. On en lit d'abord les en-têtes (quelques centaines d'octets
 * chacun, par requêtes « Range »), puis on ne rapatrie que les messages
 * voulus. L'ECMWF publie un index : on y lit directement où se trouve chaque
 * champ.
 */

const ESSAIS = 3

export async function lirePlage(url: string, debut: number, fin: number): Promise<Uint8Array> {
  let derniere: unknown
  for (let i = 0; i < ESSAIS; i++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${debut}-${fin}` }, cache: 'no-store' })
      if (r.status !== 206 && r.status !== 200) throw new Error(`${r.status} sur ${url}`)
      const b = new Uint8Array(await r.arrayBuffer())
      // Un serveur qui ignore Range rend tout le fichier : on découpe.
      return r.status === 200 ? b.subarray(debut, fin + 1) : b
    } catch (e) {
      derniere = e
      await new Promise(res => setTimeout(res, 500 * (i + 1)))
    }
  }
  throw derniere instanceof Error ? derniere : new Error(String(derniere))
}

export async function existe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return r.ok
  } catch { return false }
}

export type Cle = string
export const cleDe = (e: Pick<EnteteGrib, 'discipline' | 'categorie' | 'numero'>): Cle => `${e.discipline}/${e.categorie}/${e.numero}`

/**
 * Parcourt les messages d'un fichier GRIB2 distant et rapatrie ceux dont la
 * clé (discipline/catégorie/numéro) est demandée. S'arrête dès que tout est
 * trouvé.
 */
export async function messagesVoulus(url: string, voulus: Set<Cle>): Promise<Map<Cle, Uint8Array>> {
  const trouves = new Map<Cle, Uint8Array>()
  let off = 0
  for (let garde = 0; garde < 40 && trouves.size < voulus.size; garde++) {
    let tete: Uint8Array
    try { tete = await lirePlage(url, off, off + 511) } catch { break }
    if (tete.length < 16 || tete[0] !== 0x47 || tete[1] !== 0x52) break
    let total = 0
    for (let i = 8; i < 16; i++) total = total * 256 + tete[i]
    const cle = cleDe(lireEntete(tete))
    if (voulus.has(cle) && !trouves.has(cle)) {
      trouves.set(cle, await lirePlage(url, off, off + total - 1))
    }
    off += total
  }
  return trouves
}

/* ── ECMWF : l'index dit où est chaque champ ─────────────────────────── */

interface LigneIndex { param: string; levtype?: string; _offset: number; _length: number }

export async function champsEcmwf(base: string, params: string[]): Promise<Map<string, Uint8Array>> {
  const r = await fetch(`${base}.index`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`index ECMWF ${r.status}`)
  const lignes = (await r.text()).split('\n').filter(Boolean).map(l => JSON.parse(l) as LigneIndex)
  const out = new Map<string, Uint8Array>()
  await Promise.all(params.map(async p => {
    const l = lignes.find(x => x.param === p && (x.levtype ?? 'sfc') === 'sfc')
    if (!l) return
    out.set(p, await lirePlage(`${base}.grib2`, l._offset, l._offset + l._length - 1))
  }))
  return out
}

/** Exécute `fn` sur chaque élément, au plus `n` à la fois. */
export async function parLots<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}
