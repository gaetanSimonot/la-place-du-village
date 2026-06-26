'use client'

/**
 * Écran de maintenance v1 — message figé (conversion du mockup
 * ref/maintenance/mockup-maintenance/Maintenance.html).
 *
 * Aucun état, aucune logique : c'est juste un visuel.
 * Le gating est dans MaintenanceGate.
 */
export default function MaintenanceScreen() {
  return (
    <>
      <style>{css}</style>
      <div className="pdv-maint-wrap">
        <div className="pdv-maint-card">
          <div className="pdv-maint-badge">
            <span className="filet" />
            <span className="dot" />
            <span>Maintenance en cours</span>
            <span className="filet" />
          </div>

          <img src="/maintenance-village.webp" alt="" className="pdv-maint-illu" />

          <h1 className="pdv-maint-h1">
            Le village est<br /><em>en travaux</em>.
          </h1>

          <div className="pdv-maint-rule">
            <span className="l" /><span className="dot">·</span><span className="l" />
          </div>

          <p className="pdv-maint-caveat">
            « On bichonne la Place. Elle revient vite, encore plus belle. »
          </p>

          <p className="pdv-maint-body">
            On profite de cette pause pour <strong>polir les pavés</strong>,
            repeindre les volets et brancher quelques <strong>nouveautés</strong>.
            Rouvre l&apos;app dans un instant — tout sera plus fluide, plus rapide,
            plus à toi.
          </p>

          <div className="pdv-maint-grid">
            <div className="pdv-maint-pill green">
              <div className="ic">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                  <line x1="9" y1="3" x2="9" y2="18" />
                  <line x1="15" y1="6" x2="15" y2="21" />
                </svg>
              </div>
              <div className="label">Carte vivante</div>
              <div className="sub">plus rapide</div>
            </div>
            <div className="pdv-maint-pill">
              <div className="ic">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="8" y1="3" x2="8" y2="7" />
                  <line x1="16" y1="3" x2="16" y2="7" />
                </svg>
              </div>
              <div className="label">Agenda</div>
              <div className="sub">repensé</div>
            </div>
            <div className="pdv-maint-pill amber">
              <div className="ic">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                  <path d="M18 14H8" /><path d="M15 18H8" /><path d="M17 6H8" /><path d="M17 10H8" />
                </svg>
              </div>
              <div className="label">Journal hebdo</div>
              <div className="sub">arrive lundi</div>
            </div>
          </div>

          <div className="pdv-maint-foot">
            <div className="brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              La Place du Village
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const css = `
  .pdv-maint-wrap, .pdv-maint-wrap *, .pdv-maint-wrap *::before, .pdv-maint-wrap *::after {
    box-sizing: border-box;
  }
  .pdv-maint-wrap {
    position: fixed; inset: 0; z-index: 9999;
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 32px 20px;
    font-family: var(--font-body), Inter, system-ui, sans-serif;
    color: #1A1209;
    background:
      radial-gradient(ellipse at 20% 0%, #FDF7EA 0%, transparent 55%),
      radial-gradient(ellipse at 80% 100%, #F5ECDA 0%, transparent 55%),
      linear-gradient(180deg, #FDFAF5 0%, #F5ECDA 100%);
    overflow-y: auto;
  }
  .pdv-maint-card {
    width: 100%; max-width: 560px;
    background: #FFFFFF;
    border: 1px solid #E8E0D4;
    border-radius: 24px;
    box-shadow: 0 24px 60px rgba(26,18,9,0.12), 0 4px 14px rgba(26,18,9,0.05);
    padding: 44px 36px 36px;
    text-align: center;
    position: relative;
  }
  .pdv-maint-badge {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.32em;
    text-transform: uppercase; color: #C84B2F;
    margin-bottom: 24px;
  }
  .pdv-maint-badge .filet { width: 28px; height: 1px; background: #C84B2F; opacity: 0.45; }
  .pdv-maint-badge .dot {
    width: 8px; height: 8px; border-radius: 50%; background: #C84B2F;
    box-shadow: 0 0 0 4px rgba(200,75,47,0.18);
    animation: pdv-maint-pulse 2s ease-in-out infinite;
  }
  @keyframes pdv-maint-pulse {
    0%,100% { box-shadow: 0 0 0 4px rgba(200,75,47,0.18); }
    50%     { box-shadow: 0 0 0 7px rgba(200,75,47,0.06); }
  }
  .pdv-maint-illu {
    width: 78%; max-width: 360px; height: auto;
    margin: 0 auto 14px; display: block;
    mix-blend-mode: multiply;
    user-select: none; pointer-events: none;
  }
  .pdv-maint-h1 {
    margin: 18px 0 0;
    font-family: var(--font-display), "DM Serif Display", Georgia, serif;
    font-size: 38px; line-height: 1.04;
    letter-spacing: -0.025em;
    color: #1A1209;
  }
  .pdv-maint-h1 em { color: #C84B2F; font-style: italic; }
  .pdv-maint-rule {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin: 18px auto 14px;
  }
  .pdv-maint-rule .l { width: 32px; height: 1px; background: #1A1209; opacity: 0.35; }
  .pdv-maint-rule .dot {
    font-family: var(--font-display), Georgia, serif;
    font-size: 14px; color: #C84B2F; line-height: 1;
  }
  .pdv-maint-caveat {
    margin: 0;
    font-family: Georgia, "Crimson Pro", serif;
    font-style: italic; font-weight: 500;
    font-size: 17px; color: #5B3F1F; line-height: 1.45;
  }
  .pdv-maint-body {
    margin: 18px auto 0; max-width: 430px;
    font-size: 15px; line-height: 1.65; color: #3C2E20;
  }
  .pdv-maint-body strong { color: #1A1209; font-weight: 700; }
  .pdv-maint-grid {
    margin-top: 28px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  }
  .pdv-maint-pill {
    padding: 12px 10px;
    background: #FDFAF5;
    border: 1px solid #E8E0D4;
    border-radius: 14px;
    text-align: center;
  }
  .pdv-maint-pill .ic {
    width: 32px; height: 32px; border-radius: 9px;
    background: #FFF0E5; color: #C84B2F;
    display: inline-flex; align-items: center; justify-content: center;
    margin-bottom: 8px;
  }
  .pdv-maint-pill.green .ic { background: #E8F2EB; color: #2D5A3D; }
  .pdv-maint-pill.amber .ic { background: #F0EBE3; color: #7C5C3B; }
  .pdv-maint-pill .label {
    font-size: 11.5px; font-weight: 700; color: #1A1209;
    letter-spacing: -0.01em; line-height: 1.25;
  }
  .pdv-maint-pill .sub {
    font-size: 10.5px; color: #7A6A5A; margin-top: 3px;
    font-family: Georgia, serif; font-style: italic;
  }
  .pdv-maint-foot {
    margin-top: 30px; padding-top: 22px;
    border-top: 1px solid #F0EAE0;
    display: flex; align-items: center; justify-content: center;
  }
  .pdv-maint-foot .brand {
    font-family: var(--font-display), Georgia, serif;
    font-size: 18px; color: #2D5A3D; letter-spacing: -0.01em;
    display: inline-flex; align-items: center; gap: 8px;
  }
  @media (max-width: 520px) {
    .pdv-maint-card { padding: 34px 22px 28px; border-radius: 20px; }
    .pdv-maint-h1 { font-size: 30px; }
    .pdv-maint-body { font-size: 14px; }
    .pdv-maint-grid { gap: 8px; }
    .pdv-maint-pill { padding: 10px 8px; }
  }
`
