import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { extractWithClaude } from '@/lib/extract'

/**
 * POST /api/radio/admin/mention-fiche — préparer la fiche d'un rendez-vous
 * annoncé à l'antenne. { mention_id } → { event } (rien n'est écrit en base :
 * la fiche s'ouvre pré-remplie, l'admin relit et enregistre).
 *
 * La mention ne porte qu'un titre et une ligne de résumé (« samedi 26
 * septembre à 17h, cour des casernes… ») : de quoi reconnaître un événement,
 * pas de quoi en faire une fiche. Le bouton « Créer la fiche » n'en tirait
 * qu'une date et une heure ; ni lieu, ni adresse, ni catégorie, et une
 * description réduite à cette ligne. Or TOUT ce que l'animateur en a dit est
 * dans la transcription gardée en base.
 *
 * On la relit donc entière avec l'extracteur des collecteurs (même prompt,
 * même forme de sortie que /api/extract/preview), en lui demandant ce seul
 * rendez-vous et tout ce qui s'en dit. La fiche passe ensuite par le même
 * enregistrement que « Ajouter » : géocodage compris.
 */
export const maxDuration = 60
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const mentionId = String(body?.mention_id ?? '')
  if (!mentionId) return NextResponse.json({ error: 'mention_id manquant' }, { status: 400 })

  const { data: mention } = await supabaseAdmin
    .from('radio_mentions').select('id, titre, detail, emission_id').eq('id', mentionId).maybeSingle()
  if (!mention) return NextResponse.json({ error: 'Mention introuvable' }, { status: 404 })

  const { data: emission } = await supabaseAdmin
    .from('radio_emissions').select('radio, titre, semaine_debut, transcription').eq('id', mention.emission_id).maybeSingle()
  const transcription = (emission?.transcription as string | null) ?? ''
  if (!transcription) {
    return NextResponse.json({ error: 'Cette émission n’a pas de transcription' }, { status: 409 })
  }

  const texte = [
    `Ceci est la transcription d'une émission de radio locale${emission?.radio ? ` (${emission.radio})` : ''},`,
    `rangée sur la semaine du ${emission?.semaine_debut}. L'animateur y annonce plusieurs rendez-vous ;`,
    `les jours qu'il cite (« samedi 26 septembre ») se rapportent à cette période.`,
    '',
    `Extrais UNIQUEMENT ce rendez-vous : « ${mention.titre} »${mention.detail ? ` (${mention.detail})` : ''}.`,
    `Rapporte dans la description tout ce qui en est dit à l'antenne — contenu, intervenants, programme,`,
    `public visé, tarif, organisateurs, contact — reformulé en phrases propres, sans inventer.`,
    `DATES : ne mets une date que si elle est DITE pour ce rendez-vous (« samedi 26 septembre »,`,
    `« jusqu'au 14 novembre »). « Du jeudi au samedi », « ce week-end » sans date : laisse date_debut et`,
    `date_fin à null — l'admin complétera. Une date déduite est une date fausse que personne ne relira.`,
    `La transcription est automatique : corrige les noms de lieux et de communes manifestement écorchés`,
    `(ex. « Saint-Hypo » = Saint-Hippolyte-du-Fort) quand il n'y a aucun doute, sinon laisse-les tels quels.`,
    '',
    '--- TRANSCRIPTION ---',
    transcription.slice(0, 60_000),
  ].join('\n')

  try {
    const event = await extractWithClaude(texte)
    return NextResponse.json({ event })
  } catch (e) {
    return NextResponse.json({ error: `Extraction impossible (${(e as Error).message})` }, { status: 502 })
  }
}
