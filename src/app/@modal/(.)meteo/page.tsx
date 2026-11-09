import InterceptModalShell from '@/components/InterceptModalShell'
import MeteoVue from '@/components/meteo/MeteoVue'

/**
 * Intercepting route (.)meteo dans le slot @modal — même principe que les
 * fiches producteur et établissement.
 *
 * Ouverte depuis l'app (l'icône du Village), la météo se pose PAR-DESSUS
 * l'accueil, qui reste monté : le retour la referme sans rien recharger.
 * Un lien direct ou un rafraîchissement sur /meteo prend la vraie route,
 * plein écran.
 */
export default function MeteoInterceptModal() {
  return (
    <InterceptModalShell match="/meteo">
      <MeteoVue />
    </InterceptModalShell>
  )
}
