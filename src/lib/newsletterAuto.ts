import { supabaseAdmin } from '@/lib/supabase-admin'
import { makeBlock, type NewsletterBlock } from '@/lib/newsletterBlocks'
import { semaineDe } from '@/lib/semaine'

/**
 * LA LETTRE DE LA SEMAINE, MONTÉE TOUTE SEULE.
 *
 * Ouvrir l'éditeur un lundi ne doit rien demander : le titre, le sous-titre,
 * l'article, les bons plans et les deux commerces mis en avant sont déjà là,
 * à jour. On peut retoucher, mais on n'a rien à faire.
 *
 * DEUX PRINCIPES, et le second a longtemps manqué.
 *
 * 1. **Ne jamais laisser une section à moitié remplie.** Une rubrique
 *    « À lire dans le Journal » sans article, ou « Nos coups de cœur » avec
 *    un seul commerce, donne l'impression d'un envoi bâclé — pire que
 *    l'absence de la rubrique.
 *
 * 2. **Ce que l'admin a décidé ne se recalcule pas.** Un bloc en
 *    `mode: 'manual'` est à lui, le montage n'y touche plus ; une section
 *    qu'il a retirée ne revient pas ; une lettre figée ne bouge plus du tout.
 *
 *    Ce principe manquait, et le dégât dépassait l'écran : le montage
 *    écrasait le choix à chaque ouverture de l'éditeur, qui réenregistrait
 *    aussitôt ce qu'il affichait. Le choix était donc détruit EN BASE, et le
 *    lundi la lettre partait avec la version calculée.
 */

/** Ce qu'on ne veut pas voir apparaître : une section vide. */
function retirer(blocs: NewsletterBlock[], type: NewsletterBlock['type']): NewsletterBlock[] {
  return blocs.filter(b => b.type !== type)
}

/**
 * Garantit qu'un bloc existe, sans défaire la mise en page déjà réglée.
 *
 * Un brouillon enregistré avant l'arrivée d'un type de bloc ne le contient
 * évidemment pas — et se contenter de modifier les blocs présents ne le fera
 * jamais apparaître. C'est ce qui manquait : la lettre se montait sans le bloc
 * chiffres parce que le brouillon ne l'avait pas.
 *
 * `remplace` sert à la substitution : le bloc chiffres prend la PLACE de
 * l'ancienne sélection d'événements, il ne s'ajoute pas à côté d'elle — sinon
 * on annonce deux fois les mêmes événements, une fois comptés, une fois
 * choisis.
 */
function garantir(
  blocs: NewsletterBlock[],
  type: NewsletterBlock['type'],
  o: { remplace?: NewsletterBlock['type']; apres?: NewsletterBlock['type'][]; retires?: string[] } = {},
): NewsletterBlock[] {
  if (blocs.some(b => b.type === type)) return blocs
  // Une section retirée à la main ne se réinvite pas. Sans ça, supprimer
  // « À lire dans le Journal » ne tenait pas : elle repoussait à l'ouverture
  // suivante, et la mise en page changeait sous les doigts.
  if (o.retires?.includes(type)) return blocs

  const neuf = makeBlock(type)

  if (o.remplace) {
    const i = blocs.findIndex(b => b.type === o.remplace)
    if (i >= 0) return [...blocs.slice(0, i), neuf, ...blocs.slice(i + 1)]
  }

  // Sinon : juste après le dernier des blocs cités, ou à la fin.
  let pos = -1
  for (const t of o.apres ?? []) {
    const i = blocs.map(b => b.type).lastIndexOf(t)
    if (i > pos) pos = i
  }
  return pos >= 0 ? [...blocs.slice(0, pos + 1), neuf, ...blocs.slice(pos + 1)] : [...blocs, neuf]
}

/**
 * L'article du journal de la semaine.
 *
 * On part du NUMÉRO, pas d'une fenêtre de dates : `journaux_hebdo` porte
 * `semaine_du`/`semaine_au`, et les articles s'y rattachent par `journal_id`.
 * C'est la même semaine que celle du sous-titre, sans risque de décalage d'un
 * jour.
 *
 * Peu importe qui l'a écrit — un habitant ou l'admin. Ce qui compte, c'est
 * qu'un article ait été écrit cette semaine ; s'il n'y en a pas, la section
 * n'apparaît pas. S'il y en a plusieurs, on garde le plus récent : un seul,
 * pour ne pas avoir à arbitrer.
 *
 * Repli sur la date de création si le numéro de la semaine n'existe pas encore
 * — le journal est généré le lundi matin, mais rien ne garantit qu'il soit là.
 */
export async function articleDeLaSemaine(terr: string | null = null): Promise<string | null> {
  const sem = semaineDe()

  let qNum = supabaseAdmin
    .from('journaux_hebdo').select('id').eq('semaine_du', sem.debut)
  if (terr) qNum = qNum.eq('territoire_id', terr)
  const { data: numero } = await qNum.maybeSingle()

  let req = supabaseAdmin
    .from('articles_journal').select('id')
    .eq('statut', 'publie')
  if (terr) req = req.eq('territoire_id', terr)
  req = req
    .order('created_at', { ascending: false })
    .limit(1)

  const { data } = numero?.id
    ? await req.eq('journal_id', numero.id)
    : await req.gte('created_at', `${sem.debut}T00:00:00`)

  return (data?.[0]?.id as string | undefined) ?? null
}

/** Deux commerces à mettre en avant — les payants d'abord. */
export async function partenairesDeLaSemaine(terr: string | null = null): Promise<string[]> {
  let q = supabaseAdmin
    .from('etablissements')
    .select('id, plan, is_featured, photos, nom')
    .or('plan.eq.pro,is_featured.eq.true')
  if (terr) q = q.eq('territoire_id', terr)
  const { data } = await q.limit(60)

  const candidats = (data ?? [])
    // Une vignette sans photo est un trou dans la lettre : on ne la propose pas.
    .filter(e => Array.isArray(e.photos) && e.photos.length > 0)
    // Un abonné payant passe devant un simple coup de cœur : c'est ce qu'il paie.
    .sort((a, b) => Number(b.plan === 'pro') - Number(a.plan === 'pro'))

  return candidats.slice(0, 2).map(e => `etab:${e.id}`)
}

/** Y a-t-il des bons plans en cours ? Sinon la section n'a rien à montrer. */
export async function nombreDePromos(terr: string | null = null): Promise<number> {
  let q = supabaseAdmin
    .from('promotions').select('id', { count: 'exact', head: true })
    .eq('active', true)
  if (terr) q = q.eq('territoire_id', terr)
  const { count } = await q.or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
  return count ?? 0
}

/**
 * Monte la lettre de la semaine.
 *
 * `base` permet de repartir des blocs déjà réglés (le brouillon enregistré) :
 * on ne remplace alors que ce qui dépend de la semaine, et les retouches
 * faites à la main — un texte d'intro, un bouton ajouté — sont conservées.
 */
export interface ReglagesLettre {
  /** Les types de sections que l'admin a retirés : on ne les remet pas. */
  retires?: string[]
  /**
   * Lettre FIGÉE : plus rien n'est recalculé. Ce qui est composé est ce qui
   * partira. C'est la réponse à « je veux que mes retouches tiennent jusqu'à
   * l'envoi » — un interrupteur, pas une espérance.
   */
  fige?: boolean
}

export async function monterLettreDeLaSemaine(
  base?: NewsletterBlock[] | null,
  terr: string | null = null,
  reglages: ReglagesLettre = {},
): Promise<{ subject: string; blocks: NewsletterBlock[] }> {
  const sem = semaineDe()

  // Lettre figée : on rend le brouillon tel quel, sans y toucher.
  if (reglages.fige && base?.length) {
    return { subject: sem.libelle, blocks: JSON.parse(JSON.stringify(base)) as NewsletterBlock[] }
  }
  const retires = reglages.retires ?? []
  let blocs: NewsletterBlock[] = base?.length
    ? JSON.parse(JSON.stringify(base)) as NewsletterBlock[]
    : [makeBlock('header'), makeBlock('semaine'), makeBlock('promos'), makeBlock('article'), makeBlock('partenaires')]

  // L'en-tête porte toujours la semaine en cours.
  const entete = blocs.find(b => b.type === 'header')
  if (entete && entete.type === 'header') entete.sousTitre = sem.libelle

  // Le décompte prend la place de l'ancienne sélection d'événements.
  blocs = garantir(blocs, 'semaine', { remplace: 'events', apres: ['header'], retires })

  // Les bons plans : tous ceux qui sont valides, et rien si la liste est vide.
  const promos = await nombreDePromos(terr)
  if (promos === 0) blocs = retirer(blocs, 'promos')
  else {
    blocs = garantir(blocs, 'promos', { apres: ['semaine', 'header'], retires })
    const blocPromos = blocs.find(b => b.type === 'promos')
    // « Choisir » l'emporte : le bouton de l'éditeur ne servait à rien tant
    // qu'on forçait le mode automatique à chaque montage.
    if (blocPromos && blocPromos.type === 'promos' && blocPromos.mode !== 'manual') {
      blocPromos.count = promos        // « on les met toutes »
      blocPromos.ids = []
    }
  }

  // L'article de la semaine, ou pas de section du tout.
  const articleChoisi = blocs.some(b => b.type === 'article' && b.mode === 'manual' && b.ids.length > 0)
  const article = await articleDeLaSemaine(terr)
  // Un article choisi à la main reste, même si la semaine n'en a pas produit :
  // c'est précisément le cas où l'on va chercher un texte plus ancien.
  if (!articleChoisi) {
    if (!article) blocs = retirer(blocs, 'article')
    else {
      blocs = garantir(blocs, 'article', { apres: ['journal', 'semaine', 'header'], retires })
      const blocArticle = blocs.find(b => b.type === 'article')
      if (blocArticle && blocArticle.type === 'article') blocArticle.ids = [article]
    }
  }

  // Deux commerces mis en avant — sous deux, on ne montre rien.
  const partChoisis = blocs.some(b => b.type === 'partenaires' && b.mode === 'manual' && b.ids.length > 0)
  const partenaires = await partenairesDeLaSemaine(terr)
  // Sous deux commerces on ne montre rien — sauf si l'admin en a désigné :
  // son choix passe avant la règle du calcul.
  if (!partChoisis) {
    if (partenaires.length < 2) blocs = retirer(blocs, 'partenaires')
    else {
      blocs = garantir(blocs, 'partenaires', { retires })
      const blocPart = blocs.find(b => b.type === 'partenaires')
      if (blocPart && blocPart.type === 'partenaires') blocPart.ids = partenaires
    }
  }

  return { subject: sem.libelle, blocks: blocs }
}
