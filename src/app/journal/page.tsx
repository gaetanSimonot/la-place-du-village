import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const OG_DESC = 'Vous lisez les nouvelles du village. Pourquoi ne pas les écrire ? Le Journal hebdo de La Place du Village.'

export const metadata = {
  title: 'Journal du Village — La Place du Village',
  description: OG_DESC,
  openGraph: {
    title: 'Le Journal du Village',
    description: OG_DESC,
    url: 'https://laplaceduvillage.app/journal',
    type: 'website',
    images: [{ url: '/og/journal.jpg', width: 1200, height: 630, alt: 'Le Journal du Village — l’hebdo de La Place du Village' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Le Journal du Village',
    description: OG_DESC,
    images: ['/og/journal.jpg'],
  },
}

// Robots de partage social : on NE redirige PAS (sinon ils liraient l'OG du
// numéro après redirection au lieu de l'image de promo du Journal).
const SOCIAL_CRAWLER = /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|telegrambot|linkedinbot|discordbot|pinterest|redditbot|embedly|skypeuripreview|vkshare/i

export default async function JournalIndexPage() {
  const ua = (await headers()).get('user-agent') ?? ''
  const isCrawler = SOCIAL_CRAWLER.test(ua)

  const { data } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero')
    .eq('statut', 'publie')
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.numero != null && !isCrawler) {
    redirect(`/journal/${data.numero}`)
  }

  return (
    <main className="min-h-screen bg-creme px-4 py-16 font-inter pcv-journal">
      <div className="mx-auto max-w-md text-center">
        <h1
          className="font-serif text-[32px] leading-[1.1] text-texte"
          style={{ letterSpacing: '-0.02em' }}
        >
          Le Journal du Village
        </h1>
        <p className="mt-3 text-[14px] text-texte-doux">
          Aucun numéro publié pour l&apos;instant. Le premier numéro arrive bientôt.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold text-white"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  )
}
