import { supabaseAdmin } from '@/lib/supabase-admin'
import { getPrompt } from '@/lib/prompts-ia'
// dateParis vit dans le module cinéma mais ne touche pas la base : c'est un
// helper pur (Intl, timeZone Europe/Paris). Le serveur Vercel étant en UTC,
// le redéfinir ici ferait une deuxième vérité pour la même question.
import { dateParis } from '@/lib/cinema'
import { meteoJour } from '@/lib/assistant/meteo'
import { motsCles, classer, classerLieux, nu, libelleRecherche } from '@/lib/assistant/recherche'

/**
 * ASSISTANT VILLAGE — les outils. SERVEUR UNIQUEMENT.
 *
 * Le modèle ne reçoit JAMAIS la base. Il choisit un outil, l'outil interroge
 * Supabase avec des bornes que le serveur impose (limite, statut, fenêtre de
 * dates), et renvoie DEUX choses distinctes :
 *
 *   pourLeModele → un résumé compact, de quoi choisir et expliquer ;
 *   cartes       → les lignes réelles, pour que le client affiche les vraies
 *                  fiches cliquables.
 *
 * C'est cette séparation qui rend une carte inhallucinable : le texte du
 * modèle ne porte que des identifiants, et un identifiant qu'aucun outil n'a
 * renvoyé n'affiche rien. Les faits restent dans la base de bout en bout.
 *
 * TOUTES les recherches prennent une LISTE de mots, jamais un seul : c'est
 * l'assistant qui élargit « manger italien » en pizzeria, trattoria, pasta.
 * Voir recherche.ts pour le pourquoi.
 */

/** Une fiche réelle, renvoyée au client pour affichage. */
export interface Carte {
  type: 'ev' | 'etab' | 'prod' | 'film' | 'promo' | 'annonce'
  id: string
  data: Record<string, unknown>
}

/** Une proposition d'agir, que la personne accepte d'un geste — ou pas. */
export interface ActionProposee {
  type: 'evenement' | 'annonce' | 'etablissement' | 'favoris' | 'partage'
  libelle: string
  texte?: string
  ids?: string[]
}

export interface ResultatOutil {
  pourLeModele: unknown
  cartes: Carte[]
  /** Le bouton à afficher sous la réponse, s'il y en a un. */
  action?: ActionProposee
  /** Ce qu'on montre à l'écran pendant la recherche : « pizzeria, italien… ». */
  libelle?: string | null
}

/**
 * Plafond de résultats rendus au modèle.
 *
 * Volontairement généreux : c'est LUI qui choisit quoi proposer, et il ne
 * peut pas choisir dans ce qu'il ne voit pas. Douze suffisaient à couper
 * « du yoga dans la région » en plein milieu — le secteur en compte douze
 * lieux et huit événements.
 */
const MAX = 18
/** Ce qu'on lit en base avant de classer — large, pour ne rater personne. */
const LARGE = 60
/** Fenêtre maximale d'une recherche de dates — 3 mois suffisent au village. */
const HORIZON_MAX = 92

/* ═══════════════════════════════════════════════════════════════════════
   DÉFINITIONS — ce que le modèle voit
   ═══════════════════════════════════════════════════════════════════════ */

/** Le texte commun à tous les paramètres `mots` : c'est LA consigne clé. */
const MOTS_DESC =
  "Les mots à chercher, tels qu'ils sont ÉCRITS DANS LES FICHES — pas la façon dont la personne parle. " +
  "Donnez-en 3 à 6, du plus précis au plus large, en incluant les mots d'enseigne, les spécialités et les synonymes. " +
  '« manger italien » → ["pizzeria","italien","pizza","trattoria","pasta"]. ' +
  '« un électricien » → ["electricien","electricite","elec"]. ' +
  '« du pain » → ["boulangerie","boulanger","fournil","pain"]. ' +
  "Les accents et la casse n'ont pas d'importance. Omettez ce paramètre pour tout parcourir."

export const OUTILS = [
  {
    name: 'chercher_evenements',
    description:
      "Événements, sorties et animations du village : concerts, spectacles, marchés, ateliers, fêtes, sport, bien-être. À utiliser dès qu'on cherche quoi faire, quand sortir, ou ce qui se passe à une date. La réponse sépare les rendez-vous datés de ce qui dure des semaines (expositions, permanences, cours à l'année).",
    input_schema: {
      type: 'object' as const,
      properties: {
        du:   { type: 'string', description: 'Premier jour cherché, AAAA-MM-JJ.' },
        au:   { type: 'string', description: 'Dernier jour cherché inclus, AAAA-MM-JJ. Le même que "du" pour une seule journée.' },
        mots: { type: 'array', items: { type: 'string' }, description: MOTS_DESC },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['concert', 'theatre', 'sport', 'marche', 'atelier', 'fete', 'sante_bien_etre', 'autre'] },
          description: "Filtre facultatif. Sans lui, toutes les catégories remontent — préférable quand la demande est vague, car le classement d'un événement est souvent approximatif.",
        },
        commune: { type: 'string', description: 'Nom de commune, facultatif.' },
        en_continu: {
          type: 'boolean',
          description: "true seulement si la personne cherche explicitement une exposition, une permanence ou un cours à l'année. Par défaut (false), ce qui dure des semaines est renvoyé à part, sous « aussi_en_cours ».",
        },
      },
      required: ['du', 'au'],
    },
  },
  {
    name: 'chercher_etablissements',
    description:
      "Commerces, restaurants, artisans, services, hébergements, activités, lieux de bien-être ET producteurs du secteur — près de 1500 fiches. À utiliser pour « où manger », « je cherche un électricien », « un endroit pour dormir », « du fromage de chèvre ».",
    input_schema: {
      type: 'object' as const,
      properties: {
        mots: { type: 'array', items: { type: 'string' }, description: MOTS_DESC },
        type: {
          type: 'string',
          enum: ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite', 'producteur'],
          description: "Famille de lieu. Un électricien, un plombier ou un garagiste sont des artisan_service ; un maraîcher, un fromager ou un apiculteur sont des producteur. À n'utiliser que si vous en êtes sûr : les mots suffisent le plus souvent, et un mauvais filtre écarte des fiches justes.",
        },
        commune: { type: 'string', description: 'Nom de commune, facultatif.' },
      },
      required: [],
    },
  },
  {
    name: 'chercher_seances',
    description:
      "Films à l'affiche et séances des cinémas du secteur. À utiliser pour « qu'est-ce qui passe au cinéma », « un film samedi », « un dessin animé pour les enfants ».",
    input_schema: {
      type: 'object' as const,
      properties: {
        du:   { type: 'string', description: 'Premier jour, AAAA-MM-JJ.' },
        au:   { type: 'string', description: 'Dernier jour inclus, AAAA-MM-JJ.' },
        mots: {
          type: 'array', items: { type: 'string' },
          description: "Titre, genre ou public visé, en plusieurs formulations : [\"animation\",\"famille\",\"enfants\"]. Omettez pour voir toute l'affiche — souvent le mieux, il y a peu de films.",
        },
      },
      required: ['du', 'au'],
    },
  },
  {
    name: 'chercher_promotions',
    description: 'Bons plans et promotions en cours chez les commerçants partenaires. Peu nombreux : omettez les mots pour tout voir.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mots: { type: 'array', items: { type: 'string' }, description: MOTS_DESC },
      },
      required: [],
    },
  },
  {
    name: 'chercher_annonces',
    description: 'Petites annonces entre habitants : ventes, dons, trocs, services.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mots: { type: 'array', items: { type: 'string' }, description: MOTS_DESC },
        type: { type: 'string', enum: ['vente', 'troc', 'don', 'service', 'enchere_inversee'] },
        categorie: {
          type: 'string',
          enum: ['immobilier', 'vehicules', 'multimedia', 'maison', 'jardin', 'bricolage', 'mode', 'loisirs', 'services', 'animaux', 'autres'],
        },
      },
      required: [],
    },
  },
  {
    name: 'meteo',
    description:
      "Météo prévue à Ganges pour un jour donné, jusqu'à 7 jours. À utiliser seulement quand le temps change la réponse : sortie en extérieur, activité avec des enfants, balade.",
    input_schema: {
      type: 'object' as const,
      properties: { date: { type: 'string', description: 'Jour cherché, AAAA-MM-JJ.' } },
      required: ['date'],
    },
  },
  {
    name: 'proposer_action',
    description:
      "Proposer à la personne de FAIRE quelque chose : publier un événement ou une annonce, inscrire son commerce, garder des fiches en favori, ou partager la réponse. " +
      "Vous ne faites rien vous-même : un bouton apparaît, et c'est elle qui décide. Appelez cet outil APRÈS avoir répondu à la question, jamais à la place. " +
      "N'en proposez qu'une seule à la fois, et seulement quand elle tombe sous le sens.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['evenement', 'annonce', 'etablissement', 'favoris', 'partage'],
          description:
            "evenement : ouvrir la publication d'un événement, pré-remplie avec `texte`. " +
            "annonce : ouvrir le dépôt d'une petite annonce. " +
            "etablissement : ouvrir la demande d'inscription d'un commerce. " +
            "favoris : garder les fiches que vous venez de citer (cinq au maximum). " +
            "partage : envoyer votre réponse à quelqu'un.",
        },
        libelle: {
          type: 'string',
          description: "Ce qui sera écrit sur le bouton, à l'infinitif et court : « Publier cet événement », « Garder ces trois sorties ».",
        },
        texte: {
          type: 'string',
          description:
            "Pour `evenement` seulement : la description en une phrase complète, telle qu'on l'écrirait à la main — titre, jour, heure, lieu, commune, prix. " +
            "Elle pré-remplit le formulaire, que la personne relira. N'inventez aucun détail qu'elle n'a pas donné.",
        },
        ids: {
          type: 'array', items: { type: 'string' },
          description: "Pour `favoris` : les identifiants des fiches à garder, pris parmi celles que vous venez de citer. Cinq au maximum.",
        },
      },
      required: ['type', 'libelle'],
    },
  },
  {
    name: 'aide_lpv',
    description:
      "Comment fonctionne La Place du Village : créer un compte, revendiquer sa fiche, publier un événement ou une promotion, les offres Habitant et Partenaire. À utiliser pour TOUTE question sur l'application — n'y répondez jamais de mémoire.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

/* ═══════════════════════════════════════════════════════════════════════
   EXÉCUTION
   ═══════════════════════════════════════════════════════════════════════ */

type Args = Record<string, unknown>

const texteDe = (a: Args, k: string) => {
  const v = a[k]
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null
}

/** PostgREST découpe .or() sur les virgules et les parenthèses. */
const echapper = (s: string) => s.replace(/,/g, '\\,').replace(/\)/g, '\\)').replace(/\(/g, '\\(')

/**
 * Borne une fenêtre de dates proposée par le modèle : jamais dans le passé,
 * jamais au-delà de l'horizon. Une date mal résolue ne doit pas sortir un
 * événement terminé ni balayer toute la base.
 */
function fenetre(a: Args): { du: string; au: string } {
  const aujourdhui = dateParis()
  const max = dateParis(HORIZON_MAX)
  const brut = (k: string) => (typeof a[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a[k] as string) ? (a[k] as string) : null)
  let du = brut('du') ?? aujourdhui
  let au = brut('au') ?? du
  if (du < aujourdhui) du = aujourdhui
  if (au > max) au = max
  if (au < du) au = du
  return { du, au }
}

export async function executerOutil(nom: string, args: Args): Promise<ResultatOutil> {
  switch (nom) {
    case 'chercher_evenements':     return evenements(args)
    case 'chercher_etablissements': return etablissements(args)
    case 'chercher_seances':        return seances(args)
    case 'chercher_promotions':     return promotions(args)
    case 'chercher_annonces':       return annonces(args)
    case 'meteo':                   return meteo(args)
    case 'proposer_action':         return proposerAction(args)
    case 'aide_lpv':                return aide()
    default:
      return { pourLeModele: { erreur: `Outil inconnu : ${nom}` }, cartes: [] }
  }
}

/* ─── Événements ───────────────────────────────────────────────────────── */

const CHAMPS_EV = 'id, titre, description, date_debut, date_fin, heure, categorie, categories, image_url, image_position, lieu_id, prix, contact, organisateurs, statut, promotion, promo_ordre, vote_count, submitted_by, submitted_by_name, source, created_at, doublon_verifie'

/** Au-delà, ce n'est plus un rendez-vous mais quelque chose qui se visite. */
const DURABLE_JOURS = 8

type EvLigne = Record<string, unknown> & {
  id: string
  titre: string
  date_debut: string | null
  date_fin: string | null
  lieux: Record<string, unknown> | null
}

/** Nombre de jours couverts, bornes comprises. */
function duree(e: { date_debut?: unknown; date_fin?: unknown }): number {
  const d = typeof e.date_debut === 'string' ? e.date_debut : null
  const f = typeof e.date_fin === 'string' ? e.date_fin : null
  if (!d || !f || f === d) return 1
  return Math.round((Date.parse(f) - Date.parse(d)) / 86_400_000) + 1
}

async function evenements(a: Args): Promise<ResultatOutil> {
  const { du, au } = fenetre(a)
  const mots = motsCles(a.mots)
  const cats = Array.isArray(a.categories) ? (a.categories as string[]).filter(c => typeof c === 'string') : []
  const commune = texteDe(a, 'commune')
  const termes = mots.length ? mots : null

  /**
   * DEUX requêtes, et c'est tout l'intérêt.
   *
   * 73 événements chevauchent un week-end donné, dont une exposition ouverte
   * depuis 346 jours. En une seule requête triée par date de début, les
   * permanences prenaient les douze premières places et les vraies sorties du
   * samedi n'atteignaient jamais l'assistant : il répondait qu'il n'y avait
   * rien, en ne proposant que des expositions. La durée se tranche donc EN
   * BASE, avant la limite — la trancher après revient à ne rien trancher.
   */
  const lire = async (continus: boolean, lim: number): Promise<EvLigne[]> => {
    const rpc = await supabaseAdmin.rpc('assistant_evenements', {
      du, au, termes, cats: cats.length ? cats : null,
      commune_filtre: commune, continus, lim,
    })
    if (!rpc.error) return (rpc.data ?? []) as EvLigne[]

    // Migration non jouée : on lit large et on tranche ici. Dégradé sur les
    // accents, mais la limite ne se fait plus manger par les permanences.
    let q = supabaseAdmin.from('evenements').select(CHAMPS_EV)
      .eq('statut', 'publie')
      .lte('date_debut', au)
      .or(`date_fin.gte.${du},and(date_fin.is.null,date_debut.gte.${du})`)
      .order('date_debut').limit(200)
    if (cats.length) q = q.overlaps('categories', cats)
    if (mots.length) {
      const ou = mots.flatMap(m => [`titre.ilike.%${echapper(m)}%`, `description.ilike.%${echapper(m)}%`]).join(',')
      q = q.or(ou)
    }
    const { data } = await q
    return ((data ?? []) as unknown as EvLigne[])
      .filter(e => (continus ? duree(e) >= DURABLE_JOURS : duree(e) < DURABLE_JOURS))
      .slice(0, lim)
  }

  const veutDurables = a.en_continu === true
  const [datesBrut, durablesBrut] = await Promise.all([
    lire(false, LARGE),
    lire(true, veutDurables ? LARGE : 8),
  ])

  const toutes = [...datesBrut, ...durablesBrut]
  if (!toutes.length) {
    return { pourLeModele: { resultats: [] }, cartes: [], libelle: libelleRecherche(mots) }
  }

  // Deuxième requête plutôt qu'une jointure : les jointures implicites
  // PostgREST échouent en silence sur ce projet.
  const lieuIds = Array.from(new Set(toutes.map(e => e.lieu_id).filter(Boolean))) as string[]
  const { data: lieux } = lieuIds.length
    ? await supabaseAdmin.from('lieux').select('*').in('id', lieuIds)
    : { data: [] }
  const parLieu = new Map((lieux ?? []).map(l => [l.id, l]))

  const communeNu = commune ? nu(commune) : null
  const habiller = (liste: EvLigne[]) => liste
    .map(e => ({ ...e, lieux: e.lieu_id ? parLieu.get(e.lieu_id as string) ?? null : null }) as EvLigne)
    // « Sumène » doit trouver « Sumene » — le repli désaccentue lui aussi.
    .filter(e => !communeNu || nu(e.lieux?.commune).includes(communeNu))

  const dates = classer(habiller(datesBrut), mots, MAX)
  const durables = classer(habiller(durablesBrut), mots, MAX)

  const resume = (e: EvLigne) => ({
    id: e.id,
    titre: e.titre,
    date: e.date_debut,
    fin: e.date_fin !== e.date_debut ? e.date_fin : undefined,
    heure: e.heure,
    categories: e.categories ?? [e.categorie],
    lieu: (e.lieux?.nom as string) ?? null,
    commune: (e.lieux?.commune as string) ?? null,
    prix: e.prix,
    contact: e.contact,
    organisateurs: e.organisateurs,
    resume: e.description ? String(e.description).slice(0, 260) : null,
  })

  // Quand on demande explicitement les expositions, elles deviennent la
  // réponse principale. Sinon elles restent en second plan.
  const principaux = veutDurables ? durables : dates
  const secondaires = veutDurables ? dates : durables

  return {
    pourLeModele: {
      resultats: principaux.map(resume),
      aussi_en_cours: secondaires.slice(0, 4).map(e => ({ ...resume(e), dure_jusquau: e.date_fin })),
      note: secondaires.length && !veutDurables
        ? 'Les entrées de « aussi_en_cours » durent plusieurs semaines (expositions, permanences). Ne les proposez que si la personne les cherche vraiment.'
        : undefined,
    },
    cartes: [...principaux, ...secondaires].map(e => ({ type: 'ev' as const, id: e.id, data: e })),
    libelle: libelleRecherche(mots),
  }
}

/* ─── Établissements et producteurs ───────────────────────────────────── */

async function etablissements(a: Args): Promise<ResultatOutil> {
  const mots = motsCles(a.mots)
  const commune = texteDe(a, 'commune')
  const type = typeof a.type === 'string' && a.type !== 'producteur' ? a.type : null
  const veutProducteurs = a.type === 'producteur' || !type
  const termes = mots.length ? mots : null

  let lignes: Record<string, unknown>[] = []
  const rpc = await supabaseAdmin.rpc('assistant_etablissements', {
    termes, type_filtre: type, commune_filtre: commune, lim: LARGE,
  })

  if (rpc.error) {
    // Migration non jouée : requête directe, aveugle aux accents.
    let q = supabaseAdmin.from('etablissements').select('*').limit(LARGE)
    if (type) q = q.eq('type', type)
    if (commune) q = q.ilike('commune', `%${echapper(commune)}%`)
    if (mots.length) {
      const ou = mots.flatMap(m => [
        `nom.ilike.%${echapper(m)}%`,
        `description_courte.ilike.%${echapper(m)}%`,
        `description_longue.ilike.%${echapper(m)}%`,
      ]).join(',')
      q = q.or(ou)
    }
    const { data } = await q
    lignes = (data ?? []) as Record<string, unknown>[]
  } else {
    lignes = (rpc.data ?? []) as Record<string, unknown>[]
  }

  // Les producteurs vivent dans une autre table, mais un producteur EST un
  // commerce local : « du fromage de chèvre » doit le trouver.
  let prods: Record<string, unknown>[] = []
  if (veutProducteurs) {
    const r = await supabaseAdmin.rpc('assistant_producteurs', { termes, commune_filtre: commune, lim: 10 })
    if (!r.error) prods = (r.data ?? []) as Record<string, unknown>[]
  }

  lignes = classerLieux(lignes, mots, MAX)
  prods = classer(prods, mots, 4)

  const enAvant = (e: Record<string, unknown>) => e.is_featured === true || e.plan === 'pro'

  /**
   * Les bons plans des lieux trouvés, joints ICI et pas ailleurs.
   *
   * « Où manger ce soir ? » et « il y a justement une promo chez eux » sont
   * la même réponse : personne ne pense à demander les promotions. En les
   * attachant aux lieux, elles ne sortent JAMAIS hors sujet — c'est le
   * risque d'une mise en avant commerciale, et ce qui la rend acceptable.
   */
  const promosParEtab = new Map<string, { id: string; titre: string }>()
  if (lignes.length) {
    const { data: promos } = await supabaseAdmin
      .from('promotions')
      .select('id, etablissement_id, title, description, image_url, valid_until')
      .eq('active', true)
      .in('etablissement_id', lignes.map(e => String(e.id)))
      .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
    for (const p of promos ?? []) {
      const cle = String(p.etablissement_id)
      if (!promosParEtab.has(cle)) promosParEtab.set(cle, { id: String(p.id), titre: String(p.title) })
    }
  }

  return {
    pourLeModele: {
      resultats: [
        // Les coordonnées font partie de la réponse : « tu me donnes le
        // numéro du Milonga ? » ne doit pas obliger à ouvrir la fiche.
        ...lignes.map(e => ({
          id: e.id, nom: e.nom, type: e.type, commune: e.commune, note: e.note_google,
          adresse: e.adresse, telephone: e.contact_tel, site: e.site_web,
          horaires: e.horaires ? String(e.horaires).slice(0, 220) : null,
          resume: e.description_courte ? String(e.description_courte).slice(0, 200) : null,
          mis_en_avant: enAvant(e),
          // Signalez-la si elle colle à la demande, jamais autrement.
          bon_plan: promosParEtab.get(String(e.id)) ?? null,
        })),
        ...prods.map(p => ({
          id: p.id, nom: p.nom, type: 'producteur', commune: p.commune,
          adresse: p.adresse, telephone: p.contact_tel, site: p.site_web,
          resume: p.description_courte ? String(p.description_courte).slice(0, 200) : null,
          mis_en_avant: false,
        })),
      ],
    },
    cartes: [
      ...lignes.map(e => ({
        type: 'etab' as const, id: String(e.id),
        // La carte porte le bon plan : un liseré suffit à le dire.
        data: { ...e, bon_plan: promosParEtab.get(String(e.id)) ?? null },
      })),
      ...prods.map(p => ({ type: 'prod' as const, id: String(p.id), data: p })),
    ],
    libelle: libelleRecherche(mots),
  }
}

/* ─── Cinéma ───────────────────────────────────────────────────────────── */

async function seances(a: Args): Promise<ResultatOutil> {
  const { du, au } = fenetre(a)
  const mots = motsCles(a.mots)

  const { data: rows } = await supabaseAdmin
    .from('seances')
    .select('id, etablissement_id, film_id, date, heure, version, salle')
    .gte('date', du).lte('date', au)
    .order('date').order('heure')
    .limit(150)
  const lignes = rows ?? []
  if (!lignes.length) return { pourLeModele: { resultats: [] }, cartes: [], libelle: libelleRecherche(mots) }

  const filmIds = Array.from(new Set(lignes.map(s => s.film_id)))
  const sallesIds = Array.from(new Set(lignes.map(s => s.etablissement_id)))
  const [filmsRes, sallesRes] = await Promise.all([
    supabaseAdmin.from('films').select('id, titre, annee, duree_min, realisateur, genres, synopsis, affiche_url, avertissement').in('id', filmIds),
    supabaseAdmin.from('etablissements').select('id, nom, commune').in('id', sallesIds),
  ])
  const parSalle = new Map((sallesRes.data ?? []).map(c => [c.id, c]))

  // Le tri se fait ici : il y a rarement plus de vingt films à l'affiche, et
  // le genre comme le synopsis comptent autant que le titre.
  const tous = (filmsRes.data ?? []).map(f => ({
    ...f,
    // `classer` lit `description` : on lui donne de quoi juger un film.
    description: [f.synopsis, (f.genres ?? []).join(' '), f.realisateur].filter(Boolean).join(' '),
  })) as unknown as Record<string, unknown>[]
  const films = classer(tous, mots, MAX)

  // On raisonne par FILM, pas par séance : « un film pour les enfants
  // dimanche » se choisit sur le film, ses horaires viennent ensuite.
  const resultats = films.map(f => {
    const sf = lignes.filter(s => s.film_id === f.id)
    return {
      id: String(f.id),
      titre: f.titre,
      duree_min: f.duree_min,
      genres: f.genres,
      avertissement: f.avertissement,
      resume: f.synopsis ? String(f.synopsis).slice(0, 180) : null,
      seances: sf.slice(0, 8).map(s => ({
        date: s.date,
        heure: String(s.heure).slice(0, 5),
        version: s.version,
        cinema: parSalle.get(s.etablissement_id)?.nom ?? null,
        commune: parSalle.get(s.etablissement_id)?.commune ?? null,
      })),
    }
  })

  return {
    pourLeModele: { resultats },
    cartes: films.map(f => ({
      type: 'film' as const,
      id: String(f.id),
      data: { ...f, seances: resultats.find(r => r.id === String(f.id))?.seances ?? [] },
    })),
    libelle: libelleRecherche(mots),
  }
}

/* ─── Bons plans ───────────────────────────────────────────────────────── */

async function promotions(a: Args): Promise<ResultatOutil> {
  const mots = motsCles(a.mots)
  // Une poignée de promotions actives à un instant donné : on les lit toutes
  // et on classe ici, plutôt que d'imposer un mot à la base.
  const { data } = await supabaseAdmin
    .from('promotions')
    .select('id, etablissement_id, title, description, image_url, conditions, valid_until')
    .eq('active', true)
    .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(60)

  const toutes = (data ?? []) as Record<string, unknown>[]
  const lignes = classer(toutes, mots, MAX)
  if (!lignes.length) return { pourLeModele: { resultats: [] }, cartes: [], libelle: libelleRecherche(mots) }

  const { data: etabs } = await supabaseAdmin
    .from('etablissements').select('id, nom, commune, type, photos')
    .in('id', Array.from(new Set(lignes.map(p => p.etablissement_id as string))))
  const parEtab = new Map((etabs ?? []).map(e => [e.id, e]))
  type PromoLigne = Record<string, unknown> & { etablissement: Record<string, unknown> | null }
  const avecEtab: PromoLigne[] = lignes.map(p => ({
    ...p,
    etablissement: (parEtab.get(p.etablissement_id as string) ?? null) as Record<string, unknown> | null,
  }))

  return {
    pourLeModele: {
      resultats: avecEtab.map(p => ({
        id: p.id,
        titre: p.title,
        chez: (p.etablissement?.nom as string) ?? null,
        commune: (p.etablissement?.commune as string) ?? null,
        jusquau: p.valid_until,
        resume: p.description ? String(p.description).slice(0, 140) : null,
      })),
    },
    cartes: avecEtab.map(p => ({ type: 'promo' as const, id: String(p.id), data: p })),
    libelle: libelleRecherche(mots),
  }
}

/* ─── Petites annonces ─────────────────────────────────────────────────── */

async function annonces(a: Args): Promise<ResultatOutil> {
  const mots = motsCles(a.mots)
  let q = supabaseAdmin
    .from('annonces')
    .select('id, type, titre, description, categorie, photos, prix_actuel, prix_initial, ville, created_at, sponsored')
    .eq('statut', 'active')
    .order('created_at', { ascending: false })
    .limit(80)
  if (typeof a.type === 'string') q = q.eq('type', a.type)
  if (typeof a.categorie === 'string') q = q.eq('categorie', a.categorie)

  const { data } = await q
  const lignes = classer((data ?? []) as Record<string, unknown>[], mots, MAX)

  return {
    pourLeModele: {
      resultats: lignes.map(x => ({
        id: x.id, titre: x.titre, type: x.type, categorie: x.categorie,
        prix: x.prix_actuel ?? x.prix_initial, ville: x.ville,
      })),
    },
    cartes: lignes.map(x => ({ type: 'annonce' as const, id: String(x.id), data: x })),
    libelle: libelleRecherche(mots),
  }
}

/* ─── Agir ─────────────────────────────────────────────────────────────── */

/**
 * L'assistant PROPOSE, il n'exécute pas.
 *
 * Rien n'est écrit ici : on valide une intention et on renvoie de quoi
 * afficher un bouton. C'est la personne qui l'actionne, et le module concerné
 * s'ouvre alors normalement — avec ses règles, ses champs obligatoires et sa
 * relecture. Un assistant qui publierait tout seul ferait des dégâts que
 * personne n'a demandés.
 */
const TYPES_ACTION = ['evenement', 'annonce', 'etablissement', 'favoris', 'partage'] as const

async function proposerAction(a: Args): Promise<ResultatOutil> {
  const type = TYPES_ACTION.find(t => t === a.type)
  if (!type) return { pourLeModele: { erreur: 'Type d’action inconnu.' }, cartes: [] }

  const libelle = texteDe(a, 'libelle') ?? 'Continuer'
  const ids = Array.isArray(a.ids)
    // Cinq d'un coup au maximum : au-delà, on ne sait plus ce qu'on a gardé.
    ? (a.ids as unknown[]).filter(x => typeof x === 'string').slice(0, 5) as string[]
    : undefined
  const texte = typeof a.texte === 'string' ? a.texte.trim().slice(0, 600) : undefined

  if (type === 'favoris' && (!ids || !ids.length)) {
    return { pourLeModele: { erreur: 'Aucune fiche à garder : citez-les d’abord.' }, cartes: [] }
  }

  return {
    pourLeModele: { propose: type, libelle, note: 'Le bouton est affiché. Ne le décrivez pas longuement, une demi-phrase suffit.' },
    cartes: [],
    action: { type, libelle, texte, ids },
  }
}

/* ─── Météo et aide ────────────────────────────────────────────────────── */

async function meteo(a: Args): Promise<ResultatOutil> {
  const date = typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : dateParis()
  return { pourLeModele: await meteoJour(date), cartes: [] }
}

/**
 * L'aide est un PROMPT en base, pas du texte compilé : ce que l'assistant
 * peut affirmer sur l'application se corrige depuis /admin/prompts, sans
 * redéploiement, et ne peut pas diverger de ce que le modèle raconte.
 */
async function aide(): Promise<ResultatOutil> {
  try {
    return { pourLeModele: { aide: await getPrompt('assistant_aide_lpv') }, cartes: [] }
  } catch {
    return {
      pourLeModele: { erreur: "L'aide n'est pas disponible. Invitez la personne à ouvrir le menu « C'est quoi La Place du Village ? »." },
      cartes: [],
    }
  }
}
