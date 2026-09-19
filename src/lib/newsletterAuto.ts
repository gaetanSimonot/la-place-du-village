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
 * Le principe qui guide chaque règle : **ne jamais laisser une section à
 * moitié remplie**. Une rubrique « À lire dans le Journal » sans article, ou
 * « Nos coups de cœur » avec un seul commerce, donne l'impression d'un envoi
 * bâclé — pire que l'absence de la rubrique.
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
  o: { remplace?: NewsletterBlock['type']; apres?: NewsletterBlock['type'][] } = {},
): NewsletterBlock[] {
  if (blocs.some(b => b.type === type)) return blocs

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
export async function monterLettreDeLaSemaine(base?: NewsletterBlock[] | null, terr: string | null = null): Promise<{
  subject: string
  blocks: NewsletterBlock[]
}> {
  const sem = semaineDe()
  let blocs: NewsletterBlock[] = base?.length
    ? JSON.parse(JSON.stringify(base)) as NewsletterBlock[]
    : [makeBlock('header'), makeBlock('semaine'), makeBlock('promos'), makeBlock('article'), makeBlock('partenaires')]

  // L'en-tête porte toujours la semaine en cours.
  const entete = blocs.find(b => b.type === 'header')
  if (entete && entete.type === 'header') entete.sousTitre = sem.libelle

  // Le décompte prend la place de l'ancienne sélection d'événements.
  blocs = garantir(blocs, 'semaine', { remplace: 'events', apres: ['header'] })

  // Les bons plans : tous ceux qui sont valides, et rien si la liste est vide.
  const promos = await nombreDePromos(terr)
  if (promos === 0) blocs = retirer(blocs, 'promos')
  else {
    blocs = garantir(blocs, 'promos', { apres: ['semaine', 'header'] })
    const blocPromos = blocs.find(b => b.type === 'promos')
    if (blocPromos && blocPromos.type === 'promos') {
      blocPromos.mode = 'auto'
      blocPromos.count = promos        // « on les met toutes »
      blocPromos.ids = []
    }
  }

  // L'article de la semaine, ou pas de section du tout.
  const article = await articleDeLaSemaine(terr)
  if (!article) blocs = retirer(blocs, 'article')
  else {
    blocs = garantir(blocs, 'article', { apres: ['journal', 'semaine', 'header'] })
    const blocArticle = blocs.find(b => b.type === 'article')
    if (blocArticle && blocArticle.type === 'article') blocArticle.ids = [article]
  }

  // Deux commerces mis en avant — sous deux, on ne montre rien.
  const partenaires = await partenairesDeLaSemaine(terr)
  if (partenaires.length < 2) blocs = retirer(blocs, 'partenaires')
  else {
    blocs = garantir(blocs, 'partenaires')
    const blocPart = blocs.find(b => b.type === 'partenaires')
    if (blocPart && blocPart.type === 'partenaires') blocPart.ids = partenaires
  }

  return { subject: sem.libelle, blocks: blocs }
}
