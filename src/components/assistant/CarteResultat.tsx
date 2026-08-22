'use client'
import { useFavori } from '@/hooks/useFavori'
import { imageEvenement } from '@/lib/imageEvenement'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie } from '@/lib/types'

/**
 * ASSISTANT VILLAGE — une fiche réelle dans le fil de conversation.
 *
 * Ces cartes ne viennent JAMAIS du texte du modèle : le serveur les a lues
 * en base et les envoie à part. Le modèle n'écrit que des identifiants. Une
 * carte affichée est donc, par construction, une vraie fiche — et le clic
 * ouvre un aperçu, d'où l'on garde la fiche ou l'on va la voir en entier —
 * sans quitter la conversation. L'assistant est une façon de naviguer dans
 * La Place du Village, pas un endroit qui la recopie.
 *
 * Géométrie reprise de la maquette (`.rp`) : vignette 62, rayon 14, tag puis
 * titre puis méta. La séance de cinéma garde son bleu nuit — c'est le même
 * univers que la page /cinema, et on le reconnaît sans lire.
 */

export interface CarteData {
  type: 'ev' | 'etab' | 'prod' | 'film' | 'promo' | 'annonce'
  id: string
  data: Record<string, unknown>
}

const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const premiere = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)

const JOUR = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric' })
    .format(new Date(`${iso}T12:00:00Z`))
  return d.charAt(0).toUpperCase() + d.slice(1).replace('.', '.')
}

/* ─── Briques visuelles ───────────────────────────────────────────────── */

function Tag({ children, sombre }: { children: React.ReactNode; sombre?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', borderRadius: 6, padding: '3px 7px',
      fontSize: 10, fontWeight: 800, letterSpacing: '.01em',
      background: sombre ? '#192D41' : '#F4EFE7',
      color: sombre ? '#8FCBEE' : '#7A6A5A',
    }}>{children}</span>
  )
}

function Meta({ icone, children, sombre }: { icone: React.ReactNode; children: React.ReactNode; sombre?: boolean }) {
  return (
    <div style={{
      marginTop: 4, fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5,
      color: sombre ? 'rgba(250,251,250,.6)' : '#7A6A5A', minWidth: 0,
    }}>
      <span style={{ flex: 'none', lineHeight: 0 }}>{icone}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}

const IcoPin = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
)
const IcoCine = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
    <rect x="2" y="8" width="20" height="13" rx="2" /><path d="M2.5 8l19-3.4M6.5 7.6l1-3.6M12 6.8l1-3.6M17.5 6l1-3.6" />
  </svg>
)
const IcoTag = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.6 13.4L12 22l-9-9V3h10z" /><circle cx="7.5" cy="7.5" r="1.3" />
  </svg>
)

/**
 * Garder une fiche sans l'ouvrir.
 *
 * Tout l'état vit dans `useFavori` : la vérité vient du serveur, et le
 * moindre changement est annoncé à l'application entière. Le cœur de la
 * carte, celui de l'aperçu et celui de la barre du bas parlent donc toujours
 * de la même chose.
 */
function Coeur({ carte, sombre }: { carte: CarteData; sombre?: boolean }) {
  const { possible, garde, connu, busy, basculer } = useFavori(carte.type, carte.id, carte.data.favori)
  if (!possible || !connu) return null

  return (
    <button type="button"
      onClick={e => {
        e.stopPropagation()   // le clic ne doit pas ouvrir l'aperçu
        // La carte garde la vérité : rouvrir la conversation depuis
        // l'appareil ne doit pas rendre un cœur périmé.
        carte.data.favori = !garde
        void basculer()
      }}
      aria-label={garde ? 'Retirer des favoris' : 'Garder'}
      className="flex flex-none items-center justify-center border-none bg-transparent"
      style={{ width: 30, height: 30, marginTop: -2, marginRight: -2, opacity: busy ? 0.5 : 1 }}>
      <svg width="17" height="17" viewBox="0 0 24 24"
        fill={garde ? '#C84B2F' : 'none'}
        stroke={garde ? '#C84B2F' : sombre ? 'rgba(250,251,250,.5)' : '#C9BFB2'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  )
}

function Coquille({ sombre, onOuvrir, carte, children }: {
  sombre?: boolean; onOuvrir?: () => void; carte: CarteData; children: React.ReactNode
}) {
  return (
    <div role="button" tabIndex={0} onClick={onOuvrir}
      onKeyDown={e => { if (e.key === 'Enter') onOuvrir?.() }}
      className="w-full text-left"
      style={{
        display: 'flex', gap: 11, padding: 11, borderRadius: 14,
        border: `1px solid ${sombre ? 'transparent' : '#F0EAE0'}`,
        background: sombre ? '#12171C' : '#fff',
        color: sombre ? '#FAFBFA' : '#1A1209',
        boxShadow: '0 1px 4px rgba(44,28,16,.04)', textDecoration: 'none', cursor: 'pointer',
      }}>
      {children}
      <Coeur carte={carte} sombre={sombre} />
    </div>
  )
}

function Vignette({ url, sombre, texte, teinte }: {
  url: string | null; sombre?: boolean; texte?: string | null
  /** Couleur de repli quand il n'y a vraiment aucune image. */
  teinte?: string | null
}) {
  return (
    <span style={{
      width: 62, height: 62, borderRadius: 11, flex: 'none', overflow: 'hidden', display: 'block',
      background: sombre ? '#1B2733' : teinte ? `${teinte}1A` : '#F4EFE7',
    }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
      ) : texte ? (
        <span style={{
          display: 'flex', width: '100%', height: '100%', alignItems: 'flex-end', padding: 6,
          fontSize: 9, fontWeight: 700, lineHeight: 1.15,
          color: sombre ? '#CFE6F5' : teinte ?? '#A99B89',
          background: sombre ? 'linear-gradient(155deg,#243447,#131A22)' : 'transparent',
        }}>{texte.slice(0, 28)}</span>
      ) : null}
    </span>
  )
}

const TITRE: React.CSSProperties = {
  marginTop: 5, fontFamily: 'var(--font-title), sans-serif',
  fontSize: 14.5, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-.01em',
}

/* ─── La carte ────────────────────────────────────────────────────────── */

export default function CarteResultat({ carte, onOuvrir }: { carte: CarteData; onOuvrir?: () => void }) {
  const d = carte.data

  if (carte.type === 'ev') {
    const lieu = (d.lieux ?? null) as Record<string, unknown> | null
    const heure = s(d.heure)?.slice(0, 5)
    // `imageEvenement` et non `image_url` : c'est lui qui connaît les
    // illustrations de repli — un marché du mercredi n'a pas d'affiche, et
    // sans ce passage la conversation affichait un cadre vide là où le reste
    // de l'app montre son pictogramme.
    const cat = (s(d.categorie) ?? (Array.isArray(d.categories) ? String(d.categories[0]) : null)) as Categorie | null
    return (
      <Coquille onOuvrir={onOuvrir} carte={carte}>
        <Vignette
          url={imageEvenement(d as { image_url?: string | null; categorie?: string | null; categories?: string[] | null })}
          texte={s(d.titre)}
          teinte={cat ? CATEGORIES[cat]?.color ?? null : null}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <Tag>{[JOUR(s(d.date_debut)), heure].filter(Boolean).join(' · ')}</Tag>
          <div className="line-clamp-2" style={TITRE}>{s(d.titre) ?? 'Événement'}</div>
          <Meta icone={IcoPin}>
            {[s(lieu?.nom), s(lieu?.commune), s(d.prix)].filter(Boolean).join(' · ') || 'Lieu à préciser'}
          </Meta>
        </span>
      </Coquille>
    )
  }

  if (carte.type === 'film') {
    const seances = Array.isArray(d.seances) ? (d.seances as Record<string, unknown>[]) : []
    const p = seances[0]
    return (
      <Coquille onOuvrir={onOuvrir} carte={carte} sombre>
        <Vignette url={s(d.affiche_url)} texte={s(d.titre)} sombre />
        <span style={{ flex: 1, minWidth: 0 }}>
          <Tag sombre>
            {p ? [JOUR(s(p.date)), s(p.heure), s(p.version)?.toUpperCase()].filter(Boolean).join(' · ') : 'À l’affiche'}
          </Tag>
          <div className="line-clamp-2" style={TITRE}>{s(d.titre) ?? 'Film'}</div>
          <Meta icone={IcoCine} sombre>
            {[s(p?.cinema), d.duree_min ? `${d.duree_min} min` : null].filter(Boolean).join(' · ') || 'Cinéma'}
          </Meta>
        </span>
      </Coquille>
    )
  }

  if (carte.type === 'etab' || carte.type === 'prod') {
    const producteur = carte.type === 'prod'
    const misEnAvant = !producteur && (d.is_featured === true || d.plan === 'pro')
    const TYPES: Record<string, string> = {
      restaurant_bar: 'Restaurant', hebergement: 'Hébergement',
      artisan_service: 'Artisan', sante_bien_etre: 'Bien-être', activite: 'Activité',
    }
    return (
      <Coquille onOuvrir={onOuvrir} carte={carte}>
        <Vignette url={premiere(d.photos)} texte={s(d.nom)} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Tag>{producteur ? 'Producteur' : TYPES[String(d.type)] ?? 'Commerce'}</Tag>
            {/* La mise en avant reste NOMMÉE, jamais traduite en jugement :
                c'est la condition pour continuer à faire confiance au reste. */}
            {misEnAvant && (
              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#C84B2F', border: '1px solid #F6D9CE', borderRadius: 999, padding: '2px 6px' }}>
                À la une
              </span>
            )}
            {/* Le bon plan du lieu, attaché par la recherche : il ne peut donc
                pas être hors sujet. */}
            {(d.bon_plan as { titre?: string } | null)?.titre && (
              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#2D5A3D', background: '#E8F2EB', borderRadius: 999, padding: '2px 6px' }}>
                Bon plan
              </span>
            )}
          </span>
          <div className="line-clamp-2" style={TITRE}>{s(d.nom) ?? 'Établissement'}</div>
          <Meta icone={IcoPin}>
            {[s(d.commune), typeof d.note_google === 'number' ? `${d.note_google.toFixed(1)} ★` : null]
              .filter(Boolean).join(' · ') || 'Autour de Ganges'}
          </Meta>
        </span>
      </Coquille>
    )
  }

  if (carte.type === 'promo') {
    const etab = (d.etablissement ?? null) as Record<string, unknown> | null
    // Pas de page par promotion dans l'app : la fiche de l'établissement est
    // l'endroit où elle se présente vraiment.
    return (
      <Coquille onOuvrir={onOuvrir} carte={carte}>
        <Vignette url={s(d.image_url) ?? premiere(etab?.photos)} texte={s(d.title)} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <Tag>Bon plan</Tag>
          <div className="line-clamp-2" style={TITRE}>{s(d.title) ?? 'Promotion'}</div>
          <Meta icone={IcoPin}>{[s(etab?.nom), s(etab?.commune)].filter(Boolean).join(' · ') || 'Chez un partenaire'}</Meta>
        </span>
      </Coquille>
    )
  }

  const prix = typeof d.prix_actuel === 'number' ? d.prix_actuel
    : typeof d.prix_initial === 'number' ? d.prix_initial : null
  return (
    <Coquille onOuvrir={onOuvrir} carte={carte}>
      <Vignette url={premiere(d.photos)} texte={s(d.titre)} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <Tag>{prix !== null ? `${prix} €` : 'Annonce'}</Tag>
        <div className="line-clamp-2" style={TITRE}>{s(d.titre) ?? 'Annonce'}</div>
        <Meta icone={IcoTag}>{[s(d.type), s(d.ville)].filter(Boolean).join(' · ') || 'Entre habitants'}</Meta>
      </span>
    </Coquille>
  )
}
