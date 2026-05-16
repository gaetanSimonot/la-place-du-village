'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

interface FaqSection {
  id: string
  emoji: string
  title: string
  body: React.ReactNode
}

export default function AppInfoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [contactOpen, setContactOpen] = useState(false)
  const [message, setMessage]         = useState('')
  const [sending, setSending]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const sections: FaqSection[] = [
    {
      id:    'about',
      emoji: '🌿',
      title: "C'est quoi La Place du Village ?",
      body: (
        <>
          <P>
            La Place du Village, c&apos;est le bouche-à-oreille local… organisé.
          </P>
          <P>
            <strong>Un événement vous passe sous les yeux ?</strong>
            <br />Prenez l&apos;affiche en photo, publiez-la, et l&apos;application l&apos;ajoute sur la carte du village.
          </P>
          <P>
            Un nouveau commerce ouvre ? Une brocante, un concert, une annonce, un producteur, un bon plan ?
            Tout le monde peut participer et faire vivre l&apos;application.
          </P>
          <P>
            <strong>Le but :</strong> créer un endroit vivant, simple et bien organisé, où les habitants retrouvent facilement tout ce qui se passe autour d&apos;eux sans devoir chercher partout.
          </P>
          <P>
            Petit à petit, de nouveaux outils verront le jour pour soutenir différentes dynamiques d&apos;entraide locale : faire connaître les producteurs du coin, aider les commerces locaux à être visibles, partager les bonnes initiatives, créer des opportunités et faciliter les échanges entre habitants.
          </P>
          <P>
            La Place du Village n&apos;a pas vocation à devenir un réseau social de plus. C&apos;est une application locale, vivante et construite avec les gens qui l&apos;utilisent.
          </P>
          <P style={{ fontStyle: 'italic', color: '#2D5A3D' }}>
            Une application à nous tous.<br />
            L&apos;application dont vous êtes le hérault 🌿
          </P>
        </>
      ),
    },
    {
      id:    'how',
      emoji: '🛠️',
      title: 'Comment ça marche ?',
      body: (
        <>
          <SubH>🌿 Habitants</SubH>
          <Bullets items={[
            'Publiez des événements, annonces et bons plans',
            'Consultez la carte locale et découvrez ce qui se passe autour de vous',
            'Achetez, vendez, échangez et participez aux enchères locales',
            'Partagez les initiatives et les infos du coin',
            'Soutenez les commerces et producteurs locaux',
          ]} />

          <SubH>💙 Professionnels</SubH>
          <Bullets items={[
            'Revendiquez votre établissement',
            'Gagnez en visibilité auprès des habitants',
            'Diffusez vos événements et vos actualités',
            'Créez des promotions réservées aux abonnés',
            'Accédez à des outils simples de mise en avant locale',
            'Marketplace producteur et ventes privées locales',
          ]} />
          <P style={{ fontSize: 11 }}>
            Les promotions disposent d&apos;un système de validation simple : les abonnés génèrent un QR code unique que vous validez depuis votre tableau de bord pour éviter les abus.
          </P>

          <SubH>🧑‍🌾 Producteurs</SubH>
          <P>
            Dictez simplement vos produits disponibles en vocal : l&apos;application crée automatiquement vos fiches produits et vous positionne sur la carte pour permettre aux habitants de venir acheter directement chez vous.
          </P>
        </>
      ),
    },
    {
      id:    'pricing',
      emoji: '💸',
      title: 'Combien ça coûte ?',
      body: (
        <>
          <SubH>🌿 Gratuit pour tous</SubH>
          <P>
            La grande majorité de l&apos;application est accessible gratuitement. Parce que le but est avant tout de créer un outil vivant et utile pour tout le territoire.
          </P>

          <SubH>💙 Avantages Habitants</SubH>
          <P>Pour les habitants qui souhaitent aller plus loin :</P>
          <Bullets items={[
            'promotions illimitées',
            'petites annonces illimitées',
            'accès anticipé aux enchères',
            'avantages réservés aux abonnés',
          ]} />
          <P style={{ fontSize: 11 }}>
            Un abonnement de soutien à petit prix, pensé pour être rentabilisé dès les premières offres utilisées : cafés offerts, réductions locales, bons plans chez les commerçants partenaires et autres surprises du village.
          </P>

          <SubH>🚀 Professionnels</SubH>
          <P>
            Certaines fonctionnalités avancées réservées aux commerces, artisans et producteurs font l&apos;objet d&apos;un abonnement simple et accessible : visibilité locale, mise en avant, outils de diffusion et marketplace.
          </P>
        </>
      ),
    },
    {
      id:    'legal',
      emoji: '⚖️',
      title: 'Mentions légales',
      body: (
        <>
          <P>
            La Place du Village est une application communautaire locale permettant aux habitants, associations, commerces, producteurs et acteurs du territoire de partager des informations, événements, annonces et initiatives locales.
          </P>
          <P>
            Les données utilisées dans l&apos;application servent uniquement à son fonctionnement et ne sont jamais revendues à des tiers.
          </P>
          <P>
            L&apos;application a été pensée comme un outil local indépendant, qui ne repose pas sur les grands réseaux sociaux ou les plateformes publicitaires traditionnelles, afin de permettre aux habitants et acteurs locaux de s&apos;organiser plus librement entre eux.
          </P>
          <P>
            Chaque utilisateur reste responsable des contenus qu&apos;il publie. Les contenus illégaux, frauduleux ou nuisibles peuvent être supprimés afin de préserver le bon fonctionnement et l&apos;esprit de la plateforme.
          </P>
          <P style={{ fontSize: 11, color: '#8A7A6A' }}>
            Pour toute demande concernant l&apos;application ou vos données : merci d&apos;utiliser le formulaire de contact disponible dans l&apos;application.
          </P>
        </>
      ),
    },
  ]

  // 1ère section ouverte par défaut
  const [openId, setOpenId] = useState<string>(sections[0].id)

  async function sendContact() {
    if (!message.trim() || sending) return
    if (!user) {
      onClose()
      openAuthModal('/')
      return
    }
    setSending(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSending(false); return }
    const res = await fetch('/api/support/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: message.trim() }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur envoi')
      setSending(false)
      return
    }
    const data = await res.json()
    onClose()
    if (data.conversation?.id) {
      router.push(`/support/${data.conversation.id}`)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.42)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 18px 44px', fontFamily: 'Inter, sans-serif', maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />

        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌿</div>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: '#1C1917', margin: '0 0 8px', letterSpacing: '-0.02em' }}>La Place du Village</h2>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#EC407A', backgroundColor: '#FEF0F5', borderRadius: 999, padding: '3px 12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Version Bêta</span>
          <p style={{ fontSize: 13, color: '#6B5E4E', margin: '12px 0 0', lineHeight: 1.6, fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
            L&apos;application dont vous êtes le hérault.
          </p>
        </div>

        {/* FAQ — accordion */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
          {sections.map(s => {
            const isOpen = openId === s.id
            return (
              <div key={s.id} style={{ backgroundColor: '#F8F4EE', borderRadius: 14, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenId(isOpen ? '' : s.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', border: 'none', cursor: 'pointer',
                    background: 'transparent', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{s.emoji}</span>
                  <span style={{ flex: 1, fontWeight: 800, fontSize: 14, color: '#1C1917' }}>
                    {s.title}
                  </span>
                  <span style={{
                    fontSize: 14, color: '#8A7A6A',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}>▾</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #EFE6D8' }}>
                    <div style={{ paddingTop: 14 }}>
                      {s.body}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Contacter l'équipe — formulaire support */}
        <div style={{ borderTop: '1px solid #F0EAE0', paddingTop: 18, marginBottom: 18 }}>
          {!contactOpen ? (
            <button
              onClick={() => setContactOpen(true)}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 14,
                backgroundColor: '#F8F4EE', border: '1px solid #E5DDD2',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 22 }}>💬</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
                  Contacter l&apos;équipe
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B5E4E' }}>
                  Question, bug, suggestion ? Écrivez-nous.
                </p>
              </div>
              <span style={{ fontSize: 18, color: '#2D5A3D' }}>→</span>
            </button>
          ) : (
            <div style={{ padding: '14px 16px', backgroundColor: '#F8F4EE', borderRadius: 14 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
                💬 Contacter l&apos;équipe
              </p>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Bonjour, j'aurais besoin d'aide pour…"
                rows={4}
                maxLength={2000}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12,
                  border: '1.5px solid #E5DDD2', backgroundColor: '#fff',
                  fontSize: 13, color: '#1C1917', fontFamily: 'inherit',
                  resize: 'none', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {error && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#C0392B' }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => { setContactOpen(false); setMessage(''); setError(null) }}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10,
                    backgroundColor: '#fff', border: '1.5px solid #E5DDD2',
                    color: '#6B5E4E', fontSize: 12, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >Annuler</button>
                <button
                  onClick={sendContact}
                  disabled={!message.trim() || sending}
                  style={{
                    flex: 2, padding: '10px 14px', borderRadius: 10,
                    backgroundColor: message.trim() && !sending ? '#2D5A3D' : '#D8D0C8',
                    color: '#fff', border: 'none',
                    fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
                    cursor: message.trim() && !sending ? 'pointer' : 'default',
                  }}
                >{sending ? 'Envoi…' : 'Envoyer'}</button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 10, color: '#A89B8C', textAlign: 'center', fontStyle: 'italic' }}>
                Vous recevrez une notification dès que l&apos;équipe vous répond.
              </p>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #F0EAE0', paddingTop: 18, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#AAA', margin: '0 0 16px', lineHeight: 1.6 }}>
            L&apos;app est en développement actif — vos retours sont précieux 🙏
          </p>
          <button onClick={onClose} style={{ width: '100%', padding: '14px', borderRadius: 999, backgroundColor: '#2D5A3D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            C&apos;est compris !
          </button>
        </div>
      </div>
    </>
  )
}

// ───────── Sous-composants typographiques ─────────

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 12.5, color: '#3C2C20', lineHeight: 1.6, margin: '0 0 10px', fontFamily: 'Lora, serif', ...style }}>
      {children}
    </p>
  )
}

function SubH({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 800, color: '#1C1917', margin: '14px 0 6px', fontFamily: 'Inter, sans-serif' }}>
      {children}
    </p>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12.5, color: '#3C2C20', lineHeight: 1.6, fontFamily: 'Lora, serif' }}>
      {items.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
    </ul>
  )
}
