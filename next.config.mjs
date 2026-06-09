import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Générateur d'affiches (route /api/poster/generate) :
  // - modules natifs gardés hors du bundle webpack
  // - polices + fonds embarqués dans la fonction serverless (lus via process.cwd())
  experimental: {
    serverComponentsExternalPackages: ['sharp', '@resvg/resvg-js'],
    outputFileTracingIncludes: {
      '/api/poster/generate': [
        './src/lib/poster/fonts/**',
        './src/lib/poster/backgrounds/**',
      ],
    },
  },
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
      // TOUTES les routes /api : JAMAIS de cache SW. Principe "cache le shell,
      // jamais les données" (comme Facebook) : les API renvoient des données
      // dynamiques — un cache SW les sert périmées, d'où des bugs récurrents
      // (nouveaux inscrits /people le 2026-05-26, mur posts le 2026-06-04...).
      // Cette règle globale rend tout nouvel endpoint safe par défaut : plus
      // besoin de l'ajouter à la main. On cache toujours le shell (chunks,
      // pages, images) plus bas, mais jamais les réponses API.
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
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
