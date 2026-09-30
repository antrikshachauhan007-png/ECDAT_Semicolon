import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import ProfileMenu from '../components/ProfileMenu.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { useScan } from '../context/ScanContext.jsx';
import {
  BAND_LABEL, BAND_ORDER, BAND_COLOR, BAND_COLOR_LIGHT, BAND_DEADLINE,
  GRAPH_NODES, GRAPH_LINKS, getRiskComparison, getBandCounts,
  deriveKeySize, computeQARS, deriveLayer, deriveSensitivity, deriveExposure, deriveQuantumThreat,
  computeOverallRiskScore, riskScoreBand,
} from '../data/findings.js';
import {
  Upload, RefreshCw, Moon, Sun, ArrowRight, Bell,
  Loader2, Download, PanelLeft, Wrench, Clock, FileCheck2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Findings, bands, and the topology graph now live in src/data/findings.js —
// the single shared model the Remediator, Mosca Timeline, and Compliance
// Reports pages also read from, instead of Dashboard-only mock data.
// ---------------------------------------------------------------------------

const ENGINE_STAGES = [
  { title: 'Discovery engine', desc: 'Finds algorithms, protocols, certificates, keys, and libraries across code, containers, and certificates.' },
  { title: 'Analysis engine', desc: 'Classifies each finding, removes duplicates, and gives it context — what it is and where it lives.' },
  { title: 'Risk engine', desc: 'Scores severity, flags Shor-vulnerable crypto, and prioritizes what needs fixing first.' },
  { title: 'Recommendation engine', desc: 'Matches every finding to a NIST-standardized replacement, with two fallbacks and a migration-effort estimate.' },
];
const DATA_SOURCES = ['Source code (Git repos, ZIP uploads)', 'Network endpoints', 'Certificates', 'Container images'];
// Kept accurate to what's actually implemented today, not the eventual plan —
// Tree-sitter is a planned upgrade for JS/TS and C/C++, not yet wired in.
const SCANNER_TECH = [
  { lang: 'Python', method: 'Python AST --> AST-based crypto detection' },
  { lang: 'Java', method: 'Semgrep/pattern rules --> Pattern-based detection' },
  { lang: 'JavaScript / TypeScript', method: 'Tree-sitter --> Syntax-tree based detection' },
  { lang: 'C / C++', method: 'Tree-sitter --> Syntax-tree based detection' },
  { lang: 'Certificates', method: 'OpenSSL CLI —-> PEM, CRT, CER, DER, P12, PFX' },
  { lang: 'Containers', method: 'Docker CLI --> image inspection' },
  {lang: 'Binaries', method: '⁠Static binary analysis → pefile, pyelftools, imports/exports, and crypto strings' },
  { lang: 'Hardwares', method: 'Architecture / dependency evidence → Artefact extraction (No physical inspection)' },
  { lang: 'Cloud/ laC / Configurations', method: 'Static config parsing → Crypto APl/resource identification --> Evidence extraction & normalization' },
];

const REMINDER_DAYS = 7;
const RECENT_SCANS = [
  { file: 'payments.internal.pem', time: '12 minutes ago', band: 'critical' },
  { file: 'auth-service.pem', time: '1 hour ago', band: 'safe' },
  { file: 'network-scan-04.json', time: '3 hours ago', band: 'moderate' },
  { file: 'legacy-portal.crt', time: 'Yesterday', band: 'critical' },
];
const PREVIOUS_SCANS = [
  { id: 'ps1', file: 'payments.internal.pem', scannedDaysAgo: 9, topBand: 'critical' },
  { id: 'ps2', file: 'legacy-portal.crt', scannedDaysAgo: 15, topBand: 'critical' },
  { id: 'ps3', file: 'auth-service.pem', scannedDaysAgo: 2, topBand: 'high' },
  { id: 'ps4', file: 'network-scan-04.json', scannedDaysAgo: 5, topBand: 'moderate' },
  { id: 'ps5', file: 'database-proxy.py', scannedDaysAgo: 1, topBand: 'safe' },
];

export default function Dashboard() {
  const location = useLocation();
  const {
    theme, toggleTheme, sidebarOpen, toggleSidebar,
    scanState, activeFileName, activeScanDate, beginScan,
    findings, sortedFindings, actionable, shorCount, readinessScore,
    worstBreach,
  } = useScan();

  const graphWrapRef = useRef(null);
  const fgRef = useRef(null);
  const [graphSize, setGraphSize] = useState({ width: 640, height: 350 });
  const [hoverNode, setHoverNode] = useState(null);
  const fileInputRef = useRef(null);
  const [changedFlags, setChangedFlags] = useState({});

  useEffect(() => {
    function measure() {
      if (graphWrapRef.current) setGraphSize({ width: graphWrapRef.current.clientWidth, height: 350 });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Default force-graph physics cram 16 nodes into illegibly overlapping
  // labels. Widen the layout and fit it to the viewport once it settles.
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge')?.strength(-170);
      fgRef.current.d3Force('link')?.distance(64);
    }
  }, []);
  const handleGraphEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(400, 36);
  }, []);

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }, [location.hash]);

  const graphData = useMemo(
    () => ({ nodes: GRAPH_NODES.map((n) => ({ ...n })), links: GRAPH_LINKS.map((l) => ({ ...l })) }),
    []
  );

  const bandColors = theme === 'light' ? BAND_COLOR_LIGHT : BAND_COLOR;
  const riskComparison = useMemo(() => getRiskComparison(findings), [findings]);
  const bandCounts = useMemo(() => getBandCounts(findings), [findings]);
  const overallRiskScore = useMemo(() => computeOverallRiskScore(findings), [findings]);
  const overallRiskBand = riskScoreBand(overallRiskScore);
  const toggleChanged = (id) => setChangedFlags((prev) => ({ ...prev, [id]: !prev[id] }));
  const sortedPreviousScans = useMemo(
    () => [...PREVIOUS_SCANS].sort((a, b) => (BAND_DEADLINE[a.topBand] ? 0 : 0) || b.scannedDaysAgo - a.scannedDaysAgo),
    []
  );

  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const isHovered = hoverNode?.id === node.id;
      const r = isHovered ? 6.5 : 5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
      ctx.fillStyle = bandColors[node.risk] || bandColors.safe;
      ctx.fill();
      ctx.lineWidth = isHovered ? 1.8 : 1;
      ctx.strokeStyle = theme === 'light' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)';
      ctx.stroke();

      // Labels only render on hover (or when zoomed in a lot) — with 16 nodes,
      // always-on labels just overlap into an illegible mess at default zoom.
      if (isHovered || globalScale > 2.2) {
        const fontSize = Math.max((10 / globalScale) * 1.6, 3.4);
        ctx.font = `${isHovered ? '600 ' : ''}${fontSize}px 'IBM Plex Mono', monospace`;
        const label = node.name;
        const textWidth = ctx.measureText(label).width;
        const padX = 3;
        ctx.fillStyle = theme === 'light' ? 'rgba(244,242,236,0.9)' : 'rgba(10,13,18,0.88)';
        ctx.fillRect(node.x - textWidth / 2 - padX, node.y + r + 1, textWidth + padX * 2, fontSize + 3);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isHovered
          ? (theme === 'light' ? '#1b1d22' : '#e8eaef')
          : (theme === 'light' ? '#5b5e66' : '#8a93a3');
        ctx.fillText(label, node.x, node.y + r + 2);
      }
    },
    [bandColors, theme, hoverNode]
  );

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) beginScan(f);
  };
  const runLiveScan = () => beginScan('live-network-scan.json');

  const scrollToSection = (anchor) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDownloadReport = () => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text('Semicolon — Cryptographic Risk Report', 14, y); y += 10;
    doc.setFontSize(10);
    doc.text(`File: ${activeFileName || '—'}`, 14, y); y += 6;
    doc.text(`Scanned: ${activeScanDate || '—'}`, 14, y); y += 6;
    doc.text(`PQC readiness score: ${readinessScore}/100`, 14, y); y += 12;

    doc.setFontSize(13);
    doc.text('Findings by band', 14, y); y += 8;
    doc.setFontSize(9);
    BAND_ORDER.forEach((band) => {
      doc.text(`${BAND_LABEL[band]}: ${findings.filter((f) => f.band === band).length}`, 14, y);
      y += 6;
    });
    y += 6;

    doc.setFontSize(13);
    doc.text('Findings & recommendations', 14, y); y += 8;
    doc.setFontSize(8);
    sortedFindings.forEach((f) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(`${f.asset}  |  ${f.algorithm}  |  ${BAND_LABEL[f.band]}  |  Recommended: ${f.recommendation.primary}`, 14, y);
      y += 6;
    });

    doc.setFontSize(7);
    doc.text('Generated by Semicolon. Results are risk-informed estimates, not a guarantee — confirm with expert review before acting.', 14, 292);
    doc.save(`semicolon-report-${(activeFileName || 'scan').replace(/[^a-z0-9.-]/gi, '_')}.pdf`);
  };

  return (
    <div className="sentinel-dash" data-theme={theme}>
      <style>{`

        .sentinel-dash {
          --bg: #0a0d12; --surface-1: #12161d; --surface-2: #171c25;
          --border: #262e3a; --border-soft: #1b2129;
          --text-primary: #e8eaef; --text-secondary: #8a93a3; --text-faint: #545e6e;
          --gold: #c9a227; --gold-soft: rgba(201,162,39,0.14);
          --crimson: #c1503a; --teal: #3fb8af;
          font-family: 'Switzer', 'Inter', system-ui, sans-serif;
          background: var(--bg); color: var(--text-primary);
          min-height: 100vh; display: flex; width: 100%; box-sizing: border-box;
        }
        .sentinel-dash[data-theme="light"] {
          --bg: #f4f2ec; --surface-1: #ffffff; --surface-2: #ece9e0;
          --border: #dad6c9; --border-soft: #e4e1d6;
          --text-primary: #1b1d22; --text-secondary: #5b5e66; --text-faint: #8b8d93;
          --gold: #9c7a14; --gold-soft: rgba(156,122,20,0.12);
          --crimson: #a63f2b; --teal: #227a70;
        }
        .sentinel-dash *, .sentinel-dash *::before, .sentinel-dash *::after { box-sizing: border-box; }
        .sd-display { font-family: 'Clash Display', 'Switzer', sans-serif; }
        .sd-mono { font-family: 'IBM Plex Mono', monospace; }

        .sd-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .sd-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 28px; border-bottom: 1px solid var(--border-soft);
          position: sticky; top: 0; background: var(--bg); z-index: 5;
        }
        .sd-topbar h1 { font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
        .sd-top-actions { display: flex; align-items: center; gap: 14px; }
        .sd-theme-btn {
          width: 32px; height: 32px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--surface-1); color: var(--text-secondary); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .sd-theme-btn:hover { color: var(--gold); border-color: var(--gold); }

        .sd-content { padding: 22px 28px 48px; overflow-x: hidden; }
        .sd-scroll-target { scroll-margin-top: 84px; }

        .sd-stats-row { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-bottom: 14px; }
        .sd-stat-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 16px; }
        .sd-stat-label { font-size: 12px; color: var(--text-secondary); margin: 0 0 8px; }
        .sd-stat-value { font-size: 26px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
        .sd-stat-value.accent-risk { color: var(--crimson); }

        .sd-grid { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(0,1fr); gap: 14px; margin-bottom: 14px; }
        .sd-grid-narrow-left { grid-template-columns: minmax(280px,0.82fr) minmax(0,1.58fr); align-items: stretch; }
        .sd-risk-left-col { display: grid; grid-template-rows: minmax(176px,0.84fr) minmax(192px,1fr); gap: 14px; }
        .sd-risk-score-card {
          margin-bottom: 0; display: flex; flex-direction: column;
          align-items: flex-start; justify-content: center; gap: 8px; min-height: 176px;
        }
        .sd-risk-score-body { display: flex; align-items: baseline; gap: 4px; }
        .sd-risk-score-num { font-size: clamp(42px,4vw,56px); font-weight: 600; line-height: 0.95; }
        .sd-risk-score-max { font-size: 14px; color: var(--text-secondary); }
        .sd-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 18px; margin-bottom: 14px; }
        .sd-card h2 { font-size: 14px; font-weight: 500; margin: 0 0 14px; }
        .sd-card-sub { font-size: 12.5px; color: var(--text-secondary); margin: -8px 0 14px; line-height: 1.5; }
        .sd-graph-card { min-height: 430px; margin-bottom: 0; }
        .sd-graph-wrap { border-radius: 8px; overflow: hidden; background: var(--bg); }

        .sd-donut-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .sd-legend { display: flex; flex-direction: column; gap: 6px; }
        .sd-legend-item { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-secondary); }
        .sd-legend-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }

        .sd-upload-card { padding: 36px 24px; }
        .sd-upload-zone {
          border: 1.5px dashed var(--border); border-radius: 12px; padding: 40px 24px;
          display: flex; flex-direction: column; align-items: center; text-align: center;
          max-width: 640px; margin: 0 auto; color: var(--text-faint); transition: border-color 0.15s ease;
        }
        .sd-upload-zone:hover { border-color: var(--gold); }
        .sd-upload-zone-title { font-size: 14px; color: var(--text-secondary); margin: 14px 0 22px; }
        .sd-actions-row { flex-direction: row; gap: 14px; }
        .sd-action-btn-lg { padding: 13px 26px; font-size: 14.5px; }
        .sd-actions { display: flex; flex-direction: column; gap: 10px; }
        .sd-action-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 14px; border-radius: 7px; font-size: 13.5px; font-weight: 500;
          cursor: pointer; font-family: inherit; border: 1px solid var(--border);
          background: var(--surface-2); color: var(--text-primary); text-decoration: none;
        }
        .sd-action-btn.primary { background: var(--gold); color: #191308; border-color: var(--gold); }
        .sd-action-btn.primary:hover { filter: brightness(1.07); }
        .sd-action-btn:not(.primary):hover { border-color: var(--gold); color: var(--gold); }
        .sd-action-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .sd-action-btn .spin { animation: sd-spin 0.9s linear infinite; }
        @keyframes sd-spin { to { transform: rotate(360deg); } }
        .sd-upload-note { font-size: 11.5px; color: var(--text-faint); text-align: center; margin: 0; }

        .sd-pipeline { display: flex; align-items: flex-start; gap: 16px; margin-top: 4px; flex-wrap: wrap; }
        .sd-pipeline-step { flex: 1 1 180px; min-width: 180px; }
        .sd-pipeline-num { font-size: 11px; color: var(--gold); }
        .sd-pipeline-step h3 { font-size: 14px; font-weight: 600; margin: 6px 0 6px; }
        .sd-pipeline-step p { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; margin: 0; }
        .sd-pipeline-arrow { color: var(--text-faint); margin-top: 22px; flex-shrink: 0; }
        .sd-sources-row { margin-top: 18px; }
        .sd-source-tag {
          display: inline-block; font-size: 11.5px; padding: 5px 10px; border: 1px solid var(--border);
          border-radius: 999px; color: var(--text-secondary); margin: 0 6px 6px 0;
        }

        .sd-table-wrap { overflow-x: auto; margin-top: 14px; }
        .sd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sd-table th {
          text-align: left; font-weight: 500; color: var(--text-secondary); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--border-soft);
          white-space: nowrap;
        }
        .sd-table td { padding: 10px; border-bottom: 1px solid var(--border-soft); white-space: nowrap; }
        .sd-table-loc { color: var(--text-faint); font-size: 12px; }

        .sd-band-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .sd-band-chip { flex: 1; min-width: 60px; background: var(--surface-2); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 3px; }
        .sd-band-dot { width: 8px; height: 8px; border-radius: 999px; }
        .sd-band-count { font-size: 18px; }
        .sd-band-label { font-size: 10.5px; color: var(--text-secondary); }
        .sd-band-list-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-top: 1px solid var(--border-soft); }
        .sd-band-pill { font-size: 11px; padding: 3px 9px; border-radius: 5px; font-weight: 500; white-space: nowrap; }

        .sd-pqc-summary-row { display: flex; align-items: center; gap: 28px; margin-bottom: 16px; flex-wrap: wrap; }
        .sd-pqc-note { font-size: 12px; color: var(--text-faint); line-height: 1.55; margin: 14px 0 0; }
        .sd-readiness-ring { position: relative; width: 96px; height: 96px; flex-shrink: 0; margin-left: auto; }
        .sd-readiness-ring svg { transform: rotate(-90deg); }
        .sd-readiness-ring-label {
          position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .sd-readiness-ring-pct { font-family: 'Clash Display', sans-serif; font-size: 20px; font-weight: 600; line-height: 1; }
        .sd-readiness-ring-sub { font-size: 9px; color: var(--text-secondary); margin-top: 3px; letter-spacing: 0.03em; }
        @media (max-width: 620px) {
          .sd-readiness-ring { margin-left: 0; }
        }

        .sd-alarm-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 12px 0; border-top: 1px solid var(--border-soft); }
        .sd-alarm-check { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .sd-alarm-check input { accent-color: var(--gold); width: 15px; height: 15px; flex-shrink: 0; }
        .sd-alarm-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .sd-reminder { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--crimson); background: rgba(193,80,58,0.12); padding: 4px 9px; border-radius: 5px; white-space: nowrap; }

        .sd-scan-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border-soft); }
        .sd-scan-row:first-of-type { border-top: none; }
        .sd-scan-file { font-size: 13.5px; margin: 0; }
        .sd-scan-time { font-size: 11.5px; color: var(--text-faint); margin: 2px 0 0; }

        .sd-empty-state {
          border: 1px dashed var(--border); border-radius: 10px; padding: 48px 24px;
          text-align: center; color: var(--text-secondary); margin-bottom: 14px;
        }
        .sd-empty-state svg { color: var(--text-faint); margin-bottom: 14px; }
        .sd-empty-state h2 { font-size: 17px; color: var(--text-primary); margin: 0 0 8px; font-weight: 600; }
        .sd-empty-state p { font-size: 13.5px; max-width: 420px; margin: 0 auto; line-height: 1.6; }
        .sd-empty-state .spin { animation: sd-spin 1s linear infinite; }

        .sd-reports-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
        .sd-reports-meta { font-size: 12.5px; color: var(--text-secondary); line-height: 1.7; }
        .sd-reports-meta b { color: var(--text-primary); font-weight: 600; }

        .sd-feature-row { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-top: 4px; }
        .sd-feature-card {
          display: block; padding: 16px; border: 1px solid var(--border-soft); border-radius: 10px;
          background: var(--surface-2); text-decoration: none; color: var(--text-primary);
        }
        .sd-feature-card:hover { border-color: var(--gold); }
        .sd-feature-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--gold-soft); color: var(--gold); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
        .sd-feature-title { font-size: 13.5px; font-weight: 600; margin: 0 0 4px; }
        .sd-feature-desc { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.5; }
        .sd-breach-banner {
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
          background: rgba(193,80,58,0.1); border: 1px solid rgba(193,80,58,0.3); border-radius: 10px;
          padding: 14px 18px; margin-bottom: 14px; font-size: 13px; color: var(--text-primary);
        }
        .sd-breach-banner b { color: var(--crimson); }

        @media (max-width: 980px) {
          .sd-stats-row { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .sd-grid { grid-template-columns: 1fr; }
          .sd-risk-left-col { grid-template-columns: repeat(2, minmax(0,1fr)); grid-template-rows: none; }
          .sd-risk-score-card { min-height: 168px; }
          .sd-feature-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 620px) {
          .sd-content { padding: 18px 16px 36px; }
          .sd-risk-left-col { grid-template-columns: 1fr; }
          .sd-risk-score-card { min-height: 154px; }
          .sd-donut-row { gap: 12px; }
        }
      `}</style>

      <Sidebar />

      <div className="sd-main">
        <header className="sd-topbar">
          <h1 className="sd-display">Dashboard</h1>
          <div className="sd-top-actions">
            <button className="sd-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button className="sd-theme-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <PanelLeft size={15} />
            </button>
            <ProfileMenu />
          </div>
        </header>

        <div className="sd-content">
          {scanState === 'complete' && worstBreach && worstBreach.atP50 > 0 && (
            <div className="sd-breach-banner">
              <span>
                <b>HNDL exposure detected</b> — the worst-case tracked asset breaches its required secrecy window by
                roughly <b>{worstBreach.atP50.toFixed(1)} years</b> in the median Q-Day scenario.
              </span>
              <Link to="/mosca-timeline" className="sd-action-btn primary" style={{ padding: '8px 14px', fontSize: 12.5 }}>
                Open Mosca Timeline <ArrowRight size={13} />
              </Link>
            </div>
          )}

          <div className="sd-card">
            <h2>How Semicolon works</h2>
            <div className="sd-pipeline">
              {ENGINE_STAGES.map((stage, i) => (
                <React.Fragment key={stage.title}>
                  <div className="sd-pipeline-step">
                    <span className="sd-pipeline-num sd-mono">{String(i + 1).padStart(2, '0')}</span>
                    <h3>{stage.title}</h3>
                    <p>{stage.desc}</p>
                  </div>
                  {i < ENGINE_STAGES.length - 1 && <ArrowRight size={16} className="sd-pipeline-arrow" />}
                </React.Fragment>
              ))}
            </div>
            <div className="sd-sources-row">
              {DATA_SOURCES.map((s) => <span key={s} className="sd-source-tag sd-mono">{s}</span>)}
            </div>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Coverage</th><th>Detection method</th></tr></thead>
                <tbody>
                  {SCANNER_TECH.map((s) => (
                    <tr key={s.lang}><td>{s.lang}</td><td className="sd-table-loc">{s.method}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sd-card">
            <h2>Beyond discovery</h2>
            <p className="sd-card-sub">Once a scan completes, three linked tools turn findings into action.</p>
            <div className="sd-feature-row">
              <Link to="/remediator" className="sd-feature-card">
                <div className="sd-feature-icon"><Wrench size={16} /></div>
                <p className="sd-feature-title">PQC Remediation</p>
                <p className="sd-feature-desc">Real before/after patches per finding, with a rationale, a breaking-change score, and a draft PR — not a silent auto-apply.</p>
              </Link>
              <Link to="/mosca-timeline" className="sd-feature-card">
                <div className="sd-feature-icon"><Clock size={16} /></div>
                <p className="sd-feature-title">Mosca Timeline</p>
                <p className="sd-feature-desc"> Inventory breach-window modeling against a Q-Day probability range — not a single confident year.</p>
              </Link>
              <Link to="/compliance-reports" className="sd-feature-card">
                <div className="sd-feature-icon"><FileCheck2 size={16} /></div>
                <p className="sd-feature-title">Compliance & CBOM Reports</p>
                <p className="sd-feature-desc">CycloneDX CBOM, NIST/CNSA framework mapping, and a signed evidence bundle for auditors.</p>
              </Link>
            </div>
          </div>

          <div id="sec-upload" className="sd-card sd-scroll-target sd-upload-card">
            <h2 style={{ textAlign: 'center' }}>Scan a file</h2>
            <p className="sd-card-sub" style={{ textAlign: 'center', margin: '-8px auto 20px', maxWidth: 480 }}>
              Upload a config, cert, key, or code file, or a backend-generated CBOM JSON to carry its fix-it suggestions into the Remediator.
            </p>
            <div className="sd-upload-zone">
              <Upload size={30} />
              <p className="sd-upload-zone-title">Drag a file here, or choose an option below</p>
              <div className="sd-actions sd-actions-row">
                <button className="sd-action-btn primary sd-action-btn-lg" onClick={handleUploadClick} disabled={scanState === 'scanning'}>
                  <Upload size={16} /> Upload file
                </button>
                <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                <button className="sd-action-btn sd-action-btn-lg" onClick={runLiveScan} disabled={scanState === 'scanning'}>
                  <RefreshCw size={16} className={scanState === 'scanning' ? 'spin' : ''} />
                  {scanState === 'scanning' ? 'Scanning…' : 'Run live scan'}
                </button>
              </div>
              <p className="sd-upload-note">
                Demo mode — this scans a fixed illustrative dataset regardless of the file you choose, so the rest of
                the app has something real to show you.
              </p>
            </div>
          </div>

          {scanState === 'scanning' && (
            <div className="sd-empty-state">
              <Loader2 size={30} className="spin" />
              <h2>Scanning {activeFileName}…</h2>
              <p>Running the discovery, analysis, and risk engines. This usually takes a few seconds.</p>
            </div>
          )}

          {scanState === 'complete' && (
            <>
              <div className="sd-stats-row">
                <StatCard label="Scanned file" value={activeFileName} small />
                <StatCard label="Scan date" value={activeScanDate} small />
                <StatCard label="Critical findings" value={findings.filter((f) => f.band === 'critical').length} accent="risk" />
                <StatCard label="High findings" value={findings.filter((f) => f.band === 'high').length} />
              </div>

              <div id="sec-risk-analysis" className="sd-scroll-target">
                <div className="sd-grid sd-grid-narrow-left">
                  <div className="sd-risk-left-col">
                    <div id="sec-risk-score" className="sd-card sd-risk-score-card">
                      <h2>Overall risk score</h2>
                      <div className="sd-risk-score-body">
                        <span className="sd-risk-score-num sd-display" style={{ color: bandColors[overallRiskBand] }}>{overallRiskScore}</span>
                        <span className="sd-risk-score-max">/100</span>
                      </div>
                      <span className="sd-band-pill" style={{ color: bandColors[overallRiskBand], background: `${bandColors[overallRiskBand]}22` }}>
                        {BAND_LABEL[overallRiskBand]} overall
                      </span>
                    </div>

                    <div id="sec-risk-breakdown" className="sd-card sd-scroll-target" style={{ marginBottom: 0, flex: 1 }}>
                      <h2>Risk breakdown</h2>
                      <div className="sd-donut-row">
                        <PieChart width={92} height={92}>
                          <Pie data={riskComparison} dataKey="current" nameKey="label" innerRadius={28} outerRadius={44} startAngle={90} endAngle={-270} stroke="none">
                            {riskComparison.map((entry) => <Cell key={entry.band} fill={bandColors[entry.band]} />)}
                          </Pie>
                        </PieChart>
                        <div className="sd-legend">
                          {riskComparison.map((entry) => (
                            <div className="sd-legend-item" key={entry.band}>
                              <span className="sd-legend-dot" style={{ background: bandColors[entry.band] }} />
                              {entry.label} · {entry.current}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div id="sec-topology" className="sd-card sd-graph-card sd-scroll-target" style={{ marginBottom: 0 }}>
                    <h2>Cryptographic asset topology</h2>
                    <p className="sd-card-sub" style={{ marginTop: -6 }}>Hover a node for its name — labels stay hidden by default so 16 assets don't overlap into noise.</p>
                    <div className="sd-graph-wrap" ref={graphWrapRef}>
                      <ForceGraph2D
                        ref={fgRef}
                        graphData={graphData}
                        width={graphSize.width}
                        height={graphSize.height}
                        backgroundColor="rgba(0,0,0,0)"
                        nodeLabel={(n) => `${n.name} — ${BAND_LABEL[n.risk]}`}
                        linkColor={() => (theme === 'light' ? 'rgba(27,29,34,0.18)' : 'rgba(138,147,163,0.28)')}
                        nodeCanvasObject={paintNode}
                        onNodeHover={setHoverNode}
                        onEngineStop={handleGraphEngineStop}
                        nodeRelSize={5}
                        cooldownTicks={90}
                        linkDirectionalParticles={0}
                      />
                    </div>
                  </div>
                </div>

                <div className="sd-grid">
                  <div id="sec-risk-dashboard" className="sd-card sd-scroll-target" style={{ marginBottom: 0 }}>
                    <h2>Risk dashboard</h2>
                    <p className="sd-card-sub">Findings ranked by urgency, so your team knows what to handle first.</p>
                    <div className="sd-band-row">
                      {BAND_ORDER.map((band) => (
                        <div className="sd-band-chip" key={band}>
                          <span className="sd-band-dot" style={{ background: bandColors[band] }} />
                          <span className="sd-band-count sd-display">{findings.filter((f) => f.band === band).length}</span>
                          <span className="sd-band-label">{BAND_LABEL[band]}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      {sortedFindings.slice(0, 4).map((f) => (
                        <div className="sd-band-list-row" key={f.id}>
                          <span className="sd-mono" style={{ fontSize: 12.5 }}>{f.asset}</span>
                          <span className="sd-band-pill" style={{ color: bandColors[f.band], background: `${bandColors[f.band]}22` }}>{BAND_LABEL[f.band]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div id="sec-risk-bar-graph" className="sd-card sd-scroll-target" style={{ marginBottom: 0 }}>
                    <h2>Findings by risk level</h2>
                    <p className="sd-card-sub">How many findings sit in each band right now.</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        layout="vertical"
                        data={bandCounts}
                        margin={{ top: 4, right: 24, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid stroke={theme === 'light' ? '#dad6c9' : '#1b2129'} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
                        <Tooltip
                          contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: 'var(--text-primary)' }}
                        />
                        <Bar dataKey="count" name="Findings" radius={[0, 4, 4, 0]} barSize={18}>
                          {bandCounts.map((entry) => <Cell key={entry.band} fill={bandColors[entry.band]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div id="sec-inventory" className="sd-card sd-scroll-target">
                <h2>Crypto inventory</h2>
                <p className="sd-card-sub">
                  Every cryptographic asset Semicolon found in this scan, mapped to where it lives. QARS is the
                  Quantum-Adjusted Risk Score — band urgency, Shor-breakability, and detector confidence in one number.
                </p>
                <div className="sd-table-wrap">
                  <table className="sd-table">
                    <thead>
                      <tr>
                        <th>Asset</th><th>Type</th><th>Algorithm</th><th>Band</th><th>QARS</th>
                        <th>Sensitivity</th><th>Exposure</th><th>Layer</th><th>Vulnerable to</th><th>Location</th><th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f) => {
                        const qars = computeQARS(f);
                        const qarsBand = riskScoreBand(qars);
                        return (
                          <tr key={f.id}>
                            <td className="sd-mono">{f.asset}</td>
                            <td>{f.type}</td>
                            <td>{f.algorithm}</td>
                            <td><span className="sd-band-pill" style={{ color: bandColors[f.band], background: `${bandColors[f.band]}22` }}>{BAND_LABEL[f.band]}</span></td>
                            <td className="sd-mono" style={{ color: bandColors[qarsBand], fontWeight: 600 }}>{qars}</td>
                            <td>{deriveSensitivity(f)}</td>
                            <td className="sd-table-loc">{deriveExposure(f)}</td>
                            <td className="sd-table-loc">{deriveLayer(f)}</td>
                            <td className="sd-table-loc" style={{ whiteSpace: 'normal', minWidth: 200 }}>{deriveQuantumThreat(f)}</td>
                            <td className="sd-mono sd-table-loc">{f.location}</td>
                            <td className="sd-mono">{f.confidence.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div id="sec-pqc" className="sd-card sd-scroll-target">
                <h2>PQC readiness</h2>
                <p className="sd-card-sub">Quantum-vulnerable cryptography — broken outright by Shor's algorithm, not just weakened.</p>
                <div className="sd-pqc-summary-row">
                  <div>
                    <p className="sd-stat-value sd-display">{readinessScore}<span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 }}>/100</span></p>
                    <p className="sd-stat-label">Overall readiness score</p>
                  </div>
                  <div>
                    <p className="sd-stat-value sd-display" style={{ color: 'var(--teal)' }}>{findings.length - shorCount}</p>
                    <p className="sd-stat-label">Assets safe</p>
                  </div>
                  <div>
                    <p className="sd-stat-value sd-display" style={{ color: 'var(--crimson)' }}>{shorCount}</p>
                    <p className="sd-stat-label">Assets action required</p>
                  </div>
                  <ReadinessRing percent={readinessScore} />
                </div>
                <p className="sd-pqc-note">
                  RSA and ECC/ECDSA are fully broken by a sufficiently powerful quantum computer. AES-256 is only
                  weakened by Grover's algorithm, not broken, so fully-safe assets aren't counted as needing action.
                  Per-asset recommended actions live in <a href="#sec-recommend" style={{ color: 'var(--gold)' }}>Recommendation</a> below;
                  for a step-by-step patch and rationale, see <Link to="/remediator" style={{ color: 'var(--gold)' }}>PQC Remediation</Link>.
                </p>
              </div>

              <div id="sec-recommend" className="sd-card sd-scroll-target">
                <h2>Recommendation</h2>
                <p className="sd-card-sub">
                  Every finding matched to a NIST-standardized replacement, with two fallbacks so one unavailable
                  algorithm doesn't stall the plan. Confidence scores live in Crypto Inventory above.
                </p>
                <div className="sd-table-wrap">
                  <table className="sd-table">
                    <thead>
                      <tr>
                        <th>Asset</th><th>Algorithm</th><th>Band</th><th>Recommended PQC</th>
                        <th>Fallback 1</th><th>Fallback 2</th><th>Migration effort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFindings.map((f) => (
                        <tr key={f.id}>
                          <td className="sd-mono" style={{ fontWeight: 600 }}>{f.asset}</td>
                          <td className="sd-mono sd-table-loc">{f.algorithm}</td>
                          <td><span className="sd-band-pill" style={{ color: bandColors[f.band], background: `${bandColors[f.band]}22` }}>{BAND_LABEL[f.band]}</span></td>
                          <td className="sd-mono">{f.recommendation.primary}</td>
                          <td className="sd-mono sd-table-loc">{f.recommendation.fallback}</td>
                          <td className="sd-mono sd-table-loc">{f.recommendation.fallback2 || '—'}</td>
                          <td>{f.recommendation.effort}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div id="sec-reports" className="sd-card sd-scroll-target">
                <h2>Reports</h2>
                <div className="sd-reports-row">
                  <div className="sd-reports-meta">
                    <div><b>{activeFileName}</b> — scanned {activeScanDate}</div>
                    <div>{findings.length} findings · {shorCount} quantum-vulnerable · readiness {readinessScore}/100</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="sd-action-btn" onClick={handleDownloadReport}>
                      <Download size={15} /> Quick PDF
                    </button>
                    <Link to="/compliance-reports" className="sd-action-btn primary">
                      <FileCheck2 size={15} /> Compliance &amp; CBOM Reports
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="sd-card">
            <h2>Recent scans</h2>
            {RECENT_SCANS.map((scan) => (
              <div className="sd-scan-row" key={scan.file}>
                <div>
                  <p className="sd-scan-file sd-mono">{scan.file}</p>
                  <p className="sd-scan-time">{scan.time}</p>
                </div>
                <span className="sd-band-pill" style={{ color: bandColors[scan.band], background: `${bandColors[scan.band]}22` }}>{BAND_LABEL[scan.band]}</span>
              </div>
            ))}
          </div>

          <div id="sec-previous" className="sd-card sd-scroll-target">
            <h2 id="sec-reminders" className="sd-scroll-target">Previous scans &amp; reminders</h2>
            <p className="sd-card-sub">
              Every file Semicolon has scanned before, most vulnerable and least recently checked first.
              Flag a file if you've changed its code, or let Semicolon remind you automatically after {REMINDER_DAYS} days.
            </p>
            {sortedPreviousScans.map((scan) => {
              const changed = !!changedFlags[scan.id];
              const overdue = scan.scannedDaysAgo >= REMINDER_DAYS;
              const showReminder = changed || overdue;
              return (
                <div className="sd-alarm-row" key={scan.id}>
                  <label className="sd-alarm-check">
                    <input type="checkbox" checked={changed} onChange={() => toggleChanged(scan.id)} />
                    <div>
                      <p className="sd-scan-file sd-mono">{scan.file}</p>
                      <p className="sd-scan-time">Scanned {scan.scannedDaysAgo}d ago · flag if you've changed this code</p>
                    </div>
                  </label>
                  <div className="sd-alarm-right">
                    <span className="sd-band-pill" style={{ color: bandColors[scan.topBand], background: `${bandColors[scan.topBand]}22` }}>{BAND_LABEL[scan.topBand]}</span>
                    {showReminder && (
                      <span className="sd-reminder">
                        <Bell size={12} />
                        {changed ? 'Changes flagged — re-scan recommended' : 'Overdue — re-scan recommended'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix, accent, small }) {
  return (
    <div className="sd-stat-card">
      <p className="sd-stat-label">{label}</p>
      <p className={`sd-stat-value sd-display ${accent === 'risk' ? 'accent-risk' : ''}`} style={small ? { fontSize: 16 } : undefined}>
        {value}
        {suffix && <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 }}>{suffix}</span>}
      </p>
    </div>
  );
}

// Circular progress ring/dial for the PQC readiness percentage — replaces
// the old per-asset readiness table with a single at-a-glance visual.
function ReadinessRing({ percent, size = 96, stroke = 9 }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 70 ? 'var(--teal)' : clamped >= 40 ? 'var(--gold)' : 'var(--crimson)';
  return (
    <div className="sd-readiness-ring" role="img" aria-label={`PQC readiness ${clamped} percent`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--surface-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="sd-readiness-ring-label">
        <span className="sd-readiness-ring-pct sd-display">{clamped}%</span>
        <span className="sd-readiness-ring-sub">PQC ready</span>
      </div>
    </div>
  );
}
