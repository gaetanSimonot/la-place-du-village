'use client'
/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import ClientPortal from '@/components/ClientPortal'

/**
 * LE MESSAGE DE BIENVENUE HABITANT, DANS L'APP — ouvert par la notification
 * `bienvenue_habitant` (liste des notifications, ou push du téléphone via
 * /?tab=notifs&post=bienvenue-habitant).
 *
 * C'est la version app du mail de Gaëtan (gabaritBienvenueHabitant) : même
 * bannière, mêmes textes, mêmes couleurs. Un changement de texte dans le
 * mail doit être reporté ici.
 */

export const CLE_BIENVENUE_HABITANT = 'bienvenue-habitant'

const VERT = '#184D39'
const ORANGE = '#E14818'
const ENCRE = '#3C2C20'

const AUSSI: { emoji: string; fond: string; titre: string; texte: string }[] = [
  { emoji: '⏱️', fond: '#FCE3EC', titre: 'Les enchères, 12 h avant tout le monde', texte: 'Vous voyez les enchères inversées dès leur publication, et pouvez les saisir avant qu’elles ne s’ouvrent à tous.' },
  { emoji: '📣', fond: '#E3EFE6', titre: 'Des annonces illimitées', texte: 'Vente, troc ou enchère : publiez autant d’annonces que vous voulez (sans abonnement, c’est 3 par mois ; les dons restent libres pour tous).' },
  { emoji: '📸', fond: '#FFF0C9', titre: 'Vos moments en page d’accueil', texte: 'Partagez une photo ou une courte vidéo dans « En ce moment » : elle reste visible 24 h pour tout le village.' },
  { emoji: '✨', fond: '#E2ECFB', titre: 'Toute l’application, sans compter', texte: 'Créer un événement à partir d’une simple affiche, mettre vos textes en forme, chercher un car à la voix : vous en profitez bien plus souvent, chaque jour.' },
]

const manuscrit: React.CSSProperties = { fontFamily: 'var(--font-caveat), "Caveat Brush", cursive', color: ORANGE, lineHeight: 1.2, margin: 0 }

export default function BienvenueHabitantModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { profile } = useAuth()
  const prenom = (profile?.display_name ?? '').trim().split(/\s+/)[0] || null
  const aller = (href: string) => { onClose(); router.push(href) }

  return (
    <ClientPortal>
      {/* Une carte centrée, cadrée, au-dessus de l'app — pas une feuille qui
          la recouvre. La croix et le bouton du bas sont posés sur le CADRE,
          hors de la zone qui défile : ils restent sous le doigt jusqu'au bout. */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(26,18,9,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(18px, env(safe-area-inset-top, 18px)) 16px max(18px, env(safe-area-inset-bottom, 18px))',
      }}>
      <div role="dialog" aria-modal="true" aria-label="Bienvenue parmi les Habitants" onClick={e => e.stopPropagation()} style={{
        position: 'relative', width: '100%', maxWidth: 440, maxHeight: 'min(82dvh, 760px)',
        backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 18px 50px rgba(26,18,9,.35)',
        fontFamily: 'var(--font-body), sans-serif', color: ENCRE,
      }}>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: '50%', border: 'none',
          background: 'rgba(255,255,255,.95)', color: '#1A1209', fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,.25)',
        }}>✕</button>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <img src="/email/banniere-la-place.jpg" alt="La Place : le bouche à oreille, enfin organisé !" style={{ display: 'block', width: '100%', height: 'auto', background: VERT }} />

        <div style={{ padding: '22px 20px 22px' }}>
          <p style={{ ...manuscrit, fontSize: 24, marginBottom: 2 }}>C’est parti&nbsp;!</p>
          <h2 style={{ margin: '0 0 12px', fontSize: 30, lineHeight: 1.12, fontWeight: 900, letterSpacing: '-.02em', color: VERT }}>
            Bienvenue sur <span style={{ color: ORANGE }}>La Place</span>{prenom ? `, ${prenom}` : ''}&nbsp;!
          </h2>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
            Merci de soutenir cette aventure locale. Votre abonnement <strong style={{ color: '#1A1209' }}>Habitant</strong> est actif dès maintenant.
          </p>

          {/* Bons plans */}
          <div style={{ background: '#FFF1E7', borderRadius: 18, padding: '22px 20px 20px', margin: '24px 0 0' }}>
            <p style={{ ...manuscrit, fontSize: 22, marginBottom: 2 }}>Le meilleur de l’abonnement&nbsp;👇</p>
            <p style={{ margin: '0 0 12px', fontSize: 23, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.015em', color: VERT }}>Les bons plans, sans limite</p>
            <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.65 }}>
              Profitez de toutes les offres de nos Partenaires Locaux, <strong style={{ color: '#1A1209' }}>autant de fois que vous le souhaitez</strong>, dans les conditions fixées par chacun d’eux. Sans abonnement, c’est une par mois.
            </p>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>
              Un verre offert, une remise, une séance découverte… <strong style={{ color: '#1A1209', background: '#FFD9C4', padding: '0 3px' }}>une seule offre suffit souvent à rembourser votre mois.</strong> Toutes les suivantes, c’est du bonus&nbsp;!
            </p>
            <button type="button" onClick={() => aller('/promotions')} style={{
              marginTop: 18, border: 'none', borderRadius: 999, background: ORANGE, color: '#fff',
              padding: '14px 26px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}>Voir les bons plans&nbsp;→</button>
          </div>

          {/* Et aussi */}
          <p style={{ ...manuscrit, fontSize: 22, margin: '30px 0 2px' }}>Et ce n’est pas tout…</p>
          <p style={{ margin: '0 0 16px', fontSize: 21, fontWeight: 900, lineHeight: 1.2, letterSpacing: '-.015em', color: VERT }}>Ce que vous débloquez aussi</p>
          {AUSSI.map(a => (
            <div key={a.titre} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', background: a.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>{a.emoji}</div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: '#1A1209' }}>{a.titre}</span>
                {a.texte}
              </p>
            </div>
          ))}
          <button type="button" onClick={() => aller('/annonces')} style={{
            border: 'none', borderRadius: 999, background: VERT, color: '#fff',
            padding: '14px 26px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}>Voir les annonces&nbsp;→</button>

          {/* Grâce à vous */}
          <div style={{ borderTop: '2px dashed #EAE2D6', margin: '30px 0 24px' }} />
          <p style={{ ...manuscrit, fontSize: 22, marginBottom: 2 }}>Grâce à vous</p>
          <p style={{ margin: '0 0 12px', fontSize: 21, fontWeight: 900, lineHeight: 1.2, letterSpacing: '-.015em', color: VERT }}>Le village vit un peu plus</p>
          <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.65 }}>
            Votre abonnement permet à La Place de rester indépendante et de mettre en lumière les commerces, producteurs, associations et initiatives de notre territoire.
          </p>
          <div style={{ background: '#FFF8E6', borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
            <p style={{ ...manuscrit, fontSize: 20, marginBottom: 4 }}>🚧 Et ce n’est que le début…</p>
            <p style={{ margin: '0 0 8px', fontSize: 14.5, lineHeight: 1.65 }}>
              La Place évolue en permanence. De nombreux chantiers sont en cours, et nous sommes <strong style={{ color: '#1A1209' }}>très fiers de ce qui arrive ensuite</strong>&nbsp;: vous serez parmi les premiers à le découvrir.
            </p>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>Merci d’avoir embarqué avec nous dans l’aventure, dès maintenant. ⛵</p>
          </div>
          <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.65 }}>
            Une question, une idée, une suggestion ?{' '}
            <button type="button" onClick={() => aller('/support')} style={{ background: 'none', border: 'none', padding: 0, color: VERT, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>Écrivez-nous</button>
            {' '}: vos retours font directement évoluer l’application.
          </p>
          <div style={{ background: '#F1F6F2', borderLeft: `4px solid ${ORANGE}`, borderRadius: '0 14px 14px 0', padding: '16px 20px', marginBottom: 22 }}>
            <p style={{ ...manuscrit, fontSize: 20, marginBottom: 4 }}>Le bouche à oreille, c’est vous&nbsp;!</p>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>Plus il y a d’habitants sur La Place, plus il y a de bons plans et de partenaires. Parlez-en autour de vous&nbsp;!</p>
          </div>
          <p style={{ margin: 0, fontSize: 15 }}>À très bientôt sur La Place,</p>
          <p style={{ ...manuscrit, fontSize: 24, color: VERT, margin: '2px 0 0' }}>L’équipe de La Place</p>
        </div>
        </div>

        {/* Toujours visible, au pied du cadre : l'essentiel, et une sortie. */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '12px 16px 14px', borderTop: '1px solid #F0EAE0', background: '#fff' }}>
          <button type="button" onClick={onClose} style={{
            flex: '0 0 auto', border: '1.5px solid #E0D8CE', borderRadius: 999, background: '#fff', color: '#6B5E4E',
            padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}>Fermer</button>
          <button type="button" onClick={() => aller('/promotions')} style={{
            flex: 1, border: 'none', borderRadius: 999, background: ORANGE, color: '#fff',
            padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}>Voir les bons plans&nbsp;→</button>
        </div>
      </div>
      </div>
    </ClientPortal>
  )
}
