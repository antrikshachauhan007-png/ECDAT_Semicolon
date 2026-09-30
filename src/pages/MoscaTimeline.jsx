import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import ProfileMenu from '../components/ProfileMenu.jsx';
import { useScan } from '../context/ScanContext.jsx';
import { BREACH_STATUS_LABEL, BREACH_STATUS_COLOR } from '../utils/mosca.js';
import {
  Sun, Moon, PanelLeft, ShieldAlert, ArrowRight, RotateCcw, Info, KeyRound,
} from 'lucide-react';

function BreachBar({ requiredUntil, qday, status, scaleMax, height = 34 }) {
  const pct = (v) => Math.max(0, Math.min(100, (v / scaleMax) * 100));
  const bandLeft = pct(qday.p25);
  const bandWidth = Math.max(0, pct(qday.p75) - pct(qday.p25));
  return (
    <div className="mo-bar-track" style={{ height }}>
      <div className="mo-bar-band" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
      <div className="mo-bar-marker" style={{ left: `${pct(qday.p50)}%` }} />
      <div className={`mo-bar-required status-${status}`} style={{ width: `${pct(requiredUntil)}%` }} />
    </div>
  );
}

export default function MoscaTimeline() {
  const {
    theme, toggleTheme, sidebarOpen, toggleSidebar,
    scanState, hndlList, signatureOnlyList,
    portfolioShelfLife, setPortfolioShelfLife, portfolioMigrationYears, setPortfolioMigrationYears,
    qdayDist, setQdayDist, resetMoscaOverrides,
    portfolioBreach,
  } = useScan();

  const scaleMax = useMemo(() => {
    const raw = Math.max(qdayDist.p75, portfolioBreach.requiredUntil, 5);
    return Math.ceil(raw * 1.15);
  }, [portfolioBreach, qdayDist]);

  return (
    <div className="mo-shell" data-theme={theme}>
      <style>{`
        .mo-shell {
          --bg: #0a0d12; --surface-1: #12161d; --surface-2: #171c25;
          --border: #262e3a; --border-soft: #1b2129;
          --text-primary: #e8eaef; --text-secondary: #8a93a3; --text-faint: #545e6e;
          --gold: #c9a227; --gold-soft: rgba(201,162,39,0.14);
          --crimson: #c1503a; --teal: #3fb8af;
          font-family: 'Switzer', 'Inter', system-ui, sans-serif;
          background: var(--bg); color: var(--text-primary);
          min-height: 100vh; display: flex; width: 100%; box-sizing: border-box;
        }
        .mo-shell[data-theme="light"] {
          --bg: #f4f2ec; --surface-1: #ffffff; --surface-2: #ece9e0;
          --border: #dad6c9; --border-soft: #e4e1d6;
          --text-primary: #1b1d22; --text-secondary: #5b5e66; --text-faint: #8b8d93;
          --gold: #9c7a14; --gold-soft: rgba(156,122,20,0.12);
          --crimson: #a63f2b; --teal: #227a70;
        }
        .mo-shell *, .mo-shell *::before, .mo-shell *::after { box-sizing: border-box; }
        .mo-display { font-family: 'Clash Display', 'Switzer', sans-serif; }
        .mo-mono { font-family: 'IBM Plex Mono', monospace; }
        .mo-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .mo-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 28px; border-bottom: 1px solid var(--border-soft);
          position: sticky; top: 0; background: var(--bg); z-index: 5;
        }
        .mo-topbar h1 { font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
        .mo-top-actions { display: flex; align-items: center; gap: 14px; }
        .mo-theme-btn {
          width: 32px; height: 32px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--surface-1); color: var(--text-secondary); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .mo-theme-btn:hover { color: var(--gold); border-color: var(--gold); }
        .mo-content { padding: 22px 28px 60px; overflow-x: hidden; }
        .mo-empty {
          border: 1px dashed var(--border); border-radius: 10px; padding: 60px 24px;
          text-align: center; color: var(--text-secondary);
        }
        .mo-empty h2 { color: var(--text-primary); font-size: 17px; margin: 0 0 10px; }
        .mo-empty p { font-size: 13.5px; max-width: 440px; margin: 0 auto 18px; line-height: 1.6; }
        .mo-empty-btn {
          display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: #191308;
          font-weight: 600; font-size: 13.5px; padding: 10px 20px; border-radius: 7px; text-decoration: none;
        }
        .mo-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 18px; margin-bottom: 14px; }
        .mo-card h2 { font-size: 14px; font-weight: 500; margin: 0 0 6px; }
        .mo-card-sub { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 14px; line-height: 1.55; }

        .mo-formula { font-size: 13px; text-align: center; padding: 10px; background: var(--surface-2); border-radius: 8px; margin-bottom: 4px; }
        .mo-formula b { color: var(--gold); }

        .mo-qday-row { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)) auto; gap: 12px; align-items: end; }
        .mo-field label { display: block; font-size: 11px; color: var(--text-faint); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
        .mo-field input {
          width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px;
          padding: 8px 10px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 13px;
        }
        .mo-reset-btn {
          display: flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 9px 14px; border-radius: 7px;
          border: 1px solid var(--border); background: var(--surface-2); color: var(--text-secondary); cursor: pointer; font-family: inherit; white-space: nowrap;
        }
        .mo-reset-btn:hover { color: var(--gold); border-color: var(--gold); }
        .mo-qday-note { display: flex; gap: 7px; font-size: 11.5px; color: var(--text-faint); margin-top: 10px; line-height: 1.6; }

        .mo-bar-track { position: relative; border-radius: 8px; background: var(--surface-2); overflow: hidden; }
        .mo-bar-band { position: absolute; top: 0; bottom: 0; background: rgba(201,162,39,0.20); }
        .mo-bar-marker { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--gold); }
        .mo-bar-required { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 8px 0 0 8px; opacity: 0.9; }
        .status-safe { background: var(--teal); }
        .status-breach-possible { background: var(--gold); }
        .status-breach-median { background: #d9772e; }
        .status-breach-likely { background: var(--crimson); }

        .mo-rank-row { display: grid; grid-template-columns: 150px 1fr 130px; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border-soft); }
        .mo-rank-row:first-of-type { border-top: none; }
        .mo-rank-asset { font-size: 12.5px; font-weight: 600; }
        .mo-rank-status { font-size: 11.5px; text-align: right; white-space: nowrap; }

        .mo-asset-card { border: 1px solid var(--border-soft); border-radius: 10px; padding: 18px; margin-bottom: 14px; background: var(--surface-1); transition: border-color 0.15s ease; }
        .mo-asset-card:hover { border-color: var(--border); }
        .mo-asset-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .mo-asset-title { font-size: 15px; font-weight: 600; margin: 0 0 3px; }
        .mo-asset-sub { font-size: 12px; color: var(--text-faint); margin: 0; }
        .mo-asset-status { font-size: 11.5px; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }

        .mo-sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 14px 0; }
        .mo-slider-field label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
        .mo-slider-field label b { color: var(--text-primary); }
        .mo-slider-field input[type="range"] { width: 100%; accent-color: var(--gold); }

        .mo-numbers-row { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); margin-top: 10px; }
        .mo-numbers-row b { color: var(--text-primary); }
        .mo-explain { font-size: 12.5px; color: var(--text-secondary); line-height: 1.6; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-soft); }

        .mo-sig-list { display: flex; flex-direction: column; gap: 8px; }
        .mo-sig-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-secondary); padding: 8px 0; border-top: 1px solid var(--border-soft); }
        .mo-sig-row:first-of-type { border-top: none; }
        .mo-sig-row svg { flex-shrink: 0; color: var(--text-faint); }

        @media (max-width: 980px) {
          .mo-qday-row { grid-template-columns: 1fr 1fr; }
          .mo-sliders { grid-template-columns: 1fr; }
          .mo-rank-row { grid-template-columns: 110px 1fr 90px; }
        }
      `}</style>

      <Sidebar activeKey="mosca" />

      <div className="mo-main">
        <header className="mo-topbar">
          <h1 className="mo-display">Mosca Timeline</h1>
          <div className="mo-top-actions">
            <button className="mo-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button className="mo-theme-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <PanelLeft size={15} />
            </button>
            <ProfileMenu />
          </div>
        </header>

        <div className="mo-content">
          {scanState !== 'complete' ? (
            <div className="mo-empty">
              <ShieldAlert size={30} style={{ color: 'var(--text-faint)', marginBottom: 14 }} />
              <h2>No scan loaded yet</h2>
              <p>The Mosca Timeline models breach windows for this scan's findings. Run a scan on the dashboard first.</p>
              <Link to="/dashboard#sec-upload" className="mo-empty-btn">Go scan a file <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <>
              <div className="mo-card">
                <h2>Mosca's inequality</h2>
                <div className="mo-formula mo-mono">
                  <b>X</b> (data shelf-life) + <b>Y</b> (migration time) &gt; <b>Z</b> (time to Q-Day) → breach
                </div>
                <p className="mo-card-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                  Z is modeled as a range, not a date — quantum-threat timeline estimates vary widely even among
                  experts. Everything below recomputes live: drag Y down (faster migration) and watch the breach
                  window shrink or close.
                </p>
              </div>

              <div className="mo-card">
                <h2>Q-Day distribution (years from today)</h2>
                <p className="mo-card-sub">
                  Illustrative — shaped like the kind of range published expert-survey estimates (e.g. the Global
                  Risk Institute's Quantum Threat Timeline) produce. Replace with your own organization's risk-register
                  numbers.
                </p>
                <div className="mo-qday-row">
                  <div className="mo-field">
                    <label>P25 — earliest plausible</label>
                    <input type="number" min="1" max="60" value={qdayDist.p25}
                      onChange={(e) => setQdayDist({ ...qdayDist, p25: +e.target.value })} />
                  </div>
                  <div className="mo-field">
                    <label>P50 — median estimate</label>
                    <input type="number" min="1" max="60" value={qdayDist.p50}
                      onChange={(e) => setQdayDist({ ...qdayDist, p50: +e.target.value })} />
                  </div>
                  <div className="mo-field">
                    <label>P75 — later / optimistic</label>
                    <input type="number" min="1" max="60" value={qdayDist.p75}
                      onChange={(e) => setQdayDist({ ...qdayDist, p75: +e.target.value })} />
                  </div>
                  <button className="mo-reset-btn" onClick={resetMoscaOverrides}><RotateCcw size={13} /> Reset all</button>
                </div>
                <div className="mo-qday-note"><Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  Keep P25 ≤ P50 ≤ P75 for the band below to render sensibly. Resetting also clears every per-asset override below.
                </div>
              </div>

              <div className="mo-asset-card">
                <div className="mo-asset-head">
                  <div>
                    <h3 className="mo-asset-title">Full inventory — breach window</h3>
                    <p className="mo-asset-sub mo-mono">One common X and Y for every HNDL-relevant asset, not a value per artifact.</p>
                  </div>
                  <span className="mo-asset-status" style={{ color: BREACH_STATUS_COLOR[portfolioBreach.status], background: `${BREACH_STATUS_COLOR[portfolioBreach.status]}22` }}>
                    {BREACH_STATUS_LABEL[portfolioBreach.status]}
                  </span>
                </div>

                <BreachBar requiredUntil={portfolioBreach.requiredUntil} qday={qdayDist} status={portfolioBreach.status} scaleMax={scaleMax} />

                <div className="mo-sliders">
                  <div className="mo-slider-field">
                    <label>X — data shelf-life <b>{portfolioShelfLife} yrs</b></label>
                    <input type="range" min="0" max="20" step="1" value={portfolioShelfLife}
                      onChange={(e) => setPortfolioShelfLife(+e.target.value)} />
                  </div>
                  <div className="mo-slider-field">
                    <label>Y — migration time <b>{portfolioMigrationYears.toFixed(1)} yrs</b></label>
                    <input type="range" min="0" max="8" step="0.1" value={portfolioMigrationYears}
                      onChange={(e) => setPortfolioMigrationYears(+e.target.value)} />
                  </div>
                </div>

                <div className="mo-numbers-row">
                  <span>Required safe until: <b>{portfolioBreach.requiredUntil.toFixed(1)}y</b></span>
                  <span>Breach @ P25: <b>{portfolioBreach.atP25 > 0 ? `+${portfolioBreach.atP25.toFixed(1)}y` : 'safe'}</b></span>
                  <span>Breach @ P50 (Z): <b>{portfolioBreach.atP50 > 0 ? `+${portfolioBreach.atP50.toFixed(1)}y` : 'safe'}</b></span>
                  <span>Breach @ P75: <b>{portfolioBreach.atP75 > 0 ? `+${portfolioBreach.atP75.toFixed(1)}y` : 'safe'}</b></span>
                </div>
                <p className="mo-explain">
                  The full inventory ({portfolioShelfLife} yrs shelf-life + {portfolioMigrationYears.toFixed(1)} yrs to migrate ={' '}
                  {portfolioBreach.requiredUntil.toFixed(1)} yrs) needs to stay confidential until year{' '}
                  {portfolioBreach.requiredUntil.toFixed(1)}. Q-Day (Z) is estimated between {qdayDist.p25} and{' '}
                  {qdayDist.p75} years out (median {qdayDist.p50}). {portfolioBreach.atP50 > 0
                    ? `That's a breach of roughly ${portfolioBreach.atP50.toFixed(1)} years in the median scenario — migrating faster (drag Y left) shrinks this window.`
                    : 'That comes in before the median Q-Day estimate, so the inventory is on track at the current pace.'}
                </p>
              </div>

              <div className="mo-card">
                <h2>Findings in scope</h2>
                <p className="mo-card-sub">
                  Every HNDL-relevant asset feeding the common window above — shown for context, not as separate
                  sliders.
                </p>
                {hndlList.map((f) => (
                  <div className="mo-rank-row" key={f.id}>
                    <span className="mo-rank-asset mo-mono">{f.asset}</span>
                    <span className="mo-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.algorithm}</span>
                    <span className="mo-rank-status" style={{ color: 'var(--text-faint)' }}>
                      {f.dataClassification?.shelfLifeYears ?? '—'}y shelf-life
                    </span>
                  </div>
                ))}
              </div>

              {!!signatureOnlyList.length && (
                <div className="mo-card">
                  <h2>Signature-only findings — not applicable to HNDL</h2>
                  <p className="mo-card-sub">
                    These keys sign rather than encrypt, so there's no stored ciphertext for an adversary to harvest.
                    Their risk is future signature forgery once a quantum computer exists, not retroactive decryption
                    — a different problem the breach-window model above doesn't (and shouldn't) apply to.
                  </p>
                  <div className="mo-sig-list">
                    {signatureOnlyList.map((f) => (
                      <div className="mo-sig-row" key={f.id}>
                        <KeyRound size={15} />
                        <span className="mo-mono">{f.asset}</span>
                        <span>— {f.algorithm}</span>
                        <Link to="/remediator" style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: 12 }}>View in Remediator →</Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
