'use client'
import { MAP_STYLES } from '@/lib/themes'
import { useTheme } from './ThemeProvider'

/**
 * Choix du fond de carte, cote apparence.
 *
 * Le style est GLOBAL : ce qu'on choisit ici, tout le monde le voit (voir
 * ThemeProvider). Le composant existe pour etre pose a DEUX endroits sans
 * recopier la liste — le tableau de bord admin, sous le choix Google / carte
 * libre, et les reglages de la carte, ou seul un admin le voit.
 *
 * Il ne verifie pas lui-meme qui appelle : c'est l'appelant qui ne l'affiche
 * qu'aux admins, et la route PATCH qui refuse les autres.
 */
export default function MapStylePicker() {
  const theme = useTheme()

  return (
    <div className="flex flex-col gap-1.5">
      {MAP_STYLES.map(s => {
        const actif = theme.mapStyle.id === s.id
        return (
          <button
            key={s.id}
            onClick={() => theme.setMapStyleId(s.id)}
            className="flex items-center gap-3 rounded-xl border-none px-3 py-2.5 text-left"
            style={{
              backgroundColor: actif ? 'var(--primary-light)' : '#FDFAF5',
              outline: actif ? '2px solid var(--primary)' : '1.5px solid transparent',
            }}
          >
            <div className="h-7 w-9 shrink-0 rounded-md" style={{ backgroundColor: s.previewBg }} />
            <div className="flex-1">
              <p className="m-0 text-[12px] font-bold" style={{ color: actif ? 'var(--primary)' : '#1A1209' }}>
                {s.name}
              </p>
              <p className="m-0 mt-px text-[10px] text-texte-doux">{s.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
