import type { Metadata, Viewport } from 'next'
import { Inter, DM_Serif_Display, Caveat } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import InstallBanner from '@/components/InstallBanner'
import { AuthModalProvider } from '@/contexts/AuthModalContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { ConfirmDialogProvider } from '@/contexts/ConfirmDialogContext'
import { HistoryTrapProvider } from '@/contexts/HistoryTrapContext'
import AuthModal from '@/components/AuthModal'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const dmSerif = DM_Serif_Display({
  weight: '400', subsets: ['latin'], variable: '--font-dm-serif', display: 'swap',
})
const caveat = Caveat({
  weight: ['500', '700'], subsets: ['latin'], variable: '--font-caveat', display: 'swap',
})

export const metadata: Metadata = {
  title: 'La Place du Village',
  description: 'Événements locaux autour de Ganges (Hérault)',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'La Place',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#FDFAF5',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${dmSerif.variable} ${caveat.variable}`}>
      <head>
        {/* Capture beforeinstallprompt before React mounts */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.__pwaPrompt = null;
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaPrompt = e;
          });
        `}} />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <AuthModalProvider>
            <ThemeProvider>
              <ConfirmDialogProvider>
                <HistoryTrapProvider>
                  {children}
                  <InstallBanner />
                  <AuthModal />
                </HistoryTrapProvider>
              </ConfirmDialogProvider>
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
