import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pboaaykucqbmxryyxslz.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default withPWA({
  dest: 'public',
  // Enregistre le SW automatiquement (default mais explicite pour la clarte).
  register: true,
  // NE PAS cacher le start_url -> a chaque boot de la PWA, on re-fetch le HTML.
  // Critique iOS : sinon la PWA installee sert toujours le vieux HTML.
  cacheStartUrl: false,
  // Si le start_url change plus tard, force le re-cache.
  dynamicStartUrl: true,
  // Anciennement true : causait des updates lents (les users restaient sur
  // l'ancien code 24h+ apres un deploiement). Desactive pour que les fixes
  // arrivent immediatement.
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    // Le nouveau SW remplace l ancien immediatement, sans attendre que
    // tous les onglets soient fermes.
    skipWaiting: true,
    // Le nouveau SW prend le controle des onglets ouverts des l install.
    clientsClaim: true,
    runtimeCaching: [
      {
        // Callback OAuth — JAMAIS depuis le cache, sinon le code passe a
        // cote du handler et l user atterrit sur une page random.
        urlPattern: /\/auth\/callback/,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/producers/,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/mon-producteur/,
        handler: 'NetworkOnly',
      },
      // Chunks JS / CSS Next.js : content-hashed (immuables) -> CacheFirst
      // safe et economise la bande passante.
      {
        urlPattern: /\/_next\/static\/.*/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      // Pages HTML (navigations) : toujours fetch en priorite, fallback
      // cache si offline. Plus de "vieux HTML 24h" qui bloque les updates.
      {
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 50 },
        },
      },
    ],
  },
})(nextConfig)
