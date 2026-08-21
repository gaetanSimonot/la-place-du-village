import MonCinemaClient from './client'

/**
 * /cinema/admin — « Mon cinéma ».
 *
 * L'accès réel est contrôlé PAR LE SERVEUR dans /api/cinema/admin : cette page
 * ne fait que refléter ce que l'API accepte. Masquer un écran ne protège rien.
 */
export default function MonCinemaPage() {
  return <MonCinemaClient />
}
