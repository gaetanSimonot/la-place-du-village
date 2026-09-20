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

/**
 * Pages de rubrique retenues dans le plan du site.
 *
 * Le guide du Béarn en déclare 153 — une par rubrique et par mois. Les
 * moissonner toutes ferait des milliers de fiches en un passage. On en prend
 * de quoi couvrir les prochains mois sans y passer la nuit ; le reste
 * viendra aux passages suivants, où rien n'est refait deux fois.
 */
const PAGES_DU_PLAN_MAX = 20

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

/**
 * Tous les liens d'une page, ramenés à des adresses absolues.
 *
 * ON NE LIT QUE LA BALISE OUVRANTE. Premier jet, l'expression exigeait le
 * `</a>` fermant à moins de 120 caractères — ce qui marche pour un lien de
 * menu et rate TOUS ceux d'un site qui enveloppe une carte entière (image,
 * titre, résumé, dates) dans son lien. Le guide du Béarn ne rendait alors
 * aucun lien, alors que sa page d'agenda en porte dix-huit.
 *
 * Le texte du lien n'est plus qu'un aperçu de ce qui suit, ce qui suffit : il
 * ne sert qu'à reconnaître un mot de menu.
 */
function liens(html: string, base: string): { href: string; texte: string }[] {
  const out: { href: string; texte: string }[] = []
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim()
    if (!href || /^(javascript:|mailto:|tel:)/i.test(href)) continue
    try { href = new URL(href, base).toString() } catch { continue }
    const apercu = html.slice(re.lastIndex, re.lastIndex + 200)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    out.push({ href, texte: apercu })
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
 * On ne cherche pas un mot-clé, on cherche une RÉPÉTITION : une page de liste
 * porte vingt liens qui partent tous au même endroit du site.
 *
 * LE SIGNAL, C'EST LE PRÉFIXE COMMUN, pas le chemin entier. Deuxième essai,
 * on regroupait sur le chemin privé de son dernier morceau — ce qui suffisait
 * pour « /evenements/bigflo-oli », mais pas pour le guide du Béarn, qui range
 * ses fiches en « /fr/agenda/cirque/monein-264/stage ». La catégorie et la
 * commune varient, donc chaque fiche fabriquait son propre moule et rien ne
 * se regroupait, alors que « fr/agenda » les rassemblait toutes.
 *
 * On essaie donc TOUS les préfixes, de un à quatre morceaux, et on garde le
 * plus PRÉCIS parmi ceux qui rassemblent le plus de fiches. « fr » et
 * « fr/agenda » en rassemblent autant ; c'est « fr/agenda » qui dit quelque
 * chose.
 */
function moulesDeLiens(html: string, pageListe: string): { forme: string; urls: string[] }[] {
  let base: URL
  try { base = new URL(pageListe) } catch { return [] }
  const profondeurListe = base.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length

  const parPrefixe: Record<string, string[]> = {}
  for (const l of liens(html, pageListe)) {
    let u: URL
    try { u = new URL(l.href) } catch { continue }
    if (u.host !== base.host) continue
    const segs = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    // Plus profond que la page de liste : sinon c'est de la navigation.
    if (segs.length <= profondeurListe) continue
    const propre = u.origin + u.pathname
    for (let k = 1; k <= Math.min(4, segs.length - 1); k++) {
      const prefixe = segs.slice(0, k).map(x => x.replace(/\d+/g, '#')).join('/')
      ;(parPrefixe[prefixe] = parPrefixe[prefixe] || []).push(propre)
    }
  }

  const groupes = Object.entries(parPrefixe)
    .map(([forme, v]) => ({ forme, urls: sansDoublon(v) }))
  if (!groupes.length) return []
  const meilleur = Math.max(...groupes.map(g => g.urls.length))

  /*
   * Le plus precis parmi les plus fournis. Un préfixe plus long qui garde
   * l'essentiel des fiches décrit mieux ce qu'elles sont — et un préfixe
   * trop court ramène la navigation du site avec.
   */
  return groupes
    .filter(g => g.urls.length >= meilleur * 0.8)
    .sort((a, b) =>
      b.forme.split('/').length - a.forme.split('/').length
      || b.urls.length - a.urls.length)
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
  /*
   * LE GUILLEMET FERMANT DOIT ÊTRE LE MÊME QUE L'OUVRANT.
   *
   * Premier jet : `content=["']([^"']*)["']`. Un titre en guillemets doubles
   * qui contient une apostrophe s'arrêtait dessus — « Le Tour de l'Ossau »
   * devenait « Le Tour de l », et « Théâtre « L'albert qu'Esm » » devenait
   * « Théâtre « L ». En français, une apostrophe par titre est la norme :
   * le défaut coupait la moitié des fiches.
   *
   * La référence arrière `\1` impose le même guillemet des deux côtés, et
   * l'apostrophe redevient un caractère ordinaire.
   */
  const lire1 = (prop: string): string | null => {
    const echappe = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      '<meta[^>]+(?:property|name)=(["\'])' + echappe + '\\1[^>]*content=(["\'])([\\s\\S]*?)\\2', 'i')
    const m = html.match(re)
    if (m?.[3] != null) return m[3]
    // Certains outils posent `content` avant `property`.
    const re2 = new RegExp(
      '<meta[^>]+content=(["\'])([\\s\\S]*?)\\1[^>]*(?:property|name)=(["\'])' + echappe + '\\3', 'i')
    const m2 = html.match(re2)
    return m2?.[2] ?? null
  }
  const decode = (s: string | null) => s
    ? s.replace(/&amp;/g, '&').replace(/&quot;|&#0?34;/g, '"')
       .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
       .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&nbsp;|&#160;/g, ' ')
       .replace(/&laquo;|&#171;/g, '«').replace(/&raquo;|&#187;/g, '»')
       .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
       .replace(/&ecirc;/g, 'ê').replace(/&ccedil;/g, 'ç').replace(/&ocirc;/g, 'ô')
       .replace(/\s+/g, ' ').trim()
    : null
  return {
    titre: decode(lire1('og:title') ?? lire1('twitter:title')),
    description: decode(lire1('og:description') ?? lire1('description')),
    image: decode(lire1('og:image') ?? lire1('twitter:image')),
  }
}

/**
 * LE PLAN DU SITE — la fouille que le site a faite pour nous.
 *
 * C'est le mecanisme canonique, et le plus genereux : beaucoup d'agendas y
 * declarent TOUTES leurs pages de rubrique, y compris celles qu'aucun menu ne
 * montre. Le guide du Bearn y publie « agenda/cinema.html?dates=2026-09 »,
 * « agenda/concerts.html?dates=2026-09 » et cent cinquante autres — une par
 * rubrique et par mois — alors que sa page d'agenda n'en lie aucune.
 *
 * On suit un niveau d'index (un plan qui renvoie a d'autres plans), on ne
 * garde que ce qui annonce un agenda, et on ECARTE LES MOIS PASSES : une
 * rubrique datee de mars dernier ne contient plus rien a moissonner.
 */
async function pagesDuPlan(origine: string, mois: string[]): Promise<string[]> {
  const base = new URL(origine).origin
  const out: string[] = []
  const locs = (x: string) => {
    const r: string[] = []
    const re = /<loc>([^<]+)<\/loc>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(x)) !== null) r.push(m[1].trim())
    return r
  }
  for (const nom of ['/sitemap.xml', '/sitemap_index.xml']) {
    const plan = await lire(base + nom)
    if (!plan) continue
    let adresses = locs(plan.html)
    // Un index de plans : on suit ceux qui parlent d'agenda, une fois.
    const sousPlans = adresses.filter(u => /\.xml($|\?)/i.test(u) && MOTS_AGENDA.test(u)).slice(0, 3)
    for (const sp of sousPlans) {
      const p2 = await lire(sp)
      if (p2) adresses = adresses.concat(locs(p2.html))
    }
    for (const u of adresses) {
      if (/\.xml($|\?)/i.test(u)) continue
      let x: URL
      try { x = new URL(u) } catch { continue }
      if (x.host !== new URL(origine).host) continue
      if (!MOTS_AGENDA.test(x.pathname)) continue
      // Une page datee : on ne garde que le mois courant et les suivants.
      const date = x.searchParams.get('dates') || x.searchParams.get('SD') || ''
      if (date) {
        const mm = date.match(/(\d{4})-(\d{2})/) || date.match(/(\d{2})\/(\d{4})/)
        if (mm) {
          const cle = mm[0].length === 7 && mm[0].indexOf('-') === 4
            ? mm[0] : mm[2] + '-' + mm[1]
          if (mois.indexOf(cle) < 0) continue
        }
      }
      if (out.indexOf(u) < 0) out.push(u)
    }
    if (out.length) break
  }
  return out
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

  /*
   * L'ORDRE DES VISITES COMPTE, puisqu'elles sont comptees.
   *
   * Un menu melange « /fr/agenda/concerts.html » et
   * « /actualites/comment-organiser-une-manifestation ». Le premier porte le
   * mot dans son CHEMIN, le second seulement dans son intitule — et le budget
   * de visites partait dans le second. On regarde donc d'abord les adresses
   * qui annoncent un agenda par leur chemin, et les plus courtes d'abord.
   */
  candidates.sort((a, b) => {
    const parChemin = (u: string) => {
      try { return MOTS_AGENDA.test(new URL(u).pathname) ? 0 : 1 } catch { return 1 }
    }
    const longueur = (u: string) => {
      try { return new URL(u).pathname.length } catch { return 999 }
    }
    return parChemin(a) - parChemin(b) || longueur(a) - longueur(b)
  })

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
   * LE PLAN DU SITE, en dernier recours de recherche mais pas de valeur :
   * il déclare souvent des rubriques qu'aucun menu ne montre.
   */
  const maintenant = new Date()
  const moisUtiles: string[] = []
  for (let k = 0; k < 4; k++) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + k, 1)
    moisUtiles.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
  }
  try {
    const duPlan = await pagesDuPlan(piste.origine, moisUtiles)
    for (const u of duPlan.slice(0, PAGES_DU_PLAN_MAX)) {
      if (piste.agendas.some(x => x.url === u)) continue
      // On ne les visite pas une par une : le site les déclare lui-même, et
      // les tester toutes coûterait plus cher que de les moissonner.
      piste.agendas.push({ url: u, evenements: 0, methode: 'inconnu' })
    }
  } catch { /* pas de plan : tant pis */ }

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
  const verifiee = (m: string) => (m === 'inconnu' ? 1 : 0)
  piste.agendas.sort((a, b) =>
    demandee(a.url) - demandee(b.url)
    || verifiee(a.methode) - verifiee(b.methode)
    || (b.methode === 'structure' ? 1 : 0) - (a.methode === 'structure' ? 1 : 0)
    || profondeur(a.url) - profondeur(b.url)
    || b.evenements - a.evenements)
  return piste
}
