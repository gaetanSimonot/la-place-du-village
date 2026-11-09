/**
 * DÉCOMPRESSION CCSDS 121.0 (« AEC », Rice adaptatif) — le format des champs
 * GRIB2 de Météo-France (AROME) et de l'ECMWF (gabarit 5.42).
 *
 * Aucune librairie JavaScript ne le lit : celle de référence est libaec (C).
 * Ceci en est la partie « décodage », réécrite d'après libaec/decode.c, pour
 * ce dont on a besoin : échantillons non signés, prétraitement par prédicteur
 * (drapeau 8), sans remplissage de fin de RSI. Tout autre réglage lève une
 * erreur au lieu de rendre un champ faux.
 *
 * Un bloc = `blockSize` échantillons. Un RSI = `rsi` blocs ; il commence par
 * un échantillon de référence brut, et le prédicteur repart de lui.
 */

const F_SIGNED = 1
const F_PREPROCESS = 8
const F_RESTRICTED = 16
const F_PAD_RSI = 32

/** Table de la « seconde extension » (paires d'échantillons), cf. libaec. */
const SE: number[] = (() => {
  const t: number[] = []
  let k = 0
  for (let i = 0; i < 13; i++) {
    const ms = k
    for (let j = 0; j <= i; j++) { t[2 * k] = i; t[2 * k + 1] = ms; k++ }
  }
  return t
})()

export function decoderAec(
  src: Uint8Array, nbits: number, blockSize: number, rsi: number, flags: number, nOut: number,
): Uint32Array {
  if (flags & (F_SIGNED | F_PAD_RSI)) throw new Error(`CCSDS : drapeaux non gérés (${flags})`)
  if (nbits < 1 || nbits > 24) throw new Error(`CCSDS : ${nbits} bits non gérés`)

  // 4 octets de marge : la lecture prend toujours un mot de 32 bits.
  const d = new Uint8Array(src.length + 8); d.set(src)
  let bp = 0 // position en bits

  const mot = (): number => {
    const i = bp >>> 3
    return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0
  }
  const lire = (n: number): number => {
    if (n === 0) return 0
    const v = ((mot() << (bp & 7)) >>> 0) >>> (32 - n)
    bp += n
    return v
  }
  /** Séquence fondamentale : le nombre de 0 avant le prochain 1. */
  const lireFS = (): number => {
    let zeros = 0
    for (;;) {
      const dispo = 32 - (bp & 7)
      const w = (mot() << (bp & 7)) >>> 0
      if (w === 0) { zeros += dispo; bp += dispo; if (bp > d.length * 8) throw new Error('CCSDS : fin de flux'); continue }
      const z = Math.clz32(w)
      bp += z + 1
      return zeros + z
    }
  }

  const idLen = nbits > 16 ? 5 : nbits > 8 ? 4 : (flags & F_RESTRICTED && nbits <= 4 ? (nbits <= 2 ? 1 : 2) : 3)
  const idMax = (1 << idLen) - 1
  const pp = (flags & F_PREPROCESS) !== 0
  const tailleRsi = rsi * blockSize
  const out = new Uint32Array(Math.ceil(nOut / tailleRsi) * tailleRsi + blockSize * 64)
  const fs = new Uint32Array(blockSize)
  let p = 0

  while (p < nOut) {
    const debutRsi = p
    let blocs = 0
    while (blocs < rsi && p < nOut) {
      const ref = pp && blocs === 0 ? 1 : 0
      const id = lire(idLen)
      if (id === 0) {
        const se = lire(1)
        if (ref) out[p++] = lire(nbits)
        if (se === 1) {
          for (let i = ref; i < blockSize;) {
            const m = lireFS()
            if (m > 90) throw new Error('CCSDS : seconde extension invalide')
            const d1 = m - SE[2 * m + 1]
            if ((i & 1) === 0) { out[p++] = SE[2 * m] - d1; i++ }
            out[p++] = d1; i++
          }
          blocs++
        } else {
          let zb = lireFS() + 1
          if (zb === 5) zb = Math.min(rsi - blocs, 64 - (blocs % 64))
          else if (zb > 5) zb--
          const n = zb * blockSize - ref
          out.fill(0, p, p + n); p += n
          blocs += zb
        }
      } else if (id === idMax) {
        for (let i = 0; i < blockSize; i++) out[p++] = lire(nbits)
        blocs++
      } else {
        const k = id - 1
        if (ref) out[p++] = lire(nbits)
        const n = blockSize - ref
        for (let i = 0; i < n; i++) fs[i] = lireFS()
        const mul = 2 ** k
        for (let i = 0; i < n; i++) out[p++] = fs[i] * mul + lire(k)
        blocs++
      }
    }
    // Prédicteur inverse sur ce RSI (non signé, xmin = 0).
    if (pp) {
      const xmax = 2 ** nbits - 1
      let x = out[debutRsi]
      for (let j = debutRsi + 1; j < p; j++) {
        const dd = out[j]
        const demi = (dd >>> 1) + (dd & 1)
        const theta = x <= xmax - x ? x : xmax - x
        if (demi <= theta) x = dd & 1 ? x - demi : x + demi
        else x = x <= xmax - x ? dd : xmax - dd
        out[j] = x
      }
    }
  }
  return out.subarray(0, nOut)
}
