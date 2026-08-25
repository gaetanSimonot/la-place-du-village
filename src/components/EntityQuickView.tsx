'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import TexteRiche from '@/components/TexteRiche'

type Kind = 'etablissement' | 'producteur'

interface Props {
  kind: Kind
  id: string
  onClose: () => void
}

interface EtabData {
  id: string
  nom: string
  type: string | null
  commune: string | null
  adresse: string | null
  photos: string[] | null
  description_courte: string | null
  description_longue: string | null
  contact_tel: string | null
  contact_whatsapp: string | null
  site_web: string | null
  note_google: number | null
  horaires: Record<string, string> | null
}

interface ProducerData {
  id: string
  nom: string
  commune: string | null
  adresse: string | null
  photos: string[] | null
  description_courte: string | null
  contact_tel: string | null
  contact_whatsapp: string | null
  site_web: string | null
  produits_disponibles: { nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null }[] | null
}

const JOURS = [
  ['lundi', 'Lundi'],
  ['mardi', 'Mardi'],
  ['mercredi', 'Mercredi'],
  ['jeudi', 'Jeudi'],
  ['vendredi', 'Vendredi'],
  ['samedi', 'Samedi'],
  ['dimanche', 'Dimanche'],
] as const

export default function EntityQuickView({ kind, id, onClose }: Props) {
  const [etab, setEtab] = useState<EtabData | null>(null)
  const [prod, setProd] = useState<ProducerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      if (kind === 'etablissement') {
        const { data } = await supabase
          .from('etablissements')
          .select('id, nom, type, commune, adresse, photos, description_courte, description_longue, contact_tel, contact_whatsapp, site_web, note_google, horaires')
          .eq('id', id)
          .maybeSingle()
        if (!cancelled) {
          setEtab(data as EtabData | null)
          setLoading(false)
        }
      } else {
        const { data } = await supabase
          .from('producers')
          .select('id, nom, commune, adresse, photos, description_courte, contact_tel, contact_whatsapp, site_web, produits_disponibles')
          .eq('id', id)
          .maybeSingle()
        if (!cancelled) {
          setProd(data as ProducerData | null)
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [kind, id])

  const photos = (kind === 'etablissement' ? etab?.photos : prod?.photos) ?? []
  const nom = kind === 'etablissement' ? etab?.nom : prod?.nom
  const commune = kind === 'etablissement' ? etab?.commune : prod?.commune
  const adresse = kind === 'etablissement' ? etab?.adresse : prod?.adresse
  const tel = kind === 'etablissement' ? etab?.contact_tel : prod?.contact_tel
  const whatsapp = kind === 'etablissement' ? etab?.contact_whatsapp : prod?.contact_whatsapp
  const web = kind === 'etablissement' ? etab?.site_web : prod?.site_web
  const descShort = kind === 'etablissement' ? etab?.description_courte : prod?.description_courte
  const descLong = kind === 'etablissement' ? etab?.description_longue : null
  const typeLabel = kind === 'etablissement'
    ? (etab?.type ? ETAB_TYPES[etab.type as keyof typeof ETAB_TYPES]?.label : null)
    : 'Producteur local'

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: 'rgba(26,18,9,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: 'calc(100dvh - 24px)',
          background: '#FDFAF5', borderRadius: 20,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -10px 32px rgba(26,18,9,0.4)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
        }}
      >
        {/* Grabber + close */}
        <div className="relative">
          <div className="mx-auto mt-2 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-bord bg-white text-texte shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading && (
          <div className="px-6 py-12 text-center text-[12px] text-texte-doux">Chargement…</div>
        )}

        {!loading && nom && (
          <div className="flex-1 overflow-y-auto">
            {/* Photo carousel simple */}
            {photos.length > 0 && (
              <div className="relative h-[200px] bg-bord/40">
                <img src={photos[photoIdx]} alt={nom} className="h-full w-full object-cover" />
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)}
                      aria-label="Photo précédente"
                      className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-texte shadow-md"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoIdx(i => (i + 1) % photos.length)}
                      aria-label="Photo suivante"
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-texte shadow-md"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-bold text-white">
                      {photoIdx + 1}/{photos.length}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* En-tête */}
            <div className="px-4 pt-4">
              {typeLabel && (
                <div className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-primary">
                  {typeLabel}
                </div>
              )}
              <h2
                className="mt-1 font-serif leading-[1.1] text-texte"
                style={{ fontSize: 24, letterSpacing: '-0.02em' }}
              >
                {nom}
              </h2>
              {commune && (
                <div className="mt-1 flex items-center gap-1 text-[12px] text-texte-doux">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                    <circle cx="12" cy="10" r="2.5"/>
                  </svg>
                  {adresse ?? commune}
                </div>
              )}
              {kind === 'etablissement' && etab?.note_google != null && (
                <div className="mt-1 flex items-center gap-1 text-[12px]">
                  <span className="text-[#D4A93C]">★</span>
                  <span className="font-bold text-texte">{etab.note_google.toFixed(1)}</span>
                  <span className="text-texte-doux">Google</span>
                </div>
              )}
            </div>

            {/* Description */}
            {(descShort || descLong) && (
              <div className="px-4 pt-3">
                {descShort && (
                  <TexteRiche texte={descShort} style={{ fontSize: 13, lineHeight: 1.5 }} />
                )}
                {descLong && descLong !== descShort && (
                  <TexteRiche texte={descLong} style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }} />
                )}
              </div>
            )}

            {/* Contact */}
            {(tel || whatsapp || web) && (
              <div className="px-4 pt-4">
                <div className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-texte-doux">
                  Contact
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {tel && (
                    <a href={`tel:${tel}`} className="flex items-center gap-2 rounded-[10px] border border-bord bg-white px-3 py-2 text-[13px] font-bold text-texte">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      {tel}
                    </a>
                  )}
                  {whatsapp && (
                    <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-[10px] border border-bord bg-white px-3 py-2 text-[13px] font-bold text-texte">
                      <span className="text-[#25D366]">💬</span> WhatsApp
                    </a>
                  )}
                  {web && (
                    <a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-[10px] border border-bord bg-white px-3 py-2 text-[13px] font-bold text-texte">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                      </svg>
                      Site web
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Horaires (etab only) */}
            {kind === 'etablissement' && etab?.horaires && Object.keys(etab.horaires).length > 0 && (
              <div className="px-4 pt-4">
                <div className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-texte-doux">
                  Horaires
                </div>
                <ul className="mt-2 divide-y divide-bordSoft rounded-[10px] border border-bordSoft bg-white">
                  {JOURS.map(([key, label]) => {
                    const h = etab.horaires?.[key]
                    return (
                      <li key={key} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                        <span className="font-semibold text-texte">{label}</span>
                        <span className="text-texte-doux">{h && h.trim() ? h : 'fermé'}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Produits (producer only) */}
            {kind === 'producteur' && prod?.produits_disponibles && prod.produits_disponibles.length > 0 && (
              <div className="px-4 pt-4">
                <div className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-texte-doux">
                  Produits disponibles
                </div>
                <ul className="mt-2 divide-y divide-bordSoft rounded-[10px] border border-bordSoft bg-white">
                  {prod.produits_disponibles.map((p, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 px-3 py-2 text-[12px]">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-texte">{p.nom}</span>
                        {p.periode_dispo && (
                          <span className="ml-2 text-[10px] text-texte-doux">{p.periode_dispo}</span>
                        )}
                      </div>
                      {p.prix_indicatif && (
                        <span className="shrink-0 font-bold text-accent">{p.prix_indicatif}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="h-6" />
          </div>
        )}

        {/* CTA bottom : revenir */}
        <div className="border-t border-bord bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[12px] border border-bord bg-creme py-2.5 text-[13px] font-bold text-texte"
          >
            Revenir à la promo
          </button>
        </div>
      </div>
    </div>
  )
}
