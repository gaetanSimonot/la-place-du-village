import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import BottomNavBar from '@/components/BottomNavBar'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseAdmin
    .from('articles_journal')
    .select('titre, corps')
    .eq('id', id)
    .maybeSingle()
  if (!data) return { title: 'Article — La Place du Village' }
  return {
    title: `${data.titre} — Article du Journal`,
    description: data.corps.slice(0, 160),
  }
}

interface ArticleRow {
  id: string
  titre: string
  corps: string
  photo_url: string | null
  statut: 'brouillon' | 'en_attente' | 'valide' | 'refuse' | 'publie'
  journal_id: string | null
  created_at: string
  updated_at: string
  user_id: string | null
}

export default async function ArticleViewPage({ params }: Props) {
  const { id } = await params

  const { data: article } = await supabaseAdmin
    .from('articles_journal')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!article) notFound()
  const row = article as ArticleRow

  // Si l'article est publié et attaché à un journal, on charge le numéro
  // pour proposer un lien direct vers le numéro complet.
  let journalNumero: number | null = null
  if (row.journal_id) {
    const { data: j } = await supabaseAdmin
      .from('journaux_hebdo')
      .select('numero, statut')
      .eq('id', row.journal_id)
      .maybeSingle()
    if (j && j.statut === 'publie') journalNumero = j.numero
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/journal/articles"
          aria-label="Retour"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-bord bg-white text-texte"
          style={{ boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <div className="text-[11px] font-bold text-texte-doux" style={{ letterSpacing: '0.04em' }}>
            ARTICLE
          </div>
          <div className="text-[10px] font-semibold text-texte-tres-doux">
            {row.statut.replace('_', ' ').toUpperCase()}
          </div>
        </div>
        <div className="h-10 w-10" />
      </div>

      {/* Bannière statut si pas publié */}
      {row.statut !== 'publie' && (
        <div
          className="mx-4 mt-3 rounded-[12px] border border-bord bg-white px-4 py-3 text-[12px]"
          style={{ color: '#7A6A5A' }}
        >
          {row.statut === 'brouillon' && '✏ Brouillon — visible uniquement par toi.'}
          {row.statut === 'en_attente' && '⏳ Soumis, en attente de validation par un admin.'}
          {row.statut === 'valide' && '✓ Validé — sera publié dans un prochain numéro du Journal.'}
          {row.statut === 'refuse' && '✕ Refusé par la modération.'}
        </div>
      )}

      {/* Lien vers le journal si publié */}
      {row.statut === 'publie' && journalNumero != null && (
        <div className="mx-4 mt-3 rounded-[12px] border border-primary bg-[#E8F2EB] px-4 py-3">
          <div className="text-[10px] font-extrabold tracking-[0.12em] text-primary">
            ✓ PUBLIÉ DANS LE JOURNAL
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[13px] text-texte">Numéro n°{journalNumero} du Journal</span>
            <Link
              href={`/journal/${journalNumero}`}
              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
            >
              Voir le numéro →
            </Link>
          </div>
        </div>
      )}

      {/* Titre + corps */}
      <article className="px-4 pt-6">
        <h1
          className="font-serif leading-[1.1] text-texte"
          style={{ fontSize: 28, letterSpacing: '-0.02em' }}
        >
          {row.titre}
        </h1>
        {row.photo_url && (
          <div
            className="mt-4 overflow-hidden rounded-[16px] bg-bord/40"
            style={{ height: 240, boxShadow: '0 6px 24px rgba(44,28,16,0.18)' }}
          >
            <img src={row.photo_url} alt={row.titre} className="h-full w-full object-cover" />
          </div>
        )}
        <div
          className="mt-5 whitespace-pre-wrap text-[16px] leading-[1.7] text-texte"
          style={{ fontFamily: 'Georgia, "Crimson Pro", serif' }}
        >
          {row.corps}
        </div>
      </article>

      <BottomNavBar />
    </main>
  )
}
