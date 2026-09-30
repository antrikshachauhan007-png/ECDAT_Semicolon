import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import Sidebar from '../components/Sidebar.jsx';
import ProfileMenu from '../components/ProfileMenu.jsx';
import { useScan } from '../context/ScanContext.jsx';
import {
  BAND_LABEL, NIST_800_53_CONTROLS, CNSA2_MILESTONES,
} from '../data/findings.js';
import {
  Sun, Moon, PanelLeft, ShieldAlert, ArrowRight, Download, FileJson,
  FileSpreadsheet, FileArchive, ShieldCheck, Lock, ChevronDown, ChevronRight,
} from 'lucide-react';

const CLASSICAL_BITS = { 'RSA-2048': 112, 'RSA-1024': 80, 'ECDSA P-256': 128, 'AES-256-GCM': 256, 'AES-256': 256 };
const PQC_CATEGORY = { 'ML-KEM-768': 3, 'ML-KEM-1024': 5, 'ML-DSA-65': 3, 'SLH-DSA': 1 };

function inferAssetType(f) {
  if (f.type === 'Certificate') return 'certificate';
  if (f.type === 'SSH key' || f.type === 'Key') return 'related-crypto-material';
  if (f.type === 'Protocol') return 'protocol';
  return 'algorithm';
}
function inferPrimitive(f) {
  if (f.vulnerableSurface === 'signature') return 'signature';
  if (f.vulnerableSurface === 'key-exchange') return 'key-agree';
  if (f.vulnerableSurface === 'symmetric') return 'block-cipher';
  return 'other';
}

// A pragmatic subset of the CycloneDX 1.6 crypto-asset extension — enough
// structure (assetType, algorithmProperties, evidence, extension properties)
// to be a genuine CBOM rather than a flat ad-hoc dump, without claiming to
// pass a strict schema validator we have no way to run here.
function buildCbom(findings, meta) {
  const serial = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `generated-${Date.now()}`;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${serial}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: 'Semicolon', name: 'Semicolon Cryptographic Discovery & Analysis Tool', version: '0.1.0' }],
      component: { type: 'application', name: meta.fileName || 'scanned-codebase', version: '1.0.0' },
      properties: [
        { name: 'semicolon:readinessScore', value: String(meta.readinessScore) },
        { name: 'semicolon:worstCaseBreachYearsP50', value: meta.worstBreach ? String(meta.worstBreach.atP50) : 'n/a' },
      ],
    },
    components: findings.map((f) => ({
      type: 'cryptographic-asset',
      'bom-ref': f.id,
      name: f.asset,
      cryptoProperties: {
        assetType: inferAssetType(f),
        algorithmProperties: {
          primitive: inferPrimitive(f),
          parameterSetIdentifier: f.algorithm,
          executionEnvironment: 'software-plain-ram',
          ...(CLASSICAL_BITS[f.algorithm] ? { classicalSecurityLevel: CLASSICAL_BITS[f.algorithm] } : {}),
          nistQuantumSecurityLevel: f.shorVulnerable ? 0 : (PQC_CATEGORY[(f.recommendation?.primary || '').split(' ')[0]] ?? null),
        },
      },
      evidence: { occurrences: [{ location: f.location }] },
      properties: [
        { name: 'semicolon:riskBand', value: f.band },
        { name: 'semicolon:confidence', value: String(f.confidence) },
        { name: 'semicolon:recommendedPrimary', value: f.recommendation?.primary || 'n/a' },
        { name: 'semicolon:recommendedFallback', value: f.recommendation?.fallback || 'n/a' },
      ],
    })),
  };
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function sha256Hex(text) {
  if (!(typeof crypto !== 'undefined' && crypto.subtle)) return 'unavailable-in-this-context';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildExecutiveNarrative(ctx) {
  const { readinessScore, shorCount, findings, worstBreach, activeFileName, activeScanDate } = ctx;
  const lines = [
    `Executive summary — ${activeFileName || 'scan'} (${activeScanDate || 'undated'})`,
    '',
    `This scan found ${findings.length} cryptographic assets, ${shorCount} of which rely on algorithms a `
      + `future quantum computer could break (not today's classical attackers). Overall PQC readiness is `
      + `${readinessScore} out of 100.`,
    '',
    worstBreach && worstBreach.atP50 > 0
      ? `Across the full inventory, at the median Q-Day estimate, the required confidentiality `
        + `window is breached by roughly ${worstBreach.atP50.toFixed(1)} years — meaning data that must stay secret may not, `
        + `unless migration is accelerated. See the Mosca Timeline for the breach-window detail.`
      : `The full inventory does not currently breach its required confidentiality window at the median Q-Day estimate, `
        + `though pessimistic-scenario exposure should still be reviewed on the Mosca Timeline.`,
    '',
    'This is a risk-informed estimate for planning purposes, not a guarantee — confirm findings with expert review before acting on them.',
  ];
  return lines.join('\n');
}

export default function ComplianceReports() {
  const {
    theme, toggleTheme, sidebarOpen, toggleSidebar,
    scanState, findings, actionable, readinessScore, shorCount,
    activeFileName, activeScanDate, remediationStatus, patchChoice,
    worstBreach, reportHistory, addReportRecord,
  } = useScan();

  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [signing, setSigning] = useState(false);
  const [bundling, setBundling] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(true);

  const cbom = useMemo(
    () => buildCbom(findings, { fileName: activeFileName, readinessScore, worstBreach }),
    [findings, activeFileName, readinessScore, worstBreach]
  );

  const downloadCbom = () => downloadBlob(
    `semicolon-cbom-${(activeFileName || 'scan').replace(/[^a-z0-9.-]/gi, '_')}.json`,
    JSON.stringify(cbom, null, 2), 'application/json'
  );

  const downloadExecutivePdf = () => {
    const narrative = buildExecutiveNarrative({ readinessScore, shorCount, findings, worstBreach, activeFileName, activeScanDate });
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Semicolon — Executive PQC Audit Brief', 14, 20);
    doc.setFontSize(9);
    let y = 34;
    narrative.split('\n').forEach((line) => {
      const wrapped = doc.splitTextToSize(line || ' ', 180);
      wrapped.forEach((w) => { if (y > 280) { doc.addPage(); y = 20; } doc.text(w, 14, y); y += 5.5; });
    });
    doc.save(`semicolon-executive-brief-${(activeFileName || 'scan').replace(/[^a-z0-9.-]/gi, '_')}.pdf`);
  };

  const downloadEngineeringCsv = () => {
    const header = ['id', 'asset', 'algorithm', 'band', 'confidence', 'location', 'effortHours', 'breakingChangeRisk', 'patchChoice', 'status'];
    const rows = actionable.map((f) => [
      f.id, f.asset, f.algorithm, f.band, f.confidence,
      f.location, f.remediation?.effortHours ?? '', f.remediation?.breakingChangeRisk ?? '',
      patchChoice[f.id] || 'bridge', remediationStatus[f.id] || 'pending',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(`semicolon-engineering-detail-${(activeFileName || 'scan').replace(/[^a-z0-9.-]/gi, '_')}.csv`, csv, 'text/csv');
  };

  const downloadEvidenceBundle = async () => {
    setBundling(true);
    try {
      const zip = new JSZip();
      const narrative = buildExecutiveNarrative({ readinessScore, shorCount, findings, worstBreach, activeFileName, activeScanDate });
      const findingsJson = JSON.stringify(findings, null, 2);
      const cbomJson = JSON.stringify(cbom, null, 2);
      zip.file('findings.json', findingsJson);
      zip.file('cbom.json', cbomJson);
      zip.file('executive-summary.txt', narrative);

      const manifest = {
        generatedAt: new Date().toISOString(),
        tool: 'Semicolon Cryptographic Discovery & Analysis Tool v0.1.0',
        scanFile: activeFileName, scanDate: activeScanDate,
        files: [
          { name: 'findings.json', sha256: await sha256Hex(findingsJson) },
          { name: 'cbom.json', sha256: await sha256Hex(cbomJson) },
          { name: 'executive-summary.txt', sha256: await sha256Hex(narrative) },
        ],
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `semicolon-evidence-bundle-${(activeFileName || 'scan').replace(/[^a-z0-9.-]/gi, '_')}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBundling(false);
    }
  };

  const signReport = async () => {
    if (!signerName.trim() || !signerRole.trim()) return;
    setSigning(true);
    try {
      const canonical = JSON.stringify({
        timestamp: new Date().toISOString(), readinessScore, shorCount,
        worstBreachP50: worstBreach?.atP50 ?? null, findingCount: findings.length,
        signer: signerName.trim(), role: signerRole.trim(),
      });
      const hash = await sha256Hex(canonical);
      addReportRecord({
        id: `rep-${Date.now()}`, kind: 'attestation', timestamp: new Date().toLocaleString(),
        signer: signerName.trim(), role: signerRole.trim(), hash,
      });
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="cr-shell" data-theme={theme}>
      <style>{`
        .cr-shell {
          --bg: #0a0d12; --surface-1: #12161d; --surface-2: #171c25;
          --border: #262e3a; --border-soft: #1b2129;
          --text-primary: #e8eaef; --text-secondary: #8a93a3; --text-faint: #545e6e;
          --gold: #c9a227; --gold-soft: rgba(201,162,39,0.14);
          --crimson: #c1503a; --teal: #3fb8af;
          font-family: 'Switzer', 'Inter', system-ui, sans-serif;
          background: var(--bg); color: var(--text-primary);
          min-height: 100vh; display: flex; width: 100%; box-sizing: border-box;
        }
        .cr-shell[data-theme="light"] {
          --bg: #f4f2ec; --surface-1: #ffffff; --surface-2: #ece9e0;
          --border: #dad6c9; --border-soft: #e4e1d6;
          --text-primary: #1b1d22; --text-secondary: #5b5e66; --text-faint: #8b8d93;
          --gold: #9c7a14; --gold-soft: rgba(156,122,20,0.12);
          --crimson: #a63f2b; --teal: #227a70;
        }
        .cr-shell *, .cr-shell *::before, .cr-shell *::after { box-sizing: border-box; }
        .cr-display { font-family: 'Clash Display', 'Switzer', sans-serif; }
        .cr-mono { font-family: 'IBM Plex Mono', monospace; }
        .cr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cr-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 28px; border-bottom: 1px solid var(--border-soft);
          position: sticky; top: 0; background: var(--bg); z-index: 5;
        }
        .cr-topbar h1 { font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
        .cr-top-actions { display: flex; align-items: center; gap: 14px; }
        .cr-theme-btn {
          width: 32px; height: 32px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--surface-1); color: var(--text-secondary); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .cr-theme-btn:hover { color: var(--gold); border-color: var(--gold); }
        .cr-content { padding: 22px 28px 60px; overflow-x: hidden; }
        .cr-empty {
          border: 1px dashed var(--border); border-radius: 10px; padding: 60px 24px;
          text-align: center; color: var(--text-secondary);
        }
        .cr-empty h2 { color: var(--text-primary); font-size: 17px; margin: 0 0 10px; }
        .cr-empty p { font-size: 13.5px; max-width: 440px; margin: 0 auto 18px; line-height: 1.6; }
        .cr-empty-btn {
          display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: #191308;
          font-weight: 600; font-size: 13.5px; padding: 10px 20px; border-radius: 7px; text-decoration: none;
        }
        .cr-local-note {
          display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-faint);
          background: var(--surface-2); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
        }
        .cr-stats-row { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-bottom: 14px; }
        .cr-stat-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 16px; }
        .cr-stat-label { font-size: 12px; color: var(--text-secondary); margin: 0 0 8px; }
        .cr-stat-value { font-size: 24px; font-weight: 600; margin: 0; }
        .cr-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 18px; margin-bottom: 14px; }
        .cr-card h2 { font-size: 14px; font-weight: 500; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
        .cr-card-sub { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 14px; line-height: 1.55; }

        .cr-report-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
        .cr-report-card { border: 1px solid var(--border-soft); border-radius: 10px; padding: 16px; background: var(--surface-2); transition: border-color 0.15s ease, transform 0.15s ease; }
        .cr-report-card:hover { border-color: var(--gold); transform: translateY(-2px); }
        .cr-report-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--gold-soft); color: var(--gold); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
        .cr-report-title { font-size: 13.5px; font-weight: 600; margin: 0 0 6px; }
        .cr-report-desc { font-size: 12px; color: var(--text-secondary); margin: 0 0 14px; line-height: 1.55; }
        .cr-report-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 9px 14px;
          border-radius: 7px; font-size: 12.5px; font-weight: 500; cursor: pointer; font-family: inherit;
          border: 1px solid var(--gold); background: var(--gold); color: #191308;
        }
        .cr-report-btn:hover { filter: brightness(1.07); }
        .cr-report-btn:disabled { opacity: 0.6; cursor: wait; }

        .cr-toggle-head { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
        .cr-table-wrap { overflow-x: auto; margin-top: 12px; }
        .cr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .cr-table th { text-align: left; font-weight: 500; color: var(--text-secondary); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; padding: 7px 10px; border-bottom: 1px solid var(--border-soft); white-space: nowrap; }
        .cr-table td { padding: 9px 10px; border-bottom: 1px solid var(--border-soft); }
        .cr-status-pill { font-size: 10.5px; padding: 2px 8px; border-radius: 5px; }
        .cr-status-pill.covered { color: var(--teal); background: rgba(63,184,175,0.14); }
        .cr-status-pill.gap { color: var(--crimson); background: rgba(193,80,58,0.14); }
        .cr-disclaimer { font-size: 11.5px; color: var(--text-faint); margin-top: 10px; line-height: 1.6; }

        .cr-sign-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
        .cr-field label { display: block; font-size: 11px; color: var(--text-faint); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
        .cr-field input {
          width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px;
          padding: 8px 10px; color: var(--text-primary); font-size: 13px; font-family: inherit;
        }
        .cr-sign-btn {
          padding: 9px 18px; border-radius: 7px; border: 1px solid var(--gold); background: var(--gold);
          color: #191308; font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap;
        }
        .cr-sign-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .cr-history-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border-soft); font-size: 12.5px; flex-wrap: wrap; }
        .cr-history-row:first-of-type { border-top: none; }
        .cr-history-hash { color: var(--text-faint); }

        @media (max-width: 980px) {
          .cr-stats-row { grid-template-columns: 1fr; }
          .cr-report-grid { grid-template-columns: 1fr; }
          .cr-sign-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <Sidebar activeKey="compliance" />

      <div className="cr-main">
        <header className="cr-topbar">
          <h1 className="cr-display">Compliance &amp; CBOM Reports</h1>
          <div className="cr-top-actions">
            <button className="cr-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button className="cr-theme-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <PanelLeft size={15} />
            </button>
            <ProfileMenu />
          </div>
        </header>

        <div className="cr-content">
          {scanState !== 'complete' ? (
            <div className="cr-empty">
              <ShieldAlert size={30} style={{ color: 'var(--text-faint)', marginBottom: 14 }} />
              <h2>No scan loaded yet</h2>
              <p>Reports are generated from a completed scan's findings. Run a scan on the dashboard first.</p>
              <Link to="/dashboard#sec-upload" className="cr-empty-btn">Go scan a file <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <>
              <div className="cr-local-note"><Lock size={13} /> All reports below are generated entirely in this browser from the current scan — nothing is uploaded to an external service.</div>

              <div className="cr-stats-row">
                <div className="cr-stat-card"><p className="cr-stat-label">Readiness score</p><p className="cr-stat-value cr-display">{readinessScore}/100</p></div>
                <div className="cr-stat-card"><p className="cr-stat-label">Quantum-vulnerable assets</p><p className="cr-stat-value cr-display" style={{ color: 'var(--crimson)' }}>{shorCount}</p></div>
                <div className="cr-stat-card">
                  <p className="cr-stat-label">Worst breach (median Q-Day)</p>
                  <p className="cr-stat-value cr-display" style={{ color: worstBreach && worstBreach.atP50 > 0 ? 'var(--crimson)' : 'var(--teal)' }}>
                    {worstBreach ? (worstBreach.atP50 > 0 ? `+${worstBreach.atP50.toFixed(1)}y` : 'None') : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="cr-card">
                <h2><FileJson size={15} /> Downloadable reports</h2>
                <p className="cr-card-sub">Three audiences, each pulling live from the current findings, remediation status, and Mosca breach-window numbers — not a stale export.</p>
                <div className="cr-report-grid">
                  <div className="cr-report-card">
                    <div className="cr-report-icon"><FileJson size={16} /></div>
                    <p className="cr-report-title">CycloneDX 1.6 CBOM</p>
                    <p className="cr-report-desc">Machine-readable cryptographic bill of materials with cryptoProperties and NIST quantum-security fields per asset.</p>
                    <button className="cr-report-btn" onClick={downloadCbom}><Download size={14} /> Download CBOM JSON</button>
                  </div>
                  <div className="cr-report-card">
                    <div className="cr-report-icon"><ShieldCheck size={16} /></div>
                    <p className="cr-report-title">Executive PDF brief</p>
                    <p className="cr-report-desc">Plain-English risk narrative for a CISO — readiness score, worst breach window, and what it means.</p>
                    <button className="cr-report-btn" onClick={downloadExecutivePdf}><Download size={14} /> Download executive PDF</button>
                  </div>
                  <div className="cr-report-card">
                    <div className="cr-report-icon"><FileSpreadsheet size={16} /></div>
                    <p className="cr-report-title">Engineering detail CSV</p>
                    <p className="cr-report-desc">Every actionable finding with effort estimate, breaking-change risk, chosen patch, and remediation status.</p>
                    <button className="cr-report-btn" onClick={downloadEngineeringCsv}><Download size={14} /> Download CSV</button>
                  </div>
                </div>
              </div>

              <div className="cr-card">
                <h2><FileArchive size={15} /> Auditor evidence bundle</h2>
                <p className="cr-card-sub">
                  A zip containing raw findings, the CBOM, the executive narrative, and a manifest with a SHA-256
                  checksum per file (computed locally via the Web Crypto API) — for chain-of-custody.
                </p>
                <button className="cr-report-btn" style={{ maxWidth: 280 }} onClick={downloadEvidenceBundle} disabled={bundling}>
                  <Download size={14} /> {bundling ? 'Bundling…' : 'Download evidence bundle (.zip)'}
                </button>
              </div>

              <div className="cr-card">
                <h2 className="cr-toggle-head" onClick={() => setMatrixOpen((o) => !o)} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{matrixOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Framework coverage matrix</span>
                </h2>
                {matrixOpen && (
                  <>
                    <p className="cr-card-sub">NIST SP 800-53 control families mapped to this scan's findings.</p>
                    <div className="cr-table-wrap">
                      <table className="cr-table">
                        <thead><tr><th>Control</th><th>Title</th><th>Findings mapped</th><th>Status</th></tr></thead>
                        <tbody>
                          {NIST_800_53_CONTROLS.map((c) => {
                            const mapped = actionable.filter((f) => c.appliesTo.includes(f.vulnerableSurface));
                            return (
                              <tr key={c.id}>
                                <td className="cr-mono">{c.id}</td>
                                <td>{c.title}</td>
                                <td>{mapped.length}</td>
                                <td><span className={`cr-status-pill ${mapped.length ? 'gap' : 'covered'}`}>{mapped.length ? `${mapped.length} open` : 'No open findings'}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p className="cr-card-sub" style={{ marginTop: 18 }}>NSA CNSA 2.0 migration milestones.</p>
                    <div className="cr-table-wrap">
                      <table className="cr-table">
                        <thead><tr><th>Category</th><th>Prefer PQC by</th><th>Exclusively PQC by</th></tr></thead>
                        <tbody>
                          {CNSA2_MILESTONES.map((m) => (
                            <tr key={m.category}><td>{m.category}</td><td>{m.preferBy}</td><td>{m.exclusiveBy}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="cr-disclaimer">
                      Based on publicly summarized NIST SP 800-53 and NSA CNSA 2.0 guidance. Both bodies have refined
                      these over time — confirm exact control text and dates against the current official advisory
                      before using this matrix as audit evidence.
                    </p>
                  </>
                )}
              </div>

              <div className="cr-card">
                <h2>Sign-off &amp; attestation</h2>
                <p className="cr-card-sub">Records a locally-computed SHA-256 hash of this report's current numbers, with a signer name, role, and timestamp — versioned below.</p>
                <div className="cr-sign-row">
                  <div className="cr-field"><label>Name</label><input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Jane Doe" /></div>
                  <div className="cr-field"><label>Role</label><input value={signerRole} onChange={(e) => setSignerRole(e.target.value)} placeholder="CISO" /></div>
                  <button className="cr-sign-btn" onClick={signReport} disabled={signing || !signerName.trim() || !signerRole.trim()}>
                    {signing ? 'Signing…' : 'Sign & save report'}
                  </button>
                </div>
                {!!reportHistory.length && (
                  <div style={{ marginTop: 14 }}>
                    {reportHistory.map((r) => (
                      <div className="cr-history-row" key={r.id}>
                        <span><b>{r.signer}</b> ({r.role})</span>
                        <span>{r.timestamp}</span>
                        <span className="cr-history-hash cr-mono">sha256:{r.hash.slice(0, 16)}…</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
