/**
 * EXPLORER UN SITE AVANT DE LE POMPER.
 *
 * On donne un domaine — « ville-pau.fr » — et on veut savoir ce qu'il a dans
 * le ventre : où est son agenda, publie-t-il un flux, ses fiches portent-elles
 * des images. Chercher la bonne page à la main est une corvée, et c'est une
 * corvée qu'une machine fait mieux.
 *
 * Tout ici est GRATUIT et DÉTERMINISTE : des requêtes HTTP et des motifs. Le
 * modèle n'intervient pas à ce stade et ne doit pas : deviner où est l'agenda
 * d'un site ne demande pas d'intelligence, ça demande de regarder le menu.
 *
 * Le nombre de pages visitées est borné (VISITES_MAX) : explorer un site ne
 * doit jamais devenir un crawl.
 */

/** Deduplication sans iterateur : le projet ne compile pas les Set. */
function sansDoublon(v: string[]): string[] {
  const vu: Record<string, true> = {}
  const out: string[] = []
  for (const x of v) { if (!vu[x]) { vu[x] = true; out.push(x) } }
  return out
}

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

/** Au-delà, on explore un site au lieu de le reconnaître. */
const VISITES_MAX = 14

/** Les mots qui désignent une page d'agenda, dans un lien ou son texte. */
const MOTS_AGENDA = /agenda|sorties|[ée]v[ée]nements?|manifestations?|que-?faire|programmation|spectacles|animations|calendrier/i

/** Chemins tentés quand le menu ne dit rien. Les plus courants d'abord. */
const CHEMINS_TYPES = [
  '/agenda', '/agenda/', '/evenements', '/evenements/', '/sorties',
  '/que-faire', '/programmation', '/animations', '/manifestations',
]

export interface PisteSource {
  /** L'adresse effectivement interrogée, après redirections. */
  origine: string
  /** Pages de liste candidates, la plus prometteuse en tête. */
  agendas: { url: string; evenements: number; methode: 'structure' | 'fiches' | 'inconnu' }[]
  /** Flux iCal (.ics) — la donnée la plus propre qui soit, quand elle existe. */
  ical: string[]
  /** Flux RSS ou Atom. */
  rss: string[]
  /** Ce qu'on a regardé, pour pouvoir expliquer un échec. */
  visitees: number
}

async function lire(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), 12_000)
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: ctrl.signal })
    clearTimeout(minuteur)
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    if (!/html|xml|text/i.test(ct)) return null
    return { html: await r.text(), url: r.url }
  } catch {
    return null
  }
}

/** Tous les liens d'une page, ramenés à des adresses absolues. */
function liens(html: string, base: string): { href: string; texte: string }[] {
  const out: { href: string; texte: string }[] = []
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim()
    if (!href || /^(javascript:|mailto:|tel:)/i.test(href)) continue
    try { href = new URL(href, base).toString() } catch { continue }
    out.push({ href, texte: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })
  }
  return out
}

/** Combien d'événements structurés cette page annonce-t-elle ? */
function compterEvents(html: string): number {
  let n = 0
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let j: unknown
    try { j = JSON.parse(m[1].trim()) } catch { continue }
    const g = j as { '@graph'?: unknown[] }
    const liste: unknown[] = Array.isArray(j) ? j : (Array.isArray(g?.['@graph']) ? g['@graph'] : [j])
    for (const x of liste) {
      const e = x as { '@type'?: string | string[]; name?: string }
      const t = Array.isArray(e?.['@type']) ? e['@type'].join(' ') : String(e?.['@type'] ?? '')
      if (/Event/i.test(t) && e.name) n++
    }
  }
  return n
}

/**
 * LES LIENS QUI MÈNENT AUX FICHES D'UN ÉVÉNEMENT.
 *
 * On ne cherche pas un mot-clé : on cherche une RÉPÉTITION. Une page de liste
 * porte vingt liens bâtis sur le même moule, et c'est le moule qui les trahit,
 * quel que soit le vocabulaire du site.
 *
 * LE MOULE, C'EST LE CHEMIN SANS SON DERNIER MORCEAU. Premier jet, on ne
 * remplaçait que les chiffres : « /evenements/bigflo-oli » et
 * « /evenements/christophe-mae » comptaient alors pour deux moules différents,
 * et la page d'accueil du Zénith — qui porte pourtant toute sa saison — ne
 * ressemblait à rien. En ne gardant que le préfixe, les deux se rejoignent
 * sous « evenements/* », qui est exactement ce qu'ils sont.
 */
function moulesDeLiens(html: string, pageListe: string): { forme: string; urls: string[] }[] {
  let base: URL
  try { base = new URL(pageListe) } catch { return [] }
  const profondeurListe = base.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length

  const parForme: Record<string, string[]> = {}
  for (const l of liens(html, pageListe)) {
    let u: URL
    try { u = new URL(l.href) } catch { continue }
    if (u.host !== base.host) continue
    const segs = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    if (segs.length <= profondeurListe) continue
    // Le dernier morceau est le nom de la fiche : il varie par nature.
    const forme = segs.slice(0, -1).map(x => x.replace(/\d+/g, '#')).join('/') + '/*'
    ;(parForme[forme] = parForme[forme] || []).push(u.origin + u.pathname)
  }
  return Object.entries(parForme)
    .map(([forme, v]) => ({ forme, urls: sansDoublon(v) }))
    .sort((a, b) => b.urls.length - a.urls.length)
}

/** Les adresses des fiches d'une page de liste, ou rien. */
export function liensDeFiches(html: string, pageListe: string): string[] {
  const m = moulesDeLiens(html, pageListe)
  return m.length && m[0].urls.length >= 3 ? m[0].urls : []
}

/** Le moule dominant, et combien de fiches il rassemble. */
export function formeDesFiches(html: string, pageListe: string): { forme: string; nombre: number } {
  const m = moulesDeLiens(html, pageListe)
  return m.length ? { forme: m[0].forme, nombre: m[0].urls.length } : { forme: '', nombre: 0 }
}

/**
 * LES BALISES QUE PRESQUE TOUS LES SITES PORTENT.
 *
 * Open Graph fabrique l'aperçu qu'on voit en collant un lien dans une
 * messagerie : un titre, un résumé, UNE IMAGE. C'est beaucoup plus répandu que
 * schema.org — la plupart des sites l'ont sans le savoir, parce que leur outil
 * de publication le pose tout seul.
 *
 * C'est ce qui permet de ramener une image d'un site qui ne publie aucune
 * donnée structurée, là où l'aplatissement en texte n'en ramenait aucune.
 */
export function metaOpenGraph(html: string): {
  titre: string | null; description: string | null; image: string | null
} {
  const lire1 = (prop: string): string | null => {
    const re = new RegExp(
      '<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i')
    const m = html.match(re)
    if (m?.[1]) return m[1]
    // Certains outils inversent l'ordre des attributs.
    const re2 = new RegExp(
      '<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i')
    return html.match(re2)?.[1] ?? null
  }
  const decode = (s: string | null) => s
    ? s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'")
       .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim()
    : null
  return {
    titre: decode(lire1('og:title') ?? lire1('twitter:title')),
    description: decode(lire1('og:description') ?? lire1('description')),
    image: decode(lire1('og:image') ?? lire1('twitter:image')),
  }
}

/**
 * CETTE PAGE EST-ELLE UNE LISTE, OU UN ARTICLE ?
 *
 * La répétition seule ne suffit pas : un article de journal porte lui aussi
 * une poignée de liens « à lire aussi » bâtis sur le même moule. Premier jet,
 * le site de la ville de Pau rendait neuf « agendas » qui étaient des
 * actualités.
 *
 * Deux conditions cumulées, donc : son PROPRE chemin doit annoncer un agenda,
 * et elle doit porter au moins six liens de même forme. Une page qui n'annonce
 * rien ne sera jamais retenue sur la foi de ses liens.
 */
function ressembleAUneListe(html: string, url: string): boolean {
  let chemin: string
  try { chemin = new URL(url).pathname } catch { return false }
  const { forme, nombre } = formeDesFiches(html, url)
  if (nombre < 6) return false
  /*
   * ON REGARDE OU VONT LES LIENS, PAS OU EST LA PAGE.
   *
   * Premier jet : la page devait s'appeler « agenda ». Le Zenith de Pau met
   * ses fiches `/evenements/bigflo-oli/` sur sa PAGE D'ACCUEIL — qui ne
   * s'appelle rien du tout. On l'ecartait alors que tout etait la.
   *
   * La forme commune des liens est le bon signal : `/evenements/#` dit ce
   * qu'ils sont, quel que soit l'endroit d'ou on les regarde.
   */
  /*
   * SEULE LA FORME DES LIENS FAIT FOI — pas le nom de la page.
   *
   * On acceptait aussi une page dont le CHEMIN parlait d'agenda. Le site de
   * la ville de Pau remontait alors huit « agendas » qui etaient des
   * articles : « /que-faire-des-encombrants », « /comment-bien-organiser-une-
   * manifestation ». Le titre d'un article contient les memes mots que le
   * nom d'une rubrique ; la forme de ses liens, non.
   */
  void chemin
  return MOTS_AGENDA.test(forme)
}

/**
 * EXPLORER UN SITE — le point d'entrée.
 *
 * Trois passes, de la plus sûre à la plus approximative :
 *   1. la page donnée publie-t-elle déjà des événements ? Alors c'est elle ;
 *   2. son en-tête annonce-t-il un flux (iCal, RSS) ? On le note ;
 *   3. son menu mène-t-il à une page d'agenda ? Sinon on tente les chemins
 *      les plus courants, puis le plan du site.
 *
 * On rend TOUTES les pistes trouvées, sans choisir à la place de l'appelant :
 * l'admin doit pouvoir voir ce qu'on a vu.
 */
export async function explorerSource(adresse: string): Promise<PisteSource> {
  const depart = adresse.startsWith('http') ? adresse : 'https://' + adresse
  const piste: PisteSource = { origine: depart, agendas: [], ical: [], rss: [], visitees: 0 }

  const racine = await lire(depart)
  piste.visitees++
  if (!racine) return piste
  piste.origine = racine.url

  // ── Les flux annoncés dans l'en-tête ──────────────────────────────────
  const reAlt = /<link[^>]+rel=["']alternate["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = reAlt.exec(racine.html)) !== null) {
    const balise = m[0]
    const href = balise.match(/href=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    let abs: string
    try { abs = new URL(href, racine.url).toString() } catch { continue }
    if (/rss|atom/i.test(balise)) piste.rss.push(abs)
    if (/calendar|ics/i.test(balise)) piste.ical.push(abs)
  }
  // Et ceux qui ne sont que des liens ordinaires.
  for (const l of liens(racine.html, racine.url)) {
    if (/\.ics(\?|$)/i.test(l.href) || /^webcal:/i.test(l.href)) piste.ical.push(l.href)
    else if (/\/(rss|feed|flux)(\.xml)?(\?|$)/i.test(l.href)) piste.rss.push(l.href)
  }
  piste.ical = sansDoublon(piste.ical).slice(0, 5)
  piste.rss = sansDoublon(piste.rss).slice(0, 5)

  // ── La page donnée est-elle déjà un agenda ? ──────────────────────────
  const candidates: string[] = []
  const n0 = compterEvents(racine.html)
  if (n0 > 0) {
    piste.agendas.push({ url: racine.url, evenements: n0, methode: 'structure' })
  } else if (ressembleAUneListe(racine.html, racine.url)) {
    piste.agendas.push({ url: racine.url, evenements: 0, methode: 'fiches' })
  }

  // ── Le menu ───────────────────────────────────────────────────────────
  for (const l of liens(racine.html, racine.url)) {
    let u: URL
    try { u = new URL(l.href) } catch { continue }
    if (u.host !== new URL(racine.url).host) continue
    if (!MOTS_AGENDA.test(u.pathname) && !MOTS_AGENDA.test(l.texte)) continue
    const propre = u.origin + u.pathname
    if (!candidates.includes(propre)) candidates.push(propre)
  }

  // ── Les chemins habituels, si le menu n'a rien donné ──────────────────
  if (!candidates.length) {
    const orig = new URL(racine.url).origin
    for (const c of CHEMINS_TYPES) candidates.push(orig + c)
  }

  // ── On regarde ce que valent les candidates ───────────────────────────
  for (const c of candidates) {
    if (piste.visitees >= VISITES_MAX) break
    if (piste.agendas.some(a => a.url === c)) continue
    const page = await lire(c)
    piste.visitees++
    if (!page) continue
    const n = compterEvents(page.html)
    if (n > 0) { piste.agendas.push({ url: page.url, evenements: n, methode: 'structure' }); continue }
    if (ressembleAUneListe(page.html, page.url)) {
      piste.agendas.push({ url: page.url, evenements: 0, methode: 'fiches' })
    }
  }

  /*
   * L'ORDRE COMPTE : c'est la première qui sera moissonnée.
   *
   *   1. la page qu'on nous a donnée, si elle vaut quelque chose — elle a
   *      été choisie par quelqu'un, elle prime sur nos trouvailles ;
   *   2. les pages structurées avant les autres ;
   *   3. à égalité, la plus GÉNÉRALE — le chemin le plus court. Sur alentoor,
   *      « /pau/agenda » couvre tout, « /pau/agenda/conference » n'est qu'une
   *      rubrique ; trier par nombre d'événements faisait gagner la rubrique.
   */
  const profondeur = (u: string) => {
    try { return new URL(u).pathname.split('/').filter(Boolean).length } catch { return 99 }
  }
  const demandee = (u: string) => (u.replace(/\/+$/, '') === depart.replace(/\/+$/, '')
    || u.replace(/\/+$/, '') === piste.origine.replace(/\/+$/, '')) ? 0 : 1
  piste.agendas.sort((a, b) =>
    demandee(a.url) - demandee(b.url)
    || (b.methode === 'structure' ? 1 : 0) - (a.methode === 'structure' ? 1 : 0)
    || profondeur(a.url) - profondeur(b.url)
    || b.evenements - a.evenements)
  return piste
}
