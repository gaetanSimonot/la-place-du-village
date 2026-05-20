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
import PhoneFrame from '@/components/PhoneFrame'
import { Toaster } from 'sonner'

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
                  <PhoneFrame>
                    {children}
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
                          fontFamily: 'var(--font-inter), Inter, sans-serif',
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
                </HistoryTrapProvider>
              </ConfirmDialogProvider>
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
