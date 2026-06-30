/// <reference lib="webworker" />
/**
 * CUSTOM SERVICE WORKER — handlers Web Push.
 *
 * @ducanh2912/next-pwa auto-compile ce dossier `worker/` et l'injecte dans le
 * SW Workbox généré (public/sw.js). On n'y met QUE les écouteurs push : la
 * config de cache (OAuth NetworkOnly, /api NetworkOnly, etc.) reste gérée par
 * Workbox dans next.config.mjs, intacte.
 */

declare const self: ServiceWorkerGlobalScope

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title || 'La Place du Village'
  const url = payload.url || '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-mono.png',   // silhouette monochrome (Android masque le badge en blanc)
      tag: payload.tag,            // même tag = la notif remplace la précédente
      renotify: !!payload.tag,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Si une fenêtre de l'app est déjà ouverte → on la focus et on navigue.
        for (const client of clients) {
          if ('focus' in client) {
            void client.focus()
            if ('navigate' in client) void (client as WindowClient).navigate(url)
            return
          }
        }
        // Sinon on ouvre une nouvelle fenêtre.
        return self.clients.openWindow(url).then(() => undefined)
      }),
  )
})

export {}
