import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import {
  FINDINGS, BAND_RANK, actionableFindings, hndlFindings, signatureOnlyFindings,
  estimateMigrationYears, QDAY_DISTRIBUTION_YEARS_FROM_NOW,
} from '../data/findings.js';
import { cbomToFindings, isCbomOutput } from '../utils/cbom.js';
import { computeBreach } from '../utils/mosca.js';

const ScanContext = createContext(null);

export function ScanProvider({ children }) {
  // --- layout / theme, shared so it doesn't reset when navigating pages ---
  const [theme, setTheme] = useState('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  // --- scan state machine: nothing analysis-shaped renders anywhere in the
  // app until a scan has actually completed ---
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'scanning' | 'complete'
  const [activeFileName, setActiveFileName] = useState(null);
  const [activeScanDate, setActiveScanDate] = useState(null);
  const [findings, setFindings] = useState(FINDINGS);

  const beginScan = useCallback(async (input) => {
    const file = typeof input === 'object' && input?.name ? input : null;
    const fileName = file?.name || input;
    setActiveFileName(fileName || 'live-network-scan.json');
    setScanState('scanning');
    let nextFindings = FINDINGS;

    // The backend's CBOM generator writes `components[].fix_suggestion`.
    // A CBOM JSON upload keeps that field intact for the Remediator; other
    // uploads continue to use the existing illustrative scan dataset.
    if (file && /\.json$/i.test(file.name)) {
      try {
        const payload = JSON.parse(await file.text());
        if (isCbomOutput(payload)) {
          const imported = cbomToFindings(payload);
          if (imported.length) nextFindings = imported;
        }
      } catch {
        // Keep the normal scan flow when a JSON file is not a CBOM document.
      }
    }

    window.setTimeout(() => {
      setFindings(nextFindings);
      setActiveScanDate(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
      setScanState('complete');
    }, 1800);
  }, []);

  // --- PQC Remediation state: which patch (bridge/full) is selected per
  // finding, and its tracked status. Feeds the Mosca Timeline's Y variable
  // and the Compliance report's "remediation status" column. ---
  const [patchChoice, setPatchChoice] = useState({}); // { [findingId]: 'bridge' | 'full' }
  const [remediationStatus, setRemediationStatus] = useState({}); // { [findingId]: 'pending' | 'pr-drafted' | 'merged' }

  const setChoice = useCallback((findingId, choice) => {
    setPatchChoice((prev) => ({ ...prev, [findingId]: choice }));
  }, []);
  const setStatus = useCallback((findingId, status) => {
    setRemediationStatus((prev) => ({ ...prev, [findingId]: status }));
  }, []);

  // --- Mosca Timeline: ONE common X (shelf-life) and Y (migration time) for
  // the full inventory, rather than a separate pair per artifact — the whole
  // portfolio is modeled as a single breach window against Z (Q-Day). ---
  const defaultPortfolioX = useMemo(() => {
    const years = hndlFindings(FINDINGS).map((f) => f.dataClassification?.shelfLifeYears || 0);
    return years.length ? Math.max(...years) : 1;
  }, []);
  const defaultPortfolioY = useMemo(() => {
    const years = hndlFindings(FINDINGS).map((f) => estimateMigrationYears(f.remediation?.effortHours, f.remediation?.breakingChangeRisk) || 0);
    return years.length ? +Math.max(...years).toFixed(2) : 0.5;
  }, []);

  const [portfolioShelfLife, setPortfolioShelfLife] = useState(defaultPortfolioX); // X — years, whole inventory
  const [portfolioMigrationYears, setPortfolioMigrationYears] = useState(defaultPortfolioY); // Y — years, whole inventory
  const [qdayDist, setQdayDist] = useState(QDAY_DISTRIBUTION_YEARS_FROM_NOW); // Z — distribution

  const resetMoscaOverrides = useCallback(() => {
    setPortfolioShelfLife(defaultPortfolioX);
    setPortfolioMigrationYears(defaultPortfolioY);
    setQdayDist(QDAY_DISTRIBUTION_YEARS_FROM_NOW);
  }, [defaultPortfolioX, defaultPortfolioY]);

  // --- Compliance & CBOM report history (attestation snapshots) ---
  const [reportHistory, setReportHistory] = useState([]); // [{ id, kind, timestamp, signer, role, hash }]
  const addReportRecord = useCallback((record) => {
    setReportHistory((prev) => [record, ...prev].slice(0, 25));
  }, []);

  // ---------------------------------------------------------------------
  // Derived data — computed once here so Dashboard, Remediator, Mosca
  // Timeline, and Compliance Reports all read the exact same numbers.
  // ---------------------------------------------------------------------
  const shorCount = useMemo(() => findings.filter((f) => f.shorVulnerable).length, [findings]);
  const readinessScore = useMemo(
    () => Math.round(((findings.length - shorCount) / findings.length) * 100),
    [findings, shorCount]
  );
  const sortedFindings = useMemo(() => [...findings].sort((a, b) => BAND_RANK[b.band] - BAND_RANK[a.band]), [findings]);
  const actionable = useMemo(() => actionableFindings(findings), [findings]);
  const hndlList = useMemo(() => hndlFindings(findings), [findings]);
  const signatureOnlyList = useMemo(() => signatureOnlyFindings(findings), [findings]);

  // Single breach-window result for the FULL inventory — one common X and Y
  // rather than a value per artifact. This is the number the Dashboard
  // banner, the Mosca Timeline, and the Compliance executive summary all
  // surface, computed exactly once.
  const portfolioBreach = useMemo(
    () => computeBreach(portfolioShelfLife, portfolioMigrationYears, qdayDist),
    [portfolioShelfLife, portfolioMigrationYears, qdayDist]
  );
  const worstBreach = portfolioBreach;

  const totalEffortHours = useMemo(
    () => actionable.reduce((sum, f) => sum + (f.remediation?.effortHours || 0), 0),
    [actionable]
  );
  const remediatedCount = useMemo(
    () => actionable.filter((f) => remediationStatus[f.id] === 'merged').length,
    [actionable, remediationStatus]
  );

  const value = {
    theme, toggleTheme, sidebarOpen, toggleSidebar,
    scanState, activeFileName, activeScanDate, beginScan,
    findings, sortedFindings, actionable, hndlList, signatureOnlyList,
    shorCount, readinessScore,
    patchChoice, setChoice, remediationStatus, setStatus, remediatedCount, totalEffortHours,
    portfolioShelfLife, setPortfolioShelfLife, portfolioMigrationYears, setPortfolioMigrationYears,
    qdayDist, setQdayDist, resetMoscaOverrides,
    portfolioBreach, worstBreach,
    reportHistory, addReportRecord,
  };

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used inside ScanProvider');
  return ctx;
}
