import { supabaseAdmin } from '@/lib/supabase-admin'
import { getPrompt } from '@/lib/prompts-ia'
// dateParis vit dans le module cinéma mais ne touche pas la base : c'est un
// helper pur (Intl, timeZone Europe/Paris). Le serveur Vercel étant en UTC,
// le redéfinir ici ferait une deuxième vérité pour la même question.
import { dateParis } from '@/lib/cinema'
import { meteoJour } from '@/lib/assistant/meteo'

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
 */

/** Une fiche réelle, renvoyée au client pour affichage. */
export interface Carte {
  type: 'ev' | 'etab' | 'prod' | 'film' | 'promo' | 'annonce'
  id: string
  data: Record<string, unknown>
}

export interface ResultatOutil {
  pourLeModele: unknown
  cartes: Carte[]
}

/** Plafond serveur, jamais négociable par le modèle. */
const MAX = 12

/** Fenêtre maximale d'une recherche de dates — 3 mois suffisent au village. */
const HORIZON_MAX = 92

/* ═══════════════════════════════════════════════════════════════════════
   DÉFINITIONS — ce que le modèle voit
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Volontairement peu d'outils, aux paramètres évidents. Un outil par famille
 * de contenu du village : au-delà, le modèle hésite et multiplie les appels.
 * Les descriptions sont écrites POUR LUI, pas pour nous.
 */
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
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['concert', 'theatre', 'sport', 'marche', 'atelier', 'fete', 'sante_bien_etre', 'autre'] },
          description: 'Filtre facultatif. Sans lui, toutes les catégories remontent — préférable quand la demande est vague.',
        },
        commune: { type: 'string', description: 'Nom de commune, facultatif.' },
        texte:   { type: 'string', description: 'Mots du titre recherché, facultatif. À ne mettre que si la personne nomme quelque chose de précis.' },
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
      "Commerces, restaurants, artisans, services, hébergements, activités, lieux de bien-être ET producteurs du secteur — près de 1500 fiches. À utiliser pour « où manger », « je cherche un électricien », « un endroit pour dormir », « du fromage de chèvre ». Donnez le métier ou le produit tel qu'on le dit : la recherche sait retrouver « Electricité » à partir d'« électricien ».",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite', 'producteur'],
          description: "Famille de lieu. Un électricien, un plombier ou un garagiste sont des artisan_service ; un maraîcher, un fromager ou un apiculteur sont des producteur. Sans ce filtre, tout est cherché à la fois — souvent préférable.",
        },
        texte:   { type: 'string', description: "Métier ou nom cherché : « électricien », « pizzeria ». Cherche dans le nom et la description." },
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
        du:    { type: 'string', description: 'Premier jour, AAAA-MM-JJ.' },
        au:    { type: 'string', description: 'Dernier jour inclus, AAAA-MM-JJ.' },
        titre: { type: 'string', description: "Titre du film, si la personne en nomme un." },
      },
      required: ['du', 'au'],
    },
  },
  {
    name: 'chercher_promotions',
    description: "Bons plans et promotions en cours chez les commerçants partenaires.",
    input_schema: {
      type: 'object' as const,
      properties: {
        texte: { type: 'string', description: 'Mots cherchés dans le titre de la promotion, facultatif.' },
      },
      required: [],
    },
  },
  {
    name: 'chercher_annonces',
    description: "Petites annonces entre habitants : ventes, dons, trocs, services.",
    input_schema: {
      type: 'object' as const,
      properties: {
        texte:     { type: 'string', description: 'Objet cherché.' },
        type:      { type: 'string', enum: ['vente', 'troc', 'don', 'service', 'enchere_inversee'] },
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
      properties: {
        date: { type: 'string', description: 'Jour cherché, AAAA-MM-JJ.' },
      },
      required: ['date'],
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
    case 'chercher_evenements':   return evenements(args)
    case 'chercher_etablissements': return etablissements(args)
    case 'chercher_seances':      return seances(args)
    case 'chercher_promotions':   return promotions(args)
    case 'chercher_annonces':     return annonces(args)
    case 'meteo':                 return meteo(args)
    case 'aide_lpv':              return aide()
    default:
      return { pourLeModele: { erreur: `Outil inconnu : ${nom}` }, cartes: [] }
  }
}

/* ─── Événements ───────────────────────────────────────────────────────── */

async function evenements(a: Args): Promise<ResultatOutil> {
  const { du, au } = fenetre(a)
  const cats = Array.isArray(a.categories) ? (a.categories as string[]).filter(c => typeof c === 'string') : []
  const texte = texteDe(a, 'texte')

  let q = supabaseAdmin
    .from('evenements')
    .select('id, titre, description, date_debut, date_fin, heure, categorie, categories, image_url, image_position, lieu_id, prix, contact, organisateurs, statut, promotion, promo_ordre, vote_count, submitted_by, submitted_by_name, source, created_at, doublon_verifie')
    .eq('statut', 'publie')
    // Un événement sur plusieurs jours (une expo) court encore : on le retient
    // s'il chevauche la fenêtre, pas seulement s'il y commence.
    .lte('date_debut', au)
    .or(`date_fin.gte.${du},and(date_fin.is.null,date_debut.gte.${du})`)
    .order('date_debut')
    .limit(MAX)

  if (cats.length) q = q.overlaps('categories', cats)
  if (texte) q = q.ilike('titre', `%${echapper(texte)}%`)

  const { data } = await q
  const lignes = data ?? []
  if (!lignes.length) return { pourLeModele: { resultats: [] }, cartes: [] }

  // Deuxième requête plutôt qu'une jointure : les jointures implicites
  // PostgREST échouent en silence sur ce projet.
  const lieuIds = Array.from(new Set(lignes.map(e => e.lieu_id).filter(Boolean))) as string[]
  const { data: lieux } = lieuIds.length
    ? await supabaseAdmin.from('lieux').select('*').in('id', lieuIds)
    : { data: [] }
  const parLieu = new Map((lieux ?? []).map(l => [l.id, l]))

  const commune = texteDe(a, 'commune')?.toLowerCase()
  const avecLieu = lignes
    .map(e => ({ ...e, lieux: e.lieu_id ? parLieu.get(e.lieu_id) ?? null : null }))
    .filter(e => !commune || (e.lieux?.commune ?? '').toLowerCase().includes(commune))

  /**
   * Un rendez-vous daté ou quelque chose qui dure ?
   *
   * « On fait quoi ce week-end ? » ne veut pas d'une exposition ouverte
   * depuis onze mois : ces événements chevauchent TOUTES les dates et
   * noieraient les vraies sorties du samedi. Ils ne sont pas écartés — ils
   * partent dans un second panier, que le modèle ne propose que si on lui
   * parle d'expo. Le critère est la DURÉE, pas la catégorie : en base, une
   * expo est rangée dans « théâtre » ou « autre ».
   */
  const DURABLE_JOURS = 8
  const duree = (e: { date_debut: string | null; date_fin: string | null }) => {
    if (!e.date_debut || !e.date_fin || e.date_fin === e.date_debut) return 1
    return Math.round((Date.parse(e.date_fin) - Date.parse(e.date_debut)) / 86_400_000) + 1
  }
  const veutDurables = a.en_continu === true
  const dates = avecLieu.filter(e => duree(e) < DURABLE_JOURS)
  const durables = avecLieu.filter(e => duree(e) >= DURABLE_JOURS)

  const resume = (e: (typeof avecLieu)[number]) => ({
    id: e.id,
    titre: e.titre,
    date: e.date_debut,
    fin: e.date_fin !== e.date_debut ? e.date_fin : undefined,
    heure: e.heure,
    categories: e.categories ?? [e.categorie],
    lieu: e.lieux?.nom ?? null,
    commune: e.lieux?.commune ?? null,
    prix: e.prix,
    resume: e.description ? String(e.description).slice(0, 160) : null,
  })

  // Quand on demande explicitement les expositions, elles deviennent la
  // réponse principale. Sinon elles restent en second plan.
  const principaux = veutDurables ? durables : dates
  const secondaires = veutDurables ? dates : durables

  return {
    pourLeModele: {
      resultats: principaux.map(resume),
      // Nommé pour être compris sans documentation : ce qui se visite
      // n'importe quel jour de la période, pas ce qui a lieu tel soir.
      aussi_en_cours: secondaires.slice(0, 4).map(e => ({ ...resume(e), dure_jusquau: e.date_fin })),
      note: secondaires.length && !veutDurables
        ? "Les entrées de « aussi_en_cours » durent plusieurs semaines (expositions, permanences). Ne les proposez que si la personne les cherche vraiment."
        : undefined,
    },
    // Les cartes suivent le même ordre : ce qui est daté d'abord.
    cartes: [...principaux, ...secondaires].map(e => ({ type: 'ev' as const, id: e.id, data: e })),
  }
}

/* ─── Établissements ───────────────────────────────────────────────────── */

/**
 * Le mot cherché, décliné du plus précis au plus large.
 *
 * Un métier ne s'écrit jamais comme on le cherche. Les fiches disent
 * « Electricité », « Sageot Electricite », « V.elec », « PIC ELEC »,
 * « Fred'elec » ; les gens tapent « électricien ». Sur ce seul métier :
 * « electricien » trouve 2 fiches, « electr » en trouve 7, « elec » en
 * trouve 18. Le radical court est donc le SEUL qui voit tout le monde.
 *
 * On interroge avec le plus large, et on reclasse ensuite : c'est le
 * scoring qui remet la précision devant, pas la requête.
 */
function variantes(terme: string): string[] {
  const nu = terme.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const mots = nu.split(/\s+/).filter(m => m.length > 2)
  const porteur = mots.sort((x, y) => y.length - x.length)[0] ?? nu
  const out = [nu, porteur]
  for (const n of [6, 4]) if (porteur.length > n) out.push(porteur.slice(0, n))
  return Array.from(new Set(out.filter(Boolean)))
}

const sansAccent = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * À quel point cette fiche répond-elle au mot cherché ?
 *
 * La requête part large pour ne rater personne ; le classement remet
 * l'ordre. Une fiche qui porte le mot entier passe devant celle qui n'a que
 * le radical, et le nom compte plus que la description — « Sageot
 * Electricite » est un électricien, un restaurant dont la description
 * mentionne un électricien ne l'est pas.
 */
function pertinence(ligne: Record<string, unknown>, termes: string[]): number {
  const nom = sansAccent(ligne.nom)
  const desc = sansAccent(ligne.description_courte) + ' ' + sansAccent(ligne.description_longue)
  let score = 0
  termes.forEach((t, i) => {
    const poids = termes.length - i          // le terme le plus précis pèse le plus
    if (nom.includes(t)) score += poids * 3
    else if (desc.includes(t)) score += poids
  })
  return score
}

/**
 * Établissements ET producteurs.
 *
 * Passe par `assistant_etablissements` en base : c'est la seule façon de
 * désaccentuer des deux côtés, et c'est ce qui manquait — « électricien » ne
 * trouvait pas « Electricité », donc l'assistant répondait qu'il n'y avait
 * aucun électricien dans un village qui en compte dix-huit.
 *
 * Si la fonction n'existe pas encore (migration non jouée), on retombe sur
 * une requête directe : dégradée sur les accents, mais même logique.
 */
async function etablissements(a: Args): Promise<ResultatOutil> {
  const texte = texteDe(a, 'texte')
  const commune = texteDe(a, 'commune')
  const type = typeof a.type === 'string' && a.type !== 'producteur' ? a.type : null
  const veutProducteurs = a.type === 'producteur' || !type

  const termes = texte ? variantes(texte) : []
  // Le plus court englobe tous les autres : une seule requête suffit.
  const large = termes.length ? termes[termes.length - 1] : null
  const LARGE_MAX = 30

  let lignes: Record<string, unknown>[] = []
  let repli = false

  const rpc = await supabaseAdmin.rpc('assistant_etablissements', {
    terme: large, type_filtre: type, commune_filtre: commune, lim: LARGE_MAX,
  })
  if (rpc.error) repli = true
  else lignes = (rpc.data ?? []) as Record<string, unknown>[]

  if (repli) {
    let q = supabaseAdmin.from('etablissements').select('*').limit(LARGE_MAX)
    if (type) q = q.eq('type', type)
    if (commune) q = q.ilike('commune', `%${echapper(commune)}%`)
    if (large) {
      const t = `%${echapper(large)}%`
      q = q.or(`nom.ilike.${t},description_courte.ilike.${t},description_longue.ilike.${t}`)
    }
    const { data } = await q
    lignes = (data ?? []) as Record<string, unknown>[]
  }

  // Les producteurs vivent dans une autre table, mais un producteur EST un
  // commerce local : « du fromage de chèvre » doit le trouver.
  let prods: Record<string, unknown>[] = []
  if (veutProducteurs && !repli) {
    const r = await supabaseAdmin.rpc('assistant_producteurs', {
      terme: large, commune_filtre: commune, lim: 8,
    })
    if (!r.error) prods = (r.data ?? []) as Record<string, unknown>[]
  }

  const enAvant = (e: Record<string, unknown>) => e.is_featured === true || e.plan === 'pro'

  // Mises en avant d'abord — elles restent NOMMÉES dans la réponse, jamais
  // traduites en jugement. Puis la pertinence, puis la note.
  if (termes.length) {
    lignes.sort((x, y) =>
      Number(enAvant(y)) - Number(enAvant(x)) ||
      pertinence(y, termes) - pertinence(x, termes) ||
      Number(y.note_google ?? 0) - Number(x.note_google ?? 0))
    prods.sort((x, y) => pertinence(y, termes) - pertinence(x, termes))
  }

  lignes = lignes.slice(0, MAX)
  prods = prods.slice(0, 4)

  const cartes: Carte[] = [
    ...lignes.map(e => ({ type: 'etab' as const, id: String(e.id), data: e })),
    ...prods.map(p => ({ type: 'prod' as const, id: String(p.id), data: p })),
  ]

  return {
    pourLeModele: {
      resultats: [
        ...lignes.map(e => ({
          id: e.id,
          nom: e.nom,
          type: e.type,
          commune: e.commune,
          note: e.note_google,
          resume: e.description_courte ? String(e.description_courte).slice(0, 140) : null,
          mis_en_avant: enAvant(e),
        })),
        ...prods.map(p => ({
          id: p.id,
          nom: p.nom,
          type: 'producteur',
          commune: p.commune,
          resume: p.description_courte ? String(p.description_courte).slice(0, 140) : null,
          mis_en_avant: false,
        })),
      ],
    },
    cartes,
  }
}

/* ─── Cinéma ───────────────────────────────────────────────────────────── */

async function seances(a: Args): Promise<ResultatOutil> {
  const { du, au } = fenetre(a)

  const { data: rows } = await supabaseAdmin
    .from('seances')
    .select('id, etablissement_id, film_id, date, heure, version, salle')
    .gte('date', du).lte('date', au)
    .order('date').order('heure')
    .limit(120)
  const lignes = rows ?? []
  if (!lignes.length) return { pourLeModele: { resultats: [] }, cartes: [] }

  const filmIds = Array.from(new Set(lignes.map(s => s.film_id)))
  const sallesIds = Array.from(new Set(lignes.map(s => s.etablissement_id)))
  const [filmsRes, sallesRes] = await Promise.all([
    supabaseAdmin.from('films').select('id, titre, annee, duree_min, realisateur, genres, synopsis, affiche_url, avertissement').in('id', filmIds),
    supabaseAdmin.from('etablissements').select('id, nom, commune').in('id', sallesIds),
  ])
  const parSalle = new Map((sallesRes.data ?? []).map(c => [c.id, c]))

  const titre = texteDe(a, 'titre')?.toLowerCase()
  const films = (filmsRes.data ?? []).filter(f => !titre || String(f.titre).toLowerCase().includes(titre))

  // On raisonne par FILM, pas par séance : « un film pour les enfants
  // dimanche » se choisit sur le film, ses horaires viennent ensuite.
  const resultats = films.map(f => {
    const sf = lignes.filter(s => s.film_id === f.id)
    return {
      id: f.id,
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
      id: f.id,
      data: { ...f, seances: resultats.find(r => r.id === f.id)?.seances ?? [] },
    })),
  }
}

/* ─── Bons plans ───────────────────────────────────────────────────────── */

async function promotions(a: Args): Promise<ResultatOutil> {
  const texte = texteDe(a, 'texte')
  let q = supabaseAdmin
    .from('promotions')
    .select('id, etablissement_id, title, description, image_url, conditions, valid_until')
    .eq('active', true)
    .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(MAX)
  if (texte) q = q.ilike('title', `%${echapper(texte)}%`)

  const { data } = await q
  const lignes = data ?? []
  if (!lignes.length) return { pourLeModele: { resultats: [] }, cartes: [] }

  const { data: etabs } = await supabaseAdmin
    .from('etablissements').select('id, nom, commune, type, photos')
    .in('id', Array.from(new Set(lignes.map(p => p.etablissement_id))))
  const parEtab = new Map((etabs ?? []).map(e => [e.id, e]))

  const avecEtab = lignes.map(p => ({ ...p, etablissement: parEtab.get(p.etablissement_id) ?? null }))

  return {
    pourLeModele: {
      resultats: avecEtab.map(p => ({
        id: p.id,
        titre: p.title,
        chez: p.etablissement?.nom ?? null,
        commune: p.etablissement?.commune ?? null,
        jusquau: p.valid_until,
        resume: p.description ? String(p.description).slice(0, 140) : null,
      })),
    },
    cartes: avecEtab.map(p => ({ type: 'promo' as const, id: p.id, data: p })),
  }
}

/* ─── Petites annonces ─────────────────────────────────────────────────── */

async function annonces(a: Args): Promise<ResultatOutil> {
  const texte = texteDe(a, 'texte')
  let q = supabaseAdmin
    .from('annonces')
    .select('id, type, titre, description, categorie, photos, prix_actuel, prix_initial, ville, created_at, sponsored')
    .eq('statut', 'active')
    .order('created_at', { ascending: false })
    .limit(MAX)

  if (typeof a.type === 'string') q = q.eq('type', a.type)
  if (typeof a.categorie === 'string') q = q.eq('categorie', a.categorie)
  if (texte) {
    const t = `%${echapper(texte)}%`
    q = q.or(`titre.ilike.${t},description.ilike.${t}`)
  }

  const { data } = await q
  const lignes = data ?? []

  return {
    pourLeModele: {
      resultats: lignes.map(x => ({
        id: x.id,
        titre: x.titre,
        type: x.type,
        categorie: x.categorie,
        prix: x.prix_actuel ?? x.prix_initial,
        ville: x.ville,
      })),
    },
    cartes: lignes.map(x => ({ type: 'annonce' as const, id: x.id, data: x })),
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
