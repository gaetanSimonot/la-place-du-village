import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { geocodeWithGoogle } from './extract'
import { trouverOuCreerLieu } from './lieuxResolve'
import { checkDoublon } from './checkDoublon'
import { territoireParId, territoireDuPoint, indiceGeoDe } from './territoires'
import {
  evenementsStructures, categorieDepuisFiche, RUBRIQUES_FOURRE_TOUT,
  dateEtHeure, tarif, imageDe, adresseDe, lirePage, UA,
  type EventStructure,
} from './schemaOrg'
import { rangerLeFourreTout, reformulerDescriptions, aBesoinDeReprise } from './scraper-retouches'
import { collecterParFiches } from './scraper-fiches'

/**
 * SCRAPE DE SOURCES QUI PUBLIENT LEURS DONNÉES STRUCTURÉES.
 *
 * Beaucoup d'agendas (alentoor, offices de tourisme, Open Agenda…) déposent
 * dans leurs pages un bloc `application/ld+json` au format schema.org/Event :
 * le titre, la description entière, la date AVEC l'heure, l'adresse postale
 * découpée, le tarif et l'image. C'est ce que le site dit de lui-même.
 *
 * POURQUOI CE CHEMIN EXISTE, alors qu'un autre lit déjà ces pages.
 *
 * L'autre chemin aplatit la page en texte (Jina Reader) et demande à un
 * modèle de retrouver les événements dedans. Ça marche, mais :
 *   — le texte n'a plus d'images, donc les fiches naissaient nues ;
 *   — l'heure et le tarif se perdent dans la mise en page ;
 *   — chaque passage coûte un appel de modèle sur 40 000 caractères ;
 *   — et une lecture reste une lecture : elle peut se tromper.
 *
 * Ici, rien n'est interprété et RIEN N'EST INVENTÉ : chaque champ vient d'un
 * champ. Ce qui manque à la source manque chez nous, et se voit. Le coût en
 * modèle tombe à zéro ; seuls restent les géocodages, eux-mêmes réduits parce
 * que les lieux se réutilisent.
 *
 * Le chemin par modèle reste le repli pour toutes les pages qui ne publient
 * rien de structuré — voir scraper.ts.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** Le bucket des visuels d'événements, déjà utilisé par la réception. */
const BUCKET = 'event-images'

/**
 * Nombre de pages de liste parcourues au maximum.
 *
 * Les agendas paginent par date croissante : au-delà, on s'éloigne dans le
 * temps pour un intérêt qui décroît, et chaque page coûte autant de visites
 * de fiches. Quatre pages ≈ 120 événements, largement de quoi couvrir
 * l'horizon habituel.
 */
const PAGES_MAX = 4

/** Horizon par défaut, aligné sur celui des sources récurrentes. */
const HORIZON_DEFAUT = 42

/**
 * Temps que l'on s'autorise, en millisecondes.
 *
 * La route qui appelle ce code est coupée à 300 s par l'hébergeur. Une
 * coupure en plein vol n'est pas neutre : le travail est fait et payé, mais
 * l'appelant ne reçoit rien et ne sait pas où ça s'est arrêté. On s'arrête
 * donc NOUS-MÊMES, proprement, en le disant — et comme rien n'est refait deux
 * fois d'un passage à l'autre, le suivant reprend la suite.
 */
const BUDGET_MS = 230_000

/**
 * Fiches téléchargées de front.
 *
 * Elles ne dépendent pas les unes des autres, et l'attente réseau dominait
 * tout le reste : les lire une par une prenait près de trois minutes pour
 * cent vingt fiches. Cinq de front reste courtois pour le site d'en face.
 */
const LOT = 5

export interface ScrapeStructureResult {
  mode:       'structure'
  sourceId:   string
  sourceName: string
  dryRun:     boolean
  erreur?:    string
  trouves:    number
  doublons:   number
  inseres:    number
  /** Ce que la source a livré, champ par champ — c'est le vrai rapport. */
  qualite: {
    /** Fiches réellement visitées — le dénominateur des lignes suivantes. */
    detaillees:       number
    avec_image:       number
    avec_heure:       number
    avec_description: number
    avec_adresse:     number
    avec_lieu:        number
  }
  /** Vrai si l'on s'est arrêté au temps imparti : il reste à faire. */
  interrompu: boolean
  reglages: { horizon_jours: number; publier_auto: boolean; pages_lues: number }
  /** Nombre d'adresses distinctes envoyées à Google — la seule dépense. */
  geocodages: number
  /** Événements rangés au titre, faute de rubrique utilisable à la source. */
  ranges: number
  /** Descriptions remises au format de la maison (trop longues, ou coupées). */
  reformulees: number
  /** Fiches visitées une par une, faute de données sur la page de liste. */
  parFiches: number
  /** Images récupérées grâce à Open Graph, que l'ancien repli perdait. */
  parOpenGraph: number
  evenements: { titre: string; statut: string; doublon: boolean; image: boolean; raison?: string }[]
}

// ── L'image, rapatriée chez nous ─────────────────────────────────────────────

/**
 * Descend l'image et la dépose dans notre stockage.
 *
 * On ne garde PAS le lien du site source. Une adresse distante disparaît le
 * jour où la fiche est retirée ou le site refondu, et nos événements se
 * retrouveraient avec des cadres vides sans que personne s'en aperçoive —
 * c'est exactement ce qui est arrivé avec des photos hébergées ailleurs.
 *
 * Le nom du fichier est l'empreinte de l'adresse d'origine : la même image
 * rencontrée à dix passages n'occupe qu'un fichier, et un second passage ne
 * retélécharge rien.
 */
async function rapatrierImage(url: string): Promise<string | null> {
  const empreinte = createHash('sha256').update(url).digest('hex').slice(0, 32)
  const extension = (url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase()
  const chemin = `scrape/${empreinte}.${extension === 'jpeg' ? 'jpg' : extension}`
  const publique = supabaseAdmin.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl

  // Déjà là ? Rien à faire — et surtout rien à retélécharger.
  const { data: liste } = await supabaseAdmin.storage
    .from(BUCKET).list('scrape', { search: `${empreinte}.` })
  if (liste && liste.length) return publique

  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow' })
    if (!r.ok) return null
    const type = r.headers.get('content-type') || 'image/jpeg'
    if (!/^image\//i.test(type)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    // Une vignette de 2 ko n'est pas une illustration ; 10 Mo n'est pas
    // raisonnable pour une fiche.
    if (buf.length < 4096 || buf.length > 10 * 1024 * 1024) return null
    const { error } = await supabaseAdmin.storage
      .from(BUCKET).upload(chemin, buf, { contentType: type, upsert: false })
    if (error && !/exist|duplicate|resource already/i.test(error.message)) return null
    return publique
  } catch {
    return null
  }
}

// ── Le pipeline ──────────────────────────────────────────────────────────────

interface SourceRow {
  id: string
  nom: string
  url: string
  territoire_id: string | null
  horizon_jours: number | null
  publier_auto: boolean | null
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function scrapeStructure(
  source: SourceRow,
  opts: { dryRun?: boolean } = {},
): Promise<ScrapeStructureResult> {
  const dryRun = opts.dryRun === true
  const horizon = source.horizon_jours ?? HORIZON_DEFAUT
  const publierAuto = source.publier_auto === true
  const terrSource = await territoireParId(source.territoire_id)

  const base = source.url.startsWith('http') ? source.url : 'https://' + source.url
  const resultat: ScrapeStructureResult = {
    mode: 'structure', sourceId: source.id, sourceName: source.nom, dryRun,
    trouves: 0, doublons: 0, inseres: 0,
    qualite: { detaillees: 0, avec_image: 0, avec_heure: 0, avec_description: 0, avec_adresse: 0, avec_lieu: 0 },
    interrompu: false,
    reglages: { horizon_jours: horizon, publier_auto: publierAuto, pages_lues: 0 },
    geocodages: 0,
    ranges: 0,
    reformulees: 0,
    parFiches: 0,
    parOpenGraph: 0,
    evenements: [],
  }

  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0)
  const limite = new Date(aujourdhui.getTime() + horizon * 86_400_000)

  // 1. Les fiches annoncées par les pages de liste, sans doublon d'adresse.
  // Un objet simple plutôt qu'une Map, pour la même raison que ci-dessus.
  const fiches: Record<string, EventStructure> = {}
  for (let p = 1; p <= PAGES_MAX; p++) {
    const url = p === 1 ? base : base + (base.includes('?') ? '&' : '?') + 'p=' + p
    const html = await lirePage(url)
    if (!html) break
    const lot = evenementsStructures(html)
    if (!lot.length) break
    resultat.reglages.pages_lues = p
    const avant = Object.keys(fiches).length
    for (const e of lot) if (e.url) fiches[e.url] = e
    // Une page qui n'apporte plus rien signale la fin de la pagination :
    // beaucoup de sites resservent la dernière page indéfiniment.
    if (Object.keys(fiches).length === avant) break
    await pause(300)
  }
  /*
   * LA PAGE NE PUBLIE RIEN ? ON VA VOIR LES FICHES.
   *
   * Deuxième marche de l'escalier. Beaucoup de sites ne mettent aucune donnée
   * sur leur page de liste mais en posent sur chaque fiche — et quasiment
   * tous portent des balises Open Graph, qui donnent au moins le titre, le
   * résumé et L'IMAGE. On suit donc les liens plutôt que d'aplatir la page,
   * ce qui effaçait les images.
   */
  if (!Object.keys(fiches).length) {
    const parFiches = await collecterParFiches(base, 120_000)
    for (const u of Object.keys(parFiches.fiches)) fiches[u] = parFiches.fiches[u]
    resultat.parFiches = parFiches.visitees
    resultat.parOpenGraph = parFiches.parOpenGraph
  }

  resultat.trouves = Object.keys(fiches).length
  if (!resultat.trouves) {
    resultat.erreur = 'Aucun événement trouvé : ni données structurées, ni fiches lisibles'
    return resultat
  }

  // 2. Ce que nous avons déjà de cette source : on ne revisite pas une fiche
  //    dont l'événement est en base, et on ne repaie pas son géocodage.
  const { data: connus } = await supabaseAdmin
    .from('evenements')
    .select('titre, date_debut')
    .eq('scrape_source_id', source.id)
    .gte('date_debut', aujourdhui.toISOString().slice(0, 10))
  const empreinteEvt = (t: string, d: string | null) => t.trim().toLowerCase() + '|' + (d ?? '')
  const dejaEnBase = new Set((connus ?? []).map(e => empreinteEvt(e.titre, e.date_debut)))

  /*
   * 3. QUI MÉRITE UNE VISITE.
   *
   * On écarte d'abord ce qui sort de l'horizon et ce qu'on a déjà : inutile
   * d'aller chercher une fiche dont l'événement est en base. Ce tri fait, on
   * ne télécharge plus que le nécessaire.
   */
  const aVisiter: string[] = []
  for (const url of Object.keys(fiches)) {
    const apercu = fiches[url]
    const grossier = dateEtHeure(apercu.startDate)
    if (grossier.date) {
      const d = new Date(grossier.date)
      if (d < aujourdhui || d > limite) continue
    }
    if (dejaEnBase.has(empreinteEvt(apercu.name ?? '', grossier.date))) {
      resultat.doublons++
      resultat.evenements.push({ titre: apercu.name ?? '?', statut: 'deja_connu', doublon: true, image: false })
      continue
    }
    aVisiter.push(url)
  }

  /*
   * Un même endroit n'est demandé à Google QU'UNE FOIS par passage.
   *
   * Les agendas répètent les lieux : dix-sept fiches des Journées du
   * Patrimoine partagent « Rue du Château, Pau ». La réutilisation des lieux
   * se fait APRÈS le géocodage — elle évite les punaises en double, pas la
   * facture. Ce cache-ci évite la facture.
   */
  const geocodes: Record<string, Awaited<ReturnType<typeof geocodeWithGoogle>>> = {}

  // Les fiches se lisent par lots — en parallèle, car c'est de l'attente
  // réseau — puis se traitent une à une, car chaque écriture doit voir les
  // lieux créés par la précédente pour les réutiliser.
  // Ceux que la source n'a pas su ranger : on les reprendra en un seul appel.
  const aRanger: { id: string; titre: string; description: string | null }[] = []
  // Et celles dont le texte ne ressemble pas à ce que l'app écrit ailleurs.
  const aReformuler: { id: string; titre: string; description: string }[] = []
  const fini = Date.now() + BUDGET_MS
  for (let debut = 0; debut < aVisiter.length; debut += LOT) {
    if (Date.now() > fini) { resultat.interrompu = true; break }
    const lotUrls = aVisiter.slice(debut, debut + LOT)
    const pages = await Promise.all(lotUrls.map(u => lirePage(u)))
    await pause(150)

    for (let k = 0; k < lotUrls.length; k++) {
    const url = lotUrls[k]
    const apercu = fiches[url]
    const html = pages[k]
    const detail = html ? (evenementsStructures(html)[0] ?? apercu) : apercu
    const e: EventStructure = { ...apercu, ...detail }
    const lecture = html ? categorieDepuisFiche(html, base) : { categorie: 'autre' as const, rubrique: null }
    const categorie = lecture.categorie
    const fourreTout = !lecture.rubrique || RUBRIQUES_FOURRE_TOUT.indexOf(lecture.rubrique) >= 0
    resultat.qualite.detaillees++

    const { date, heure } = dateEtHeure(e.startDate)
    const fin = dateEtHeure(e.endDate).date
    const adr = adresseDe(e.location)
    const commune = adr.addressLocality?.trim() || null
    const rue = adr.streetAddress?.trim() || null
    const nomLieu = e.location?.name?.trim() || rue || commune
    const description = (e.description ?? '').trim() || null
    const imageSource = imageDe(e)

    if (imageSource) resultat.qualite.avec_image++
    if (heure) resultat.qualite.avec_heure++
    if (description && description.length >= 10) resultat.qualite.avec_description++
    if (rue) resultat.qualite.avec_adresse++

    // 4. Doublon avec ce que nous avons déjà, toutes sources confondues.
    let terrEvt = terrSource
    const check = await checkDoublon({
      titre: e.name ?? '', date_debut: date,
      // L'heure distingue deux séances du même spectacle le même jour. Sans
      // elle, la seconde passe pour une copie de la première — et, quand elle
      // est là, le contrôle tranche sans appeler le modèle.
      heure,
      commune, lieu_nom: nomLieu, description, territoire_id: terrEvt?.id ?? null,
    })
    if (check.doublon) {
      resultat.doublons++
      resultat.evenements.push({ titre: e.name ?? '?', statut: 'doublon', doublon: true, image: false })
      continue
    }

    // 5. Le lieu. L'adresse postale part au géocodage — c'est le signal le
    //    plus précis que la source nous donne — et le lieu se RÉUTILISE :
    //    trois visites au même château ne font plus trois punaises.
    let lieuId: string | null = null
    if (nomLieu || commune) {
      const cleGeo = [e.location?.name ?? '', rue ?? '', commune ?? '', adr.postalCode ?? '']
        .join('|').toLowerCase()
      let geo = geocodes[cleGeo]
      if (!geo) {
        geo = await geocodeWithGoogle(e.location?.name ?? null, commune, {
          indiceGeo: indiceGeoDe(terrSource),
          adresse: rue,
          codePostal: adr.postalCode ?? null,
        })
        geocodes[cleGeo] = geo
      }
      if (geo.lat != null && geo.lng != null) {
        const arbitrage = await territoireDuPoint(geo.lat, geo.lng)
        if (!arbitrage.territoire) {
          resultat.evenements.push({ titre: e.name ?? '?', statut: 'hors_zone', doublon: false, image: false })
          continue
        }
        terrEvt = arbitrage.territoire
      }
      /*
       * L'APERÇU NE CRÉE PAS DE LIEU. Il géocode — c'est son travail, montrer
       * ce que l'on obtiendrait — mais il n'écrit pas. La première version le
       * faisait, et trois aperçus successifs ont déposé des fiches de lieu que
       * plus aucun événement ne référençait : un mode « rien n'est écrit » qui
       * écrit quand même est pire que pas d'aperçu du tout.
       */
      if (dryRun) {
        if (geo.lat != null) resultat.qualite.avec_lieu++
      } else {
        const lieu = await trouverOuCreerLieu(nomLieu ?? commune ?? '', commune, {
          lat: geo.lat, lng: geo.lng,
          adresse: rue ?? geo.adresse ?? null,
          place_id_google: geo.place_id_google,
          code_postal: adr.postalCode ?? null,
          territoire_id: terrEvt?.id ?? null,
        })
        lieuId = lieu.id
        if (lieuId) resultat.qualite.avec_lieu++
      }
    }

    /*
     * 6. Le statut, et la RAISON.
     *
     * Une fiche complète — date, lieu situé, description, image — n'a plus
     * rien à vérifier : si la source est marquée « publier automatiquement »,
     * elle part. Sinon elle attend, et elle DIT ce qui lui manque : sans
     * cela, l'admin affichait des dizaines d'événements en attente sans
     * qu'aucun n'explique pourquoi.
     */
    const manques: string[] = []
    if (!date) manques.push('date')
    if (!lieuId) manques.push('lieu')
    if (!description || description.length < 10) manques.push('description')
    if (!imageSource) manques.push('image')

    const complet = manques.length === 0
    const statut = !check.publier ? 'a_verifier'
      : (complet && publierAuto) ? 'publie'
      : 'en_attente'
    const raison = !check.publier ? (check.raison ?? 'À vérifier')
      : manques.length ? 'Manque : ' + manques.join(', ')
      : (publierAuto ? '' : 'Source non auto-publiée')

    resultat.evenements.push({
      titre: e.name ?? '?', statut, doublon: false, image: !!imageSource,
      raison: raison || undefined,
    })
    if (dryRun) continue

    // 7. L'image chez nous, puis l'écriture.
    const imageUrl = imageSource ? await rapatrierImage(imageSource) : null

    const { data: cree, error } = await supabaseAdmin.from('evenements').insert({
      titre: e.name, description,
      date_debut: date, date_fin: fin && fin !== date ? fin : null, heure,
      categorie, categories: [categorie],
      statut, lieu_id: lieuId,
      prix: tarif(e), contact: null, organisateurs: null,
      image_url: imageUrl,
      source: 'scrape', scrape_source_id: source.id,
      raison_statut: raison || null,
      ...(terrEvt ? { territoire_id: terrEvt.id } : {}),
    }).select('id').single()
    if (!error) {
      resultat.inseres++
      dejaEnBase.add(empreinteEvt(e.name ?? '', date))
      if (fourreTout && cree?.id) aRanger.push({ id: cree.id, titre: e.name ?? '', description })
      if (cree?.id && description && aBesoinDeReprise(description)) {
        aReformuler.push({ id: cree.id, titre: e.name ?? '', description })
      }
    }
    }
  }

  /*
   * Le rattrapage, une fois tout écrit. Il vient APRÈS exprès : les événements
   * sont déjà en base, correctement en « autre ». Si l'appel échoue, il ne
   * manque qu'un rangement — pas un événement.
   */
  if (!dryRun && aRanger.length) {
    const rangement = await rangerLeFourreTout(aRanger)
    const ids = Object.keys(rangement)
    for (const id of ids) {
      const cat = rangement[id]
      const { error } = await supabaseAdmin.from('evenements')
        .update({ categorie: cat, categories: [cat] }).eq('id', id)
      // 23514 = la contrainte CHECK refuse cette catégorie : la migration
      // qui l'ajoute n'a pas encore été jouée. L'événement reste en
      // « autre », ce qui est faux mais valide — et se rattrape au prochain
      // passage une fois la migration passée.
      if (error && error.code !== '23514') break
    }
    resultat.ranges = ids.length
  }

  /*
   * Les descriptions, mises au format de la maison.
   *
   * APRÈS l'écriture, comme le rangement : l'événement est déjà en base avec
   * le texte de la source, qui est vrai. Si la reprise échoue, il ne manque
   * qu'une mise en forme — pas un événement.
   */
  if (!dryRun && aReformuler.length) {
    const reecrites = await reformulerDescriptions(aReformuler)
    const ids = Object.keys(reecrites)
    for (const id of ids) {
      await supabaseAdmin.from('evenements')
        .update({ description: reecrites[id] }).eq('id', id)
    }
    resultat.reformulees = ids.length
  }

  resultat.geocodages = Object.keys(geocodes).length

  if (!dryRun) {
    await supabaseAdmin.from('sources')
      .update({ dernier_scrape: new Date().toISOString() }).eq('id', source.id)
    await supabaseAdmin.from('scrape_logs').insert({
      source_id: source.id,
      trouves: resultat.trouves, doublons: resultat.doublons, inseres: resultat.inseres,
      erreur: null,
    })
  }
  return resultat
}
