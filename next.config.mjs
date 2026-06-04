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
      // Données dynamiques fréquentes — JAMAIS de cache SW, sinon les
      // nouveaux inscrits / events / annonces n'apparaissent pas.
      // (cf. incident 2026-05-26 : /people affichait 20 sur 38).
      { urlPattern: /\/api\/people/,    handler: 'NetworkOnly' },
      { urlPattern: /\/api\/agenda/,    handler: 'NetworkOnly' },
      { urlPattern: /\/api\/hub/,       handler: 'NetworkOnly' },
      { urlPattern: /\/api\/inbox/,     handler: 'NetworkOnly' },
      { urlPattern: /\/api\/notifications/, handler: 'NetworkOnly' },
      { urlPattern: /\/api\/maintenance/, handler: 'NetworkOnly' },
      // Mur (posts/likes/comments) : temps réel, jamais de cache SW sinon
      // les nouveaux posts n'apparaissent pas et les suppressions restent
      // affichées (même classe de bug que /people le 2026-05-26).
      { urlPattern: /\/api\/posts/,     handler: 'NetworkOnly' },
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
      // Images user-content Supabase Storage (avatars, bannieres, photos
      // events/etabs/annonces/producers). Avant : aucun cache SW, chaque
      // nav re-fetch tout. StaleWhileRevalidate : sert le cache instant
      // ET refetch en background -> les nouvelles versions arrivent au
      // prochain affichage. Cap entries pour pas exploser le quota.
      // STRICT : hostname Supabase + path /storage/v1/object/public/ +
      // destination 'image' -> jamais les requetes REST ni auth.
      {
        urlPattern: ({ url, request }) =>
          url.hostname === 'pboaaykucqbmxryyxslz.supabase.co'
          && url.pathname.startsWith('/storage/v1/object/public/')
          && request.destination === 'image',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'supabase-storage-images',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 14 * 24 * 60 * 60, // 14 jours
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})(nextConfig)
