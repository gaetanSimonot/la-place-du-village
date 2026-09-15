import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Inter, DM_Serif_Display, Caveat, Plus_Jakarta_Sans, Archivo, Nunito } from 'next/font/google'
import './globals.css'
// Version ordinateur : additif, tout est enfermé au-dessus de 1024 px.
import './desktop.css'
import './desktop-village.css'
import './desktop-sheets.css'
import './desktop-pages.css'
import './desktop-village2.css'
import './desktop-rubriques.css'
import './desktop-carte.css'
import './desktop-cinema.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import InstallBanner from '@/components/InstallBanner'
import { AuthModalProvider } from '@/contexts/AuthModalContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { ConfirmDialogProvider } from '@/contexts/ConfirmDialogContext'
import { HistoryTrapProvider } from '@/contexts/HistoryTrapContext'
import { NavigationHistoryProvider } from '@/contexts/NavigationHistoryContext'
import SWRProvider from '@/components/SWRProvider'
import RadioDirectProvider from '@/components/RadioDirectProvider'
import AuthModal from '@/components/AuthModal'
import PhoneFrame from '@/components/PhoneFrame'
import DesktopChrome from '@/components/desktop/DesktopChrome'
import DesktopFooter from '@/components/desktop/DesktopFooter'
import MaintenanceGate from '@/components/MaintenanceGate'
import PromoSplashGate from '@/components/PromoSplashGate'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const dmSerif = DM_Serif_Display({
  weight: '400', subsets: ['latin'], variable: '--font-dm-serif', display: 'swap',
})
const caveat = Caveat({
  weight: ['500', '700'], subsets: ['latin'], variable: '--font-caveat', display: 'swap',
})
const jakarta = Plus_Jakarta_Sans({
  weight: ['400', '500', '600', '700', '800'], subsets: ['latin'], variable: '--font-jakarta', display: 'swap',
})
// Polices propres au splash promo Habitant (maquette de handoff).
// preload: false volontaire — elles ne servent qu'à cette modale, rare et
// tardive : les précharger sur chaque page ferait payer deux fichiers de plus
// à tout le monde, pour rien.
const archivo = Archivo({
  weight: ['700', '800', '900'], subsets: ['latin'], variable: '--font-archivo', display: 'swap', preload: false,
})
const nunito = Nunito({
  weight: ['400', '600', '700', '800'], subsets: ['latin'], variable: '--font-nunito', display: 'swap', preload: false,
})

/*
 * LE NOM PUBLIC EST « LA PLACE ». L'ANCIEN RESTE TROUVABLE.
 *
 * Google construit le nom du site à partir de quatre signaux, dans cet ordre :
 * la donnée structurée `WebSite.name`, `og:site_name`, le `<title>` de la page
 * d'accueil, puis `<meta name="application-name">`. Les quatre disent « La
 * Place » — s'ils se contredisaient, Google trancherait tout seul, et pas
 * forcément dans le bon sens.
 *
 * Personne ne doit perdre l'app en cherchant « la place du village » pour
 * autant. L'ancien nom reste donc écrit à trois endroits que Google lit :
 * `alternateName` dans la donnée structurée (le champ prévu exactement pour
 * ça), la description, et les 150 mentions déjà présentes dans les pages.
 *
 * Le changement de nom affiché met plusieurs jours à passer : Google doit
 * recrawler l'accueil. Rien ne se casse entre-temps, l'ancien nom s'affiche.
 */
const NOM = 'La Place'
const NOM_HISTORIQUE = 'La Place du Village'

export const metadata: Metadata = {
  title: NOM,
  description: `Les événements, commerces et annonces autour de Ganges (Hérault). ${NOM}, anciennement ${NOM_HISTORIQUE}.`,
  applicationName: NOM,
  manifest: '/manifest.json',
  metadataBase: new URL('https://laplaceduvillage.app'),
  // Canonique explicite (sans www) — sinon Google considère
  // https://www.laplaceduvillage.app/ comme doublon canonique et n'indexe pas
  // notre version officielle.
  alternates: {
    canonical: 'https://laplaceduvillage.app/',
  },
  openGraph: {
    title: NOM,
    siteName: NOM,
    description: `Les événements, commerces et annonces autour de Ganges (Hérault). ${NOM}, anciennement ${NOM_HISTORIQUE}.`,
    url: 'https://laplaceduvillage.app',
    locale: 'fr_FR',
    type: 'website',
    // Image de partage par défaut (racine + pages d'index). JPG compressé
    // pour passer la limite ~300KB de WhatsApp/Messenger (le PNG d'origine
    // 1.28MB n'était pas téléchargé par WhatsApp → fallback favicon).
    // Les fiches individuelles (annonces, événements, etc.) overrident
    // avec leur propre photo via leur generateMetadata.
    // La 1re image est l'aperçu de partage par défaut (Facebook/WhatsApp/
    // Messenger prennent celle-là). « Tout est là » = visuel d'accroche.
    images: [
      {
        url: '/og/tout-est-la.jpg',
        width: 1200,
        height: 630,
        alt: 'La Place du Village — Tout est là, le bouche-à-oreille enfin organisé',
      },
      {
        url: '/og/home.jpg',
        width: 1200,
        height: 630,
        alt: 'La Place du Village — Ganges et alentours',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: NOM,
    description: `Les événements, commerces et annonces autour de Ganges (Hérault). ${NOM}, anciennement ${NOM_HISTORIQUE}.`,
    images: ['/og/tout-est-la.jpg'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'La Place',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icon-167.png',         sizes: '167x167', type: 'image/png' },
      { url: '/icon-152.png',         sizes: '152x152', type: 'image/png' },
      { url: '/icon-120.png',         sizes: '120x120', type: 'image/png' },
    ],
  },
}

const SITE_URL = 'https://laplaceduvillage.app/'

/**
 * Ce que Google lit pour nommer le site dans ses résultats.
 *
 * Les deux nœuds sont liés par `@id` plutôt que dupliqués : l'éditeur du site
 * EST l'organisation, et un moteur qui voit deux fois le même nom sans lien
 * entre eux peut conclure à deux entités différentes.
 *
 * Le domaine ne change pas. Le renommer ferait perdre l'historique du site,
 * qui est le vrai capital de référencement ici — bien plus que le nom.
 */
const DONNEE_STRUCTUREE = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}#site`,
      name: NOM,
      alternateName: [NOM_HISTORIQUE],
      url: SITE_URL,
      inLanguage: 'fr-FR',
      publisher: { '@id': `${SITE_URL}#org` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}#org`,
      name: NOM,
      alternateName: [NOM_HISTORIQUE],
      url: SITE_URL,
      logo: `${SITE_URL}icons/icon-512.png`,
      areaServed: 'Ganges, Hérault, France',
    },
  ],
}

export const viewport: Viewport = {
  themeColor: '#FDFAF5',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,        // zoom autorisé (accessibilité) — compromis : jusqu'à x5
  userScalable: true,
}

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  // Slot @modal : rendu en parallèle de children. Vide par défaut
  // (cf. src/app/@modal/default.tsx). Rempli par les intercepting routes
  // (.)producteur/[id] et (.)etablissement/[id] lors d'un soft-nav vers
  // ces URLs depuis l'app.
  modal: React.ReactNode
}) {
  return (
    <html lang="fr" className={`${inter.variable} ${dmSerif.variable} ${caveat.variable} ${jakarta.variable} ${archivo.variable} ${nunito.variable}`}>
      <head>
        {/* Capture beforeinstallprompt before React mounts */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.__pwaPrompt = null;
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaPrompt = e;
          });
        `}} />
        {/*
          La carte d'identité du site pour les moteurs.
          `alternateName` est le champ prévu pour un nom abandonné : il dit à
          Google « ce site s'appelle La Place ET on le cherche aussi sous La
          Place du Village », sans que l'ancien nom ne s'affiche nulle part.
          Le `<` est échappé : une chaîne de la donnée pourrait sinon fermer
          la balise script et injecter du balisage.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(DONNEE_STRUCTUREE).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className="antialiased">
        <SWRProvider>
        {/* La radio en direct survit a la navigation : montee ICI, elle n'est
            jamais demontee par un changement de page. */}
        <RadioDirectProvider>
        <NavigationHistoryProvider>
        <AuthProvider>
          <AuthModalProvider>
            <ThemeProvider>
              <ConfirmDialogProvider>
                <HistoryTrapProvider>
                  <Suspense fallback={null}><DesktopChrome /></Suspense>
                  <PhoneFrame>
                    <MaintenanceGate>{children}</MaintenanceGate>
                    {/* Modal slot : interceptors (.)producteur / (.)etablissement
                        s'affichent ici par-dessus children. La home + sa carte
                        restent montées dessous → pas de remount carte. */}
                    {modal}
                    <PromoSplashGate />
                    <InstallBanner />
                    <AuthModal />
                    <Toaster
                      position="top-center"
                      richColors={false}
                      closeButton={false}
                      duration={3500}
                      offset={70}
                      toastOptions={{
                        // Style aligné sur la charte (cards Inter, radius 16,
                        // couleurs primary/accent/texte du theme Tailwind)
                        style: {
                          fontFamily: 'var(--font-body), Inter, sans-serif',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: '14px',
                          padding: '12px 16px',
                          boxShadow: '0 6px 24px rgba(26,18,9,0.18)',
                          border: '1px solid #E8E0D4',
                          background: '#FFFFFF',
                          color: '#1A1209',
                        },
                        classNames: {
                          success: 'pdv-toast-success',
                          error:   'pdv-toast-error',
                          info:    'pdv-toast-info',
                          warning: 'pdv-toast-warning',
                        },
                      }}
                    />
                  </PhoneFrame>
                  <Suspense fallback={null}><DesktopFooter /></Suspense>
                </HistoryTrapProvider>
              </ConfirmDialogProvider>
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
        </NavigationHistoryProvider>
        </RadioDirectProvider>
        </SWRProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
