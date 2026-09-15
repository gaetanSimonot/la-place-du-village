import type { Metadata } from 'next'
import RadioAdminClient from './client'

export const metadata: Metadata = { title: 'Radio — saisie' }

/**
 * /radio/admin — monter l'émission de la semaine.
 *
 * L'accès réel est contrôlé PAR LE SERVEUR dans /api/radio/admin : cette page
 * ne fait que refléter ce que l'API accepte. Masquer un écran ne protège rien.
 */
export default function RadioAdminPage() {
  return <RadioAdminClient />
}
