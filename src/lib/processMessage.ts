import { createClient } from '@supabase/supabase-js'
import { extractMultipleWithClaude, geocodeWithGoogle, calcStatut, nettoyerJoursSemaine, communeDepuisAdresse, ressembleAUneAdresse } from './extract'
import { datesDepuisExtraction } from './occurrences'
import { checkDoublon } from './checkDoublon'
import { trouverOuCreerLieu } from './lieuxResolve'
import { regrouperRecurrences } from './recurrences'
import { territoireDuGroupe, territoireDuPoint, indiceGeoDe, type Territoire } from './territoires'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export interface ProcessResult {
  statut: 'publie' | 'en_attente' | 'non_publiable'
  raison: string
  extraction: object[] | null
  evenements_crees: number
  premier_evenement_id: string | null
}

export async function processMessage(
  messageId: string,
  contenu: string | null,
  imageUrl: string | null,
  source: string = 'whatsapp',
  imageBase64?: string | null,
  imageMime?: string | null,
  groupe?: string | null,
  /** Deja resolu par l'appelant (l'inbox le fait). Sinon on le deduit ici. */
  territoireResolu?: Territoire | null,
): Promise<ProcessResult> {
  /*
   * LE GROUPE DECIDE DU TERRITOIRE, et tout ce qu'il apporte en herite.
   * Un groupe non declare retombe sur le territoire par defaut : brancher un
   * nouveau groupe cevenol ne demande donc aucune declaration prealable.
   * Avant la migration des territoires, `territoire` vaut null et tout se
   * comporte exactement comme avant.
   */
  const territoire = territoireResolu ?? await territoireDuGroupe(source, groupe)
  let base64 = imageBase64 || null
  const mime  = imageMime || 'image/jpeg'

  // Si retraitement sans base64 → fetch depuis URL Supabase
  if (!base64 && imageUrl) {
    try {
      const res = await fetch(imageUrl)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        base64 = buf.toString('base64')
      }
    } catch { /* continue sans image */ }
  }

  if (!contenu?.trim() && !base64) {
    return { statut: 'non_publiable', raison: 'Aucun contenu à analyser', extraction: null, evenements_crees: 0, premier_evenement_id: null }
  }

  // Extraction Claude
  let events
  try {
    events = await extractMultipleWithClaude(contenu, base64 ?? undefined, mime)
  } catch (e) {
    return {
      statut: 'non_publiable',
      raison: `Extraction échouée : ${e instanceof Error ? e.message : 'erreur Claude'}`,
      extraction: null, evenements_crees: 0, premier_evenement_id: null,
    }
  }

  if (!events.length) {
    return { statut: 'non_publiable', raison: 'Aucun événement détecté par Claude', extraction: [], evenements_crees: 0, premier_evenement_id: null }
  }

  /*
   * Les créneaux qui se répètent sont fondus AVANT tout traitement : une seule
   * fiche part au géocodage, à la dédup et en base, au lieu de trente.
   *
   * Ce filet n'existait que sur le chemin Signal, alors que WhatsApp apporte
   * l'essentiel du contenu. Une affiche de planning y produisait donc encore
   * ce qu'elle avait produit le 03/09 ailleurs : 44 événements par passage.
   * Le prompt demande bien UNE fiche pour un planning, mais un prompt est une
   * consigne — ceci n'en dépend pas.
   */
  events = regrouperRecurrences(events)

  const reasons: string[] = []
  let firstId: string | null = null
  let totalPublie = 0
  let totalAttente = 0

  for (const evt of events) {
    if (!evt.titre?.trim()) { reasons.push('Titre manquant'); continue }

    /*
     * Le territoire se decide EVENEMENT PAR EVENEMENT. Un meme message peut
     * en annoncer deux dans deux villes ; si on rangeait le message entier,
     * le second heriterait du premier — et pire, son geocodage serait oriente
     * vers la mauvaise ville. `territoire` (le groupe) reste la presomption
     * commune, `terr` le verdict propre a cet evenement.
     */
    let terr = territoire

    const check = await checkDoublon({ titre: evt.titre, date_debut: evt.date_debut, heure: evt.heure, commune: evt.commune, lieu_nom: evt.lieu_nom, description: evt.description, territoire_id: terr?.id ?? null })
    if (check.doublon) { reasons.push(`"${evt.titre}" → doublon`); continue }

    let lieuId: string | null = null
    let geo = { lat: null as number | null, lng: null as number | null, place_id_google: null as string | null, adresse: null as string | null, approx: false }

    if (evt.lieu_nom || evt.commune) {
      /*
       * L'indice geographique existe depuis longtemps dans geocodeWithGoogle,
       * mesure sur 12 communes du secteur (4 erreurs corrigees, aucune
       * degradation) — mais aucun collecteur ne s'en servait : ils restaient
       * sur le defaut « France ». « Breau » partait alors en Seine-et-Marne,
       * a 518 km, et le filtre de zone ecartait un lieu a 12 km d'ici.
       */
      geo = await geocodeWithGoogle(evt.lieu_nom, evt.commune, {
        indiceGeo: indiceGeoDe(terr),
        // L'adresse postale de l'annonce : le signal le plus precis qu'on
        // ait, et il n'etait pas transmis.
        adresse: evt.lieu_adresse,
        codePostal: evt.code_postal,
      })

      /*
       * LE GROUPE PRESUME, LA GEOGRAPHIE TRANCHE.
       *
       * Le territoire du groupe a servi a orienter le geocodage ci-dessus —
       * sans repere, « Breau » part en Seine-et-Marne. Maintenant que le
       * point est connu, c'est lui qui decide : un evenement annonce dans un
       * groupe cevenol mais qui se tient a Pau part a Pau, sans que personne
       * n'ait rien a declarer.
       *
       * Ca ne coute aucun appel de plus : le geocodage a deja eu lieu, on ne
       * fait que des soustractions sur des coordonnees.
       *
       * Hors de TOUTES les zones, on refuse — comme avant. Sans coordonnees,
       * on garde la presomption du groupe : on ne refuse pas ce qu'on n'a pas
       * pu situer.
       */
      const arbitrage = await territoireDuPoint(geo.lat, geo.lng)
      if (geo.lat != null && !arbitrage.territoire) {
        reasons.push(`"${evt.titre}" → hors zone (${arbitrage.distanceKm}km de ${arbitrage.centreLePlusProche})`)
        continue
      }
      if (arbitrage.territoire) terr = arbitrage.territoire

      if (geo.lat) {
        // Ce que le modele a lu prime ; l'adresse ne comble que le vide.
        // Un desaccord signale un point douteux, pas une commune a corriger
        // — voir communeDepuisAdresse.
        const communeReelle = evt.commune || communeDepuisAdresse(geo.adresse)
      /*
       * LE NOM DU LIEU, QUAND L'ANNONCE N'EN DONNE PAS.
       *
       * Retomber sur le nom de la commune donne une punaise « Le Vigan » au
       * milieu du village, la ou l'annonce disait « 70 route du Pont de la
       * Croix ». L'adresse est un bien meilleur intitule : elle situe, elle
       * se reconnait, et elle est ce que la personne lira sur la fiche.
       */
/*
         * STRICT POUR LE POINT, SOUPLE POUR L'INTITULE — ce n'est pas le meme risque.
         *
         * Un point faux a l'air juste : on le croit, on s'y rend, et c'est une soiree
         * perdue. On n'envoie donc a Google que ce qui ressemble vraiment a une
         * adresse postale (`ressembleAUneAdresse`).
         *
         * Un intitule, lui, n'est que du texte a lire. « Voie verte reliant Le Vigan
         * a Arre » ne se geocode pas, mais c'est infiniment mieux que « Le Vigan »
         * pour savoir ou l'on va. Des que l'annonce donne un repere et aucun nom de
         * lieu, ce repere devient l'intitule.
         */
        const intitule = evt.lieu_nom || evt.lieu_adresse?.trim() || communeReelle || ''
        // Chercher avant de créer — voir src/lib/lieuxResolve.ts.
          /*
           * QUI FAIT AUTORITE SUR QUOI.
           *
           * L'annonce fait autorite sur l'ADRESSE : c'est l'organisateur qui
           * l'ecrit, et il sait ou il habite. Google fait autorite sur le
           * POINT : c'est lui qui sait ou tombe cette rue.
           *
           * Les confondre donne des fiches ou l'adresse affichee n'est pas
           * celle de l'annonce — « 96 bis rue de la Place » devenait « 88 Rue
           * de la Place », parce que la recherche de lieux de Google rend le
           * numero le plus proche qu'elle connaisse. On garde donc le texte de
           * l'annonce des qu'il ressemble a une adresse, et l'adresse de
           * Google seulement a defaut (cas du lieu nomme : « Feliz Cafe » ne
           * porte pas d'adresse, Google en fournit une utile).
           */
        const lieu = await trouverOuCreerLieu(
          intitule,
          communeReelle,
          {
            lat: geo.lat, lng: geo.lng,
            adresse: ressembleAUneAdresse(evt.lieu_adresse) ? evt.lieu_adresse : (geo.adresse ?? evt.lieu_adresse),
            place_id_google: geo.place_id_google,
            code_postal: evt.code_postal ?? null,
            territoire_id: terr?.id ?? null,
          },
        )
        lieuId = lieu.id
      }
    }

    const statut      = calcStatut({ categorie: evt.categorie, date_debut: evt.date_debut, description: evt.description, hasGeo: !!geo.lat, commune: evt.commune, adresse: geo.adresse ?? evt.lieu_adresse })
    const finalStatut = check.publier ? statut : 'a_verifier'
    const raisonStatut = !evt.date_debut ? 'Manque date' : !geo.lat ? 'Lieu non géocodé' : !evt.description ? 'Manque description' : (check.raison ?? '')

    /*
     * Le calendrier se deroule ICI, pas dans le modele. Il a lu « tous les
     * jeudis » — c'est sa force ; compter quarante dates ne l'est pas, et lui
     * faire enumerer un calendrier couterait des jetons a chaque affiche pour
     * finir par sauter un jeudi. Les bornes suivent la liste obtenue.
     */
    const occ = datesDepuisExtraction({
      date_debut: evt.date_debut, date_fin: evt.date_fin,
      jours_semaine: nettoyerJoursSemaine(evt.jours_semaine), dates: evt.dates,
    })

    const { data: evenement } = await supabaseAdmin.from('evenements').insert({
      titre: evt.titre, description: evt.description,
      date_debut: occ.date_debut, date_fin: occ.date_fin, heure: evt.heure || null,
      categorie: evt.categorie ?? 'autre', categories: [evt.categorie ?? 'autre'], statut: finalStatut,
      jours_semaine: nettoyerJoursSemaine(evt.jours_semaine),
      dates: occ.dates,
      lieu_id: lieuId, prix: evt.prix || null, contact: evt.contact || null,
      organisateurs: evt.organisateurs || null, image_url: imageUrl, source,
      message_entrant_id: messageId, raison_statut: raisonStatut || null,
      ...(terr ? { territoire_id: terr.id } : {}),
    }).select('id').single()

    if (evenement) {
      if (!firstId) firstId = evenement.id
      if (finalStatut === 'publie') totalPublie++
      else totalAttente++
    }
  }

  const total = totalPublie + totalAttente
  if (total === 0) return { statut: 'non_publiable', raison: reasons.join(' · ') || 'Aucun événement inséré', extraction: events, evenements_crees: 0, premier_evenement_id: null }

  return {
    statut: totalPublie > 0 ? 'publie' : 'en_attente',
    raison: '',
    extraction: events,
    evenements_crees: total,
    premier_evenement_id: firstId,
  }
}
