/**
 * Partage natif (Web Share API) avec fallback clipboard + toast.
 *
 * Pattern extrait du bouton "Partager l'app" du hub (cf. HubView.tsx).
 * À utiliser partout où on veut un bouton "Partager" cohérent : tuiles
 * annonces, tuiles promotions, top bar pages /annonces et /promotions, etc.
 *
 * Comportement :
 *  - iOS/Android/desktop modernes → feuille de partage native du système.
 *  - Sinon → copie l'URL dans le presse-papiers + toast de confirmation.
 *  - User ferme la feuille → no-op silencieux (pas d'erreur).
 */
import { toast } from 'sonner'

export interface ShareData {
  title: string
  text:  string
  url:   string
}

export async function shareLink(data: ShareData): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      // WhatsApp ne génère pas de LinkPreview quand l'URL est passée via
      // la propriété `url` du Web Share API (il l'envoie telle quelle).
      // Pour déclencher le scrape OG côté WhatsApp/Messenger, on met
      // l'URL à la fin du `text` et on omet `url`. Le destinataire voit
      // alors un message texte avec une URL → preview riche normale.
      await navigator.share({
        title: data.title,
        text: `${data.text}\n${data.url}`,
      })
    } catch {
      // L'utilisateur a fermé la feuille de partage → no-op silencieux
    }
    return
  }
  try {
    await navigator.clipboard.writeText(data.url)
    toast.success('Lien copié — partage-le où tu veux !')
  } catch {
    toast.error('Impossible de copier le lien')
  }
}
