import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Journal du Village — La Place du Village',
}

export default async function JournalIndexPage() {
  const { data } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero')
    .eq('statut', 'publie')
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.numero != null) {
    redirect(`/journal/${data.numero}`)
  }

  return (
    <main className="min-h-screen bg-creme px-4 py-16 font-inter">
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
