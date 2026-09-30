import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import ProfileMenu from '../components/ProfileMenu.jsx';
import { useScan } from '../context/ScanContext.jsx';
import { BAND_LABEL, BAND_COLOR, BAND_COLOR_LIGHT } from '../data/findings.js';
import {
  Sun, Moon, PanelLeft, Search, GitBranch, Copy, Check, ShieldAlert,
  Clock, ArrowRight, AlertCircle, CheckCircle2, Circle, Code2, ChevronDown, ChevronUp,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'pr-drafted', label: 'PR drafted' },
  { key: 'merged', label: 'Merged' },
];
const STATUS_ICON = { pending: Circle, 'pr-drafted': AlertCircle, merged: CheckCircle2 };

function buildPrDescription(finding, choiceKey) {
  const patch = finding.remediation[choiceKey];
  const slug = finding.asset.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const branch = `pqc/${finding.id}-${slug}`;
  const lines = [
    `## ${patch.title}`,
    '',
    `**Asset:** \`${finding.asset}\` (${finding.type}, ${finding.algorithm})`,
    `**Finding:** ${finding.id} — ${BAND_LABEL[finding.band]} — ${finding.location}`,
    '',
    '### Why',
    finding.remediation.rationale,
    '',
    '### What this patch does',
    patch.summary,
    '',
    '### Reviewer checklist',
    '- [ ] Backward compatible with clients/peers that haven\'t migrated yet',
    '- [ ] Interop tested against at least one unpatched peer, if applicable',
    '- [ ] Existing tests pass; new coverage added for the changed path',
    `- [ ] Breaking-change risk (${finding.remediation.breakingChangeRisk}) reviewed: ${(finding.remediation.breakingChangeReasons || []).join(' ') || 'n/a'}`,
    '- [ ] Rollback plan confirmed before enabling in production',
    '',
    `_Estimated effort: ~${finding.remediation.effortHours}h. Drafted by PQC Remediation — human review required before merge._`,
  ];
  return { branch, body: lines.join('\n') };
}

function testStub(finding) {
  if (/python|nginx|yaml/i.test(finding.language)) {
    return `def test_${finding.asset.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_handshake_uses_hybrid_group():\n    """Fails until the PQC hybrid group is actually negotiated."""\n    negotiated = get_negotiated_group("${finding.asset}")\n    assert negotiated in {"X25519MLKEM768", "X25519MLKEM1024"}, negotiated`;
  }
  return `test("${finding.asset} rotates off the flagged algorithm", () => {\n  expect(negotiatedAlgorithm("${finding.asset}")).not.toBe("${finding.algorithm}");\n});`;
}

function CodeBlock({ label, tone, code }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable in this context — no-op, button just won't confirm.
    }
  };
  return (
    <div className={`rem-code-block ${tone}`}>
      <div className="rem-code-head">
        <span>{label}</span>
        <button className="rem-copy-btn" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function PatchPanel({ finding, kind }) {
  const patch = finding.remediation[kind];
  if (!patch) return null;
  return (
    <div className="rem-patch-card">
      <div className="rem-patch-head">
        <h3>{patch.title}</h3>
        <span className={`rem-avail-pill ${patch.available ? 'yes' : 'no'}`}>
          {patch.available ? 'Ready to apply' : 'Not available upstream yet'}
        </span>
      </div>
      <p className="rem-patch-summary">{patch.summary}</p>
      {patch.library && <p className="rem-patch-lib"><b>Library / tooling:</b> {patch.library}</p>}
      {(patch.before || patch.after) && (
        <div className="rem-code-grid">
          <CodeBlock label="Before" tone="before" code={patch.before} />
          <CodeBlock label="After" tone="after" code={patch.after} />
        </div>
      )}
      {patch.notes && <p className="rem-patch-notes">{patch.notes}</p>}
    </div>
  );
}

function splitFixSuggestion(suggestion) {
  const [explanation, example] = String(suggestion).split(/\s*Example:\s*/i, 2);
  return { explanation: explanation.trim(), code: example?.trim() || null };
}

function FixSuggestionPanel({ finding }) {
  const { explanation, code } = splitFixSuggestion(finding.fixSuggestion);
  const detectedAt = `${finding.location}${finding.lineNumber ? `:${finding.lineNumber}` : ''}`;
  return (
    <section className="rem-fix-panel" aria-label="Suggested code fix">
      <div className="rem-fix-heading">
        <div>
          <p className="rem-fix-kicker">BACKEND-GENERATED FIX-IT SUGGESTION</p>
          <h3>Suggested Fix</h3>
        </div>
        <span className="rem-fix-source">From CBOM</span>
      </div>
      {explanation && <p className="rem-fix-explanation">{explanation}</p>}
      <div className="rem-code-grid">
        <CodeBlock label="Before — detected" tone="before" code={finding.sourceSnippet || `# Source excerpt was not included for ${detectedAt}`} />
        <CodeBlock label="After — suggested" tone="after" code={code || finding.fixSuggestion} />
      </div>
      <p className="rem-fix-disclaimer">Code-level starting point — full migration involves certificate reissuance, protocol updates, and testing across your stack.</p>
      <div className="rem-fix-checklist">
        <p>Detected: <b>{finding.algorithm}</b> in <span className="rem-mono">{detectedAt}</span></p>
        <ul>
          <li><CheckCircle2 size={13} /> Code fix: shown above</li>
          <li><Circle size={13} /> Certificate reissuance (org-level)</li>
          <li><Circle size={13} /> Protocol renegotiation (org-level)</li>
          <li><Circle size={13} /> Testing &amp; rollout</li>
        </ul>
      </div>
    </section>
  );
}

export default function Remediator() {
  const {
    theme, toggleTheme, sidebarOpen, toggleSidebar,
    scanState, actionable, patchChoice, setChoice, remediationStatus, setStatus,
    totalEffortHours, remediatedCount,
  } = useScan();

  const bandColors = theme === 'light' ? BAND_COLOR_LIGHT : BAND_COLOR;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [prOpen, setPrOpen] = useState(false);
  const [prCopied, setPrCopied] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actionable;
    return actionable.filter((f) => `${f.asset} ${f.algorithm} ${f.location}`.toLowerCase().includes(q));
  }, [actionable, query]);

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered.find((f) => f.fixSuggestion)?.id || filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    setPrOpen(false);
    setPrCopied(false);
    setFixOpen(Boolean(actionable.find((f) => f.id === selectedId)?.fixSuggestion));
  }, [selectedId, actionable]);

  const selected = actionable.find((f) => f.id === selectedId) || null;
  const choice = selected ? (patchChoice[selected.id] || 'bridge') : null;

  const pr = selected && choice ? buildPrDescription(selected, choice) : null;
  const copyPr = async () => {
    if (!pr) return;
    try {
      await navigator.clipboard.writeText(`git checkout -b ${pr.branch}\n\n${pr.body}`);
      setPrCopied(true);
      window.setTimeout(() => setPrCopied(false), 1500);
    } catch { /* no-op */ }
  };

  return (
    <div className="rem-shell" data-theme={theme}>
      <style>{`
        .rem-shell {
          --bg: #0a0d12; --surface-1: #12161d; --surface-2: #171c25;
          --border: #262e3a; --border-soft: #1b2129;
          --text-primary: #e8eaef; --text-secondary: #8a93a3; --text-faint: #545e6e;
          --gold: #c9a227; --gold-soft: rgba(201,162,39,0.14);
          --crimson: #c1503a; --teal: #3fb8af;
          font-family: 'Switzer', 'Inter', system-ui, sans-serif;
          background: var(--bg); color: var(--text-primary);
          min-height: 100vh; display: flex; width: 100%; box-sizing: border-box;
        }
        .rem-shell[data-theme="light"] {
          --bg: #f4f2ec; --surface-1: #ffffff; --surface-2: #ece9e0;
          --border: #dad6c9; --border-soft: #e4e1d6;
          --text-primary: #1b1d22; --text-secondary: #5b5e66; --text-faint: #8b8d93;
          --gold: #9c7a14; --gold-soft: rgba(156,122,20,0.12);
          --crimson: #a63f2b; --teal: #227a70;
        }
        .rem-shell *, .rem-shell *::before, .rem-shell *::after { box-sizing: border-box; }
        .rem-display { font-family: 'Clash Display', 'Switzer', sans-serif; }
        .rem-mono { font-family: 'IBM Plex Mono', monospace; }
        .rem-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .rem-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 28px; border-bottom: 1px solid var(--border-soft);
          position: sticky; top: 0; background: var(--bg); z-index: 5;
        }
        .rem-topbar h1 { font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
        .rem-top-actions { display: flex; align-items: center; gap: 14px; }
        .rem-theme-btn {
          width: 32px; height: 32px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--surface-1); color: var(--text-secondary); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .rem-theme-btn:hover { color: var(--gold); border-color: var(--gold); }
        .rem-content { padding: 22px 28px 90px; overflow-x: hidden; }
        .rem-empty {
          border: 1px dashed var(--border); border-radius: 10px; padding: 60px 24px;
          text-align: center; color: var(--text-secondary);
        }
        .rem-empty h2 { color: var(--text-primary); font-size: 17px; margin: 0 0 10px; }
        .rem-empty p { font-size: 13.5px; max-width: 440px; margin: 0 auto 18px; line-height: 1.6; }
        .rem-empty-btn {
          display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: #191308;
          font-weight: 600; font-size: 13.5px; padding: 10px 20px; border-radius: 7px; text-decoration: none;
        }

        .rem-layout { display: grid; grid-template-columns: 320px minmax(0,1fr); gap: 16px; align-items: start; }
        .rem-list-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 14px; }
        .rem-search {
          display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--border-soft);
          border-radius: 7px; padding: 8px 10px; margin-bottom: 10px;
        }
        .rem-search input { border: none; background: none; outline: none; color: var(--text-primary); font-size: 13px; width: 100%; font-family: inherit; }
        .rem-search svg { color: var(--text-faint); flex-shrink: 0; }
        .rem-finding-item {
          width: 100%; text-align: left; padding: 10px; border-radius: 8px; border: 1px solid transparent;
          background: none; cursor: pointer; font-family: inherit; margin-bottom: 4px; display: block;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .rem-finding-item:hover { background: var(--surface-2); }
        .rem-finding-item.active { background: var(--gold-soft); border-color: var(--gold); }
        .rem-finding-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
        .rem-finding-asset { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .rem-finding-meta { font-size: 11.5px; color: var(--text-faint); }
        .rem-band-pill { font-size: 10.5px; padding: 2px 8px; border-radius: 5px; font-weight: 500; white-space: nowrap; }
        .rem-hndl-tag { font-size: 10px; color: var(--text-faint); display: inline-flex; align-items: center; gap: 3px; margin-top: 3px; }
        .rem-fix-tag { color: var(--teal); }

        .rem-detail-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 22px; }
        .rem-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
        .rem-detail-title { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
        .rem-detail-sub { font-size: 12.5px; color: var(--text-faint); margin: 0; }
        .rem-status-select { display: flex; gap: 6px; }
        .rem-status-btn {
          display: flex; align-items: center; gap: 5px; font-size: 11.5px; padding: 5px 10px; border-radius: 6px;
          border: 1px solid var(--border); background: var(--surface-2); color: var(--text-secondary); cursor: pointer; font-family: inherit;
        }
        .rem-status-btn.active { border-color: var(--gold); color: var(--gold); background: var(--gold-soft); }

        .rem-rationale {
          background: var(--surface-2); border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px;
          line-height: 1.65; color: var(--text-secondary);
        }
        .rem-rationale b { color: var(--text-primary); }
        .rem-hndl-note {
          display: flex; gap: 8px; font-size: 12px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-soft);
          color: var(--text-faint); line-height: 1.6;
        }
        .rem-flags { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 6px; }
        .rem-flag { font-size: 11px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); }
        .rem-flag.risk-low { color: var(--teal); border-color: var(--teal); }
        .rem-flag.risk-medium { color: var(--gold); border-color: var(--gold); }
        .rem-flag.risk-high { color: var(--crimson); border-color: var(--crimson); }
        .rem-reasons { font-size: 12px; color: var(--text-faint); margin: 6px 0 0; padding-left: 18px; line-height: 1.6; }

        .rem-tabs { display: flex; gap: 8px; margin: 18px 0 12px; }
        .rem-tab {
          font-size: 12.5px; padding: 7px 14px; border-radius: 7px; border: 1px solid var(--border);
          background: var(--surface-2); color: var(--text-secondary); cursor: pointer; font-family: inherit;
        }
        .rem-tab.active { background: var(--gold); color: #191308; border-color: var(--gold); font-weight: 600; }

        .rem-patch-card { border: 1px solid var(--border-soft); border-radius: 10px; padding: 16px; background: var(--bg); }
        .rem-patch-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .rem-patch-head h3 { font-size: 14px; margin: 0; }
        .rem-avail-pill { font-size: 10.5px; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
        .rem-avail-pill.yes { color: var(--teal); background: rgba(63,184,175,0.12); }
        .rem-avail-pill.no { color: var(--text-faint); background: var(--surface-2); }
        .rem-patch-summary { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 10px 0; }
        .rem-patch-lib { font-size: 12px; color: var(--text-faint); margin: 0 0 10px; }
        .rem-patch-notes { font-size: 12px; color: var(--text-faint); margin: 10px 0 0; line-height: 1.6; font-style: italic; }

        .rem-fix-panel { margin: 18px 0; border: 1px solid rgba(63,184,175,0.38); background: rgba(63,184,175,0.06); border-radius: 10px; padding: 16px; }
        .rem-fix-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .rem-fix-heading h3 { margin: 3px 0 0; font-size: 14px; }
        .rem-fix-kicker { margin: 0; font-size: 10px; color: var(--teal); letter-spacing: 0.08em; font-family: 'IBM Plex Mono', monospace; }
        .rem-fix-source { color: var(--teal); background: rgba(63,184,175,0.12); padding: 3px 8px; border-radius: 999px; font-size: 10.5px; }
        .rem-fix-explanation { font-size: 13px; color: var(--text-secondary); margin: 10px 0; line-height: 1.55; }
        .rem-fix-disclaimer { border-left: 2px solid var(--gold); color: var(--text-secondary); font-size: 12px; line-height: 1.55; margin: 12px 0 0; padding: 8px 10px; background: var(--surface-2); }
        .rem-fix-checklist { margin-top: 12px; font-size: 11.5px; color: var(--text-secondary); }
        .rem-fix-checklist p { margin: 0 0 8px; }
        .rem-fix-checklist ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
        .rem-fix-checklist li { display: flex; align-items: center; gap: 6px; }
        .rem-fix-checklist li svg { color: var(--teal); flex-shrink: 0; }

        .rem-code-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 6px 0; }
        .rem-code-block { border-radius: 8px; overflow: hidden; border: 1px solid var(--border-soft); }
        .rem-code-block.before { border-color: rgba(193,80,58,0.35); }
        .rem-code-block.after { border-color: rgba(63,184,175,0.35); }
        .rem-code-head {
          display: flex; align-items: center; justify-content: space-between; font-size: 11px; padding: 6px 10px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .rem-code-block.before .rem-code-head { background: rgba(193,80,58,0.12); color: var(--crimson); }
        .rem-code-block.after .rem-code-head { background: rgba(63,184,175,0.12); color: var(--teal); }
        .rem-copy-btn { display: flex; align-items: center; gap: 4px; background: none; border: none; color: inherit; cursor: pointer; font-family: inherit; font-size: 10.5px; }
        .rem-code-block pre { margin: 0; padding: 12px; overflow-x: auto; background: var(--surface-2); }
        .rem-code-block code { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; line-height: 1.6; color: var(--text-primary); white-space: pre; }

        .rem-actions-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
        .rem-action-btn {
          display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 7px; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-primary);
        }
        .rem-action-btn.primary { background: var(--gold); color: #191308; border-color: var(--gold); }
        .rem-action-btn:hover { border-color: var(--gold); color: var(--gold); }
        .rem-action-btn.primary:hover { color: #191308; filter: brightness(1.07); }

        .rem-pr-panel { margin-top: 14px; border: 1px solid var(--border-soft); border-radius: 10px; overflow: hidden; }
        .rem-pr-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface-2); font-size: 12.5px; }
        .rem-pr-body { padding: 14px; background: var(--bg); }
        .rem-pr-body pre { margin: 0; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; line-height: 1.6; white-space: pre-wrap; color: var(--text-secondary); }

        .rem-test-stub { margin-top: 18px; }
        .rem-test-stub h4 { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 8px; font-weight: 500; }

        .rem-summary-bar {
          position: sticky; bottom: 0; margin-top: 18px; background: var(--surface-1); border: 1px solid var(--border-soft);
          border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px; font-size: 13px;
        }
        .rem-summary-bar b { color: var(--gold); }

        @media (max-width: 980px) {
          .rem-layout { grid-template-columns: 1fr; }
          .rem-code-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <Sidebar activeKey="remediator" />

      <div className="rem-main">
        <header className="rem-topbar">
          <h1 className="rem-display">PQC Remediation</h1>
          <div className="rem-top-actions">
            <button className="rem-theme-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button className="rem-theme-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <PanelLeft size={15} />
            </button>
            <ProfileMenu />
          </div>
        </header>

        <div className="rem-content">
          {scanState !== 'complete' ? (
            <div className="rem-empty">
              <ShieldAlert size={30} style={{ color: 'var(--text-faint)', marginBottom: 14 }} />
              <h2>No scan loaded yet</h2>
              <p>The Remediator works from a completed scan's findings. Run a scan on the dashboard first, then come back here for per-finding patches.</p>
              <Link to="/dashboard#sec-upload" className="rem-empty-btn">Go scan a file <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <>
              <div className="rem-layout">
                <div className="rem-list-card">
                  <div className="rem-search">
                    <Search size={14} />
                    <input placeholder="Filter findings…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  {filtered.map((f) => {
                    const status = remediationStatus[f.id] || 'pending';
                    const StatusIcon = STATUS_ICON[status];
                    return (
                      <button
                        key={f.id}
                        className={`rem-finding-item ${selectedId === f.id ? 'active' : ''}`}
                        onClick={() => setSelectedId(f.id)}
                      >
                        <div className="rem-finding-top">
                          <span className="rem-finding-asset">{f.asset}</span>
                          <span className="rem-band-pill" style={{ color: bandColors[f.band], background: `${bandColors[f.band]}22` }}>{BAND_LABEL[f.band]}</span>
                        </div>
                        <div className="rem-finding-meta rem-mono">{f.algorithm} · confidence {f.confidence.toFixed(2)}</div>
                        <div className="rem-hndl-tag"><StatusIcon size={11} /> {STATUS_OPTIONS.find((s) => s.key === status)?.label}{!f.hndlRelevant ? ' · signature-only' : ''}{f.fixSuggestion ? <span className="rem-fix-tag"> · Suggested fix</span> : ''}</div>
                      </button>
                    );
                  })}
                  {!filtered.length && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: 10 }}>No findings match that filter.</p>}
                </div>

                {selected && (
                  <div className="rem-detail-card">
                    <div className="rem-detail-head">
                      <div>
                        <h2 className="rem-detail-title rem-display">{selected.asset}</h2>
                        <p className="rem-detail-sub rem-mono">{selected.algorithm} · {selected.type} · {selected.location}</p>
                      </div>
                      <div className="rem-status-select">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            className={`rem-status-btn ${(remediationStatus[selected.id] || 'pending') === opt.key ? 'active' : ''}`}
                            onClick={() => setStatus(selected.id, opt.key)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rem-rationale">
                      <b>Attack model: {selected.remediation.attackModel === 'Shor' ? "Shor's algorithm" : selected.remediation.attackModel === 'Grover' ? "Grover's algorithm" : 'Classical only — not quantum-specific'}.</b>{' '}
                      {selected.remediation.rationale}
                      <div className="rem-hndl-note">
                        <Clock size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                        {selected.hndlRelevant
                          ? "This finding feeds the Mosca Timeline — it's a confidentiality/key-exchange exposure with real stored-traffic risk."
                          : 'Not applicable to the Mosca Timeline — there\'s no stored ciphertext to harvest for a signature-only key, so this carries a future-forgery risk instead of a breach-window risk.'}
                      </div>
                    </div>

                    <div className="rem-flags">
                      <span className={`rem-flag risk-${selected.remediation.breakingChangeRisk}`}>
                        Breaking-change risk: {selected.remediation.breakingChangeRisk}
                      </span>
                      <span className="rem-flag">~{selected.remediation.effortHours}h estimated effort</span>
                    </div>
                    {!!selected.remediation.breakingChangeReasons?.length && (
                      <ul className="rem-reasons">
                        {selected.remediation.breakingChangeReasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}

                    {selected.fixSuggestion && (
                      <div className="rem-actions-row" style={{ marginTop: 16 }}>
                        <button className="rem-action-btn" onClick={() => setFixOpen((open) => !open)}>
                          <Code2 size={15} /> {fixOpen ? 'Hide suggested fix' : 'View suggested fix'} {fixOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    )}
                    {fixOpen && selected.fixSuggestion && <FixSuggestionPanel finding={selected} />}

                    {!selected.fromCbom && <>
                      <div className="rem-tabs">
                        <button className={`rem-tab ${choice === 'bridge' ? 'active' : ''}`} onClick={() => setChoice(selected.id, 'bridge')}>
                          Bridge / hybrid
                        </button>
                        <button className={`rem-tab ${choice === 'full' ? 'active' : ''}`} onClick={() => setChoice(selected.id, 'full')}>
                          Full PQC migration
                        </button>
                      </div>
                      <PatchPanel finding={selected} kind={choice} />
                    </>}

                    <div className="rem-test-stub">
                      <h4>Scaffolded test (illustrative)</h4>
                      <CodeBlock label={/python|nginx|yaml/i.test(selected.language) ? 'test_*.py' : 'test.spec.js'} tone="after" code={testStub(selected)} />
                    </div>

                    <div className="rem-actions-row">
                      <button className="rem-action-btn primary" onClick={() => setPrOpen((o) => !o)}>
                        <GitBranch size={15} /> {prOpen ? 'Hide' : 'Generate'} branch + PR description
                      </button>
                      <Link to="/mosca-timeline" className="rem-action-btn">
                        <Clock size={15} /> See effect on breach window <ArrowRight size={13} />
                      </Link>
                    </div>

                    {prOpen && pr && (
                      <div className="rem-pr-panel">
                        <div className="rem-pr-head">
                          <span className="rem-mono">git checkout -b {pr.branch}</span>
                          <button className="rem-copy-btn" onClick={copyPr} style={{ color: 'var(--gold)' }}>
                            {prCopied ? <Check size={12} /> : <Copy size={12} />} {prCopied ? 'Copied' : 'Copy branch + PR body'}
                          </button>
                        </div>
                        <div className="rem-pr-body"><pre>{pr.body}</pre></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rem-summary-bar">
                <span>Portfolio effort: <b>{totalEffortHours}h</b> across {actionable.length} findings</span>
                <span><b>{remediatedCount}</b> of {actionable.length} marked merged</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
