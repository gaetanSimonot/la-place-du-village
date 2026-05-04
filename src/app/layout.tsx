import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import InstallBanner from '@/components/InstallBanner'

export const metadata: Metadata = {
  title: 'La Place du Village',
  description: 'Événements locaux autour de Ganges (Hérault)',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'La Place',
    startupImage: '/apple-touch-icon.png',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/favicon-32.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#E8622A',
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
        <ThemeProvider>
          {children}
          <InstallBanner />
        </ThemeProvider>
      </body>
    </html>
  )
}
