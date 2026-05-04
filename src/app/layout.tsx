import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import InstallBanner from '@/components/InstallBanner'
import { AuthModalProvider } from '@/contexts/AuthModalContext'
import { AuthProvider } from '@/contexts/AuthContext'
import AuthModal from '@/components/AuthModal'

export const metadata: Metadata = {
  title: 'La Place du Village',
  description: 'Événements locaux autour de Ganges (Hérault)',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
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
  themeColor: '#2D5A3D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
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
              {children}
              <InstallBanner />
              <AuthModal />
            </ThemeProvider>
          </AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
