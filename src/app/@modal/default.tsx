// Slot @modal par défaut : null tant qu'aucune intercepting route n'est active.
// Next.js exige un fichier `default.tsx` dans chaque parallel slot pour
// gérer les états où le slot n'est pas activement matched.
export default function ModalDefault() {
  return null
}
