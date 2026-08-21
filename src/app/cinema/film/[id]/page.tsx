import FilmClient from './client'

/** /cinema/film/[id] — la fiche d'un film et toutes ses séances à venir. */
export default async function FilmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FilmClient id={id} />
}
