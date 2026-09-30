// ---------------------------------------------------------------------------
// Single shared data model for the whole app.
//
// This file is the "no silos" rule made literal: the Dashboard, the AI Code
// Remediator, the Mosca Timeline, and the Compliance & CBOM Reports page
// all import FINDINGS (and nothing else) from here. A finding's remediation
// content, its effort estimate, and its HNDL applicability are defined once,
// so a number can't drift between screens the way it would with four
// separate mock datasets.
//
// Two ideas recur throughout this file and are worth stating up front:
//
// 1. "Quantum-vulnerable" is not "broken today." Every rationale below is
//    written in terms of what a *future* cryptographically-relevant quantum
//    computer (CRQC) could do, not what's exploitable right now.
//
// 2. HNDL ("Harvest Now, Decrypt Later") only applies to confidentiality —
//    to data that gets encrypted and could be recorded today for later
//    decryption. It does NOT apply to pure signature/authentication keys
//    (an SSH host key, a code-signing key): there's no ciphertext to harvest
//    for those, only a future forgery risk once a CRQC exists. Findings are
//    tagged `hndlRelevant` accordingly, and the Mosca Timeline only plots
//    the ones where it actually applies — a distinction the reference demo
//    this app is competing with did not make.
// ---------------------------------------------------------------------------

export const BAND_COLOR = { safe: '#3fb8af', low: '#5b8ba8', moderate: '#c9a227', high: '#d9772e', critical: '#c1503a' };
export const BAND_COLOR_LIGHT = { safe: '#227a70', low: '#3f6a85', moderate: '#9c7a14', high: '#b8631f', critical: '#a63f2b' };
export const BAND_LABEL = { safe: 'Safe', low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' };
export const BAND_RANK = { critical: 4, high: 3, moderate: 2, low: 1, safe: 0 };
export const BAND_ORDER = ['critical', 'high', 'moderate', 'low', 'safe'];
export const BAND_STATUS = { critical: 'Urgent migration', high: 'Urgent migration', moderate: 'Plan migration', low: 'Monitor', safe: 'Safe' };
export const BAND_DEADLINE = { critical: '30 days', high: '60 days', moderate: '180 days', low: 'Next review cycle', safe: '—' };

// ---------------------------------------------------------------------------
// Derived per-finding fields for the Crypto Inventory table — computed from
// the fields already on each finding rather than duplicated as separate
// hand-maintained data, so they can't drift out of sync with band/algorithm.
// ---------------------------------------------------------------------------

// "RSA-2048" -> "2048-bit". Protocol-version findings (e.g. "TLS 1.2") have
// no key size of their own, so they render as "—".
export function deriveKeySize(f) {
  const m = String(f.algorithm).match(/(\d{3,4})/);
  return m ? `${m[1]}-bit` : '—';
}

// QARS — Quantum-Adjusted Risk Score (0-100). Blends how urgent the band is,
// whether the finding is actually Shor-breakable (not just outdated), and
// how confident the detector is that the finding is real.
export function computeQARS(f) {
  const score = BAND_RANK[f.band] * 20 + (f.shorVulnerable ? 10 : 0) + Math.round((f.confidence || 0) * 10);
  return Math.max(0, Math.min(100, score));
}

// Where the asset sits in the data lifecycle.
export function deriveLayer(f) {
  if (f.type === 'Algorithm') return 'In use';
  if (f.type === 'SSH key' || f.type === 'Key') return 'At rest';
  return 'In transit'; // Certificate, Protocol
}

// How sensitive the data behind this asset is — from its data classification
// where one exists, with sane fallbacks for signature-only / key-material
// findings that carry no dataClassification.
export function deriveSensitivity(f) {
  const label = f.dataClassification?.label || '';
  if (/financial|payment|customer|account|session|auth/i.test(label)) return 'High';
  if (/internal/i.test(label)) return 'Medium';
  if (/cache|short-lived/i.test(label)) return 'Low';
  if (f.asset === 'kms-master-key') return 'Critical';
  if (f.type === 'SSH key' || f.type === 'Algorithm') return 'Medium';
  return 'Low';
}

// Internal-only vs. internet-facing — informs blast radius.
const EXPOSURE_BY_ASSET = {
  'payments.internal': 'External-facing',
  'legacy-portal.crt': 'External-facing',
  'legacy-build-key': 'Internal-only',
  'deploy-key-01': 'Internal-only',
  'auth-service': 'External-facing',
  'internal-mesh.pem': 'Internal-only',
  'internal-cache': 'Internal-only',
  'database-proxy': 'Internal-only',
  'kms-master-key': 'Internal-only',
};
export function deriveExposure(f) {
  return EXPOSURE_BY_ASSET[f.asset] || 'Internal-only';
}

// Which quantum algorithm actually threatens this asset — Shor breaks
// key-exchange/signature outright, Grover only weakens symmetric crypto
// (AES-256 stays safe against it), and classical-only findings aren't a
// quantum-algorithm concern at all.
export function deriveQuantumThreat(f) {
  if (f.vulnerableSurface === 'symmetric') return "Grover's algorithm (weakened only — AES-256 remains safe)";
  if (f.shorVulnerable) return "Shor's algorithm";
  return 'None — classical weakness only';
}

// Counts per band, in fixed critical→safe order, for the risk bar chart.
export function getBandCounts(findings = FINDINGS) {
  return BAND_ORDER.map((band) => ({ band, label: BAND_LABEL[band], count: findings.filter((f) => f.band === band).length }));
}

// Single 0-100 "Overall risk score" for the whole inventory — the mean QARS
// across every finding, so one freshly-critical asset moves it visibly but
// doesn't singlehandedly dominate it the way "worst case" framing would.
export function computeOverallRiskScore(findings = FINDINGS) {
  if (!findings.length) return 0;
  return Math.round(findings.reduce((sum, f) => sum + computeQARS(f), 0) / findings.length);
}

// Maps a 0-100 score back onto the band palette so the risk-score square can
// reuse the same colors as everything else.
export function riskScoreBand(score) {
  if (score >= 81) return 'critical';
  if (score >= 61) return 'high';
  if (score >= 41) return 'moderate';
  if (score >= 21) return 'low';
  return 'safe';
}

// Mock cryptographic-asset dependency graph — node risk values are kept in
// sync with FINDINGS wherever the same asset appears in both.
export const GRAPH_NODES = [
  { id: 'ca-root', name: 'Root CA', type: 'ca', risk: 'safe' },
  { id: 'cert-api', name: 'api.semicolon.internal', type: 'cert', risk: 'safe' },
  { id: 'cert-pay', name: 'payments.internal', type: 'cert', risk: 'critical' },
  { id: 'key-ssh-1', name: 'deploy-key-01', type: 'key', risk: 'high' },
  { id: 'key-ssh-2', name: 'legacy-build-key', type: 'key', risk: 'critical' },
  { id: 'svc-auth', name: 'auth-service', type: 'service', risk: 'high' },
  { id: 'svc-payments', name: 'payments-service', type: 'service', risk: 'critical' },
  { id: 'svc-gateway', name: 'api-gateway', type: 'service', risk: 'moderate' },
  { id: 'proto-tls13', name: 'TLS 1.3', type: 'protocol', risk: 'safe' },
  { id: 'proto-tls10', name: 'TLS 1.0', type: 'protocol', risk: 'high' },
  { id: 'cert-internal', name: 'internal-mesh.pem', type: 'cert', risk: 'moderate' },
  { id: 'key-kms', name: 'kms-master-key', type: 'key', risk: 'safe' },
  { id: 'svc-db', name: 'database-proxy', type: 'service', risk: 'safe' },
  { id: 'cert-legacy', name: 'legacy-portal.crt', type: 'cert', risk: 'critical' },
  { id: 'svc-portal', name: 'legacy-portal', type: 'service', risk: 'critical' },
  { id: 'proto-ssh2', name: 'SSH-2 RSA-1024', type: 'protocol', risk: 'critical' },
];
export const GRAPH_LINKS = [
  { source: 'svc-gateway', target: 'cert-api' }, { source: 'cert-api', target: 'ca-root' },
  { source: 'svc-auth', target: 'proto-tls13' }, { source: 'svc-payments', target: 'cert-pay' },
  { source: 'cert-pay', target: 'ca-root' }, { source: 'svc-payments', target: 'proto-tls10' },
  { source: 'svc-payments', target: 'key-ssh-2' }, { source: 'svc-gateway', target: 'svc-auth' },
  { source: 'svc-gateway', target: 'svc-payments' }, { source: 'svc-db', target: 'key-kms' },
  { source: 'svc-gateway', target: 'svc-db' }, { source: 'svc-portal', target: 'cert-legacy' },
  { source: 'cert-legacy', target: 'proto-ssh2' }, { source: 'svc-portal', target: 'key-ssh-1' },
  { source: 'cert-internal', target: 'ca-root' }, { source: 'svc-db', target: 'cert-internal' },
];

// ---------------------------------------------------------------------------
// Findings. Confidence and risk band stay deliberately separate — one says
// "how sure are we this is real", the other says "how urgent is it".
//
// `remediation` is only present on findings that need action (band !== 'safe').
// Each has `bridge` (an interim/hybrid option) and `full` (the end-state PQC
// migration). Either can be `available: false` — when the ecosystem genuinely
// doesn't have a stable drop-in yet (e.g. PQC SSH signature keys), the patch
// says so instead of inventing code that doesn't correspond to anything real.
// ---------------------------------------------------------------------------
export const FINDINGS = [
  // Representative component from the backend CBOM contract. It makes the
  // Fix-it feature visible in the normal demo flow while retaining the exact
  // `fix_suggestion` string shape generated by cbom/fix_suggestions.py.
  {
    id: 'f010', asset: 'LegacyAuthService.java', type: 'Algorithm', algorithm: 'RSA-1024',
    sourceAlgorithm: 'RSA', confidence: 0.95, location: 'src/auth/LegacyAuthService.java', lineNumber: 19, language: 'Java',
    sourceSnippet: 'KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");',
    fixSuggestion: 'Use a PQC library like liboqs-java for ML-KEM instead of RSA. Example:\nKeyPairGenerator kpg = KeyPairGenerator.getInstance("ML-KEM", "liboqs");\nKeyPair kp = kpg.generateKeyPair();',
    fromCbom: true, shorVulnerable: true, band: 'critical',
    recommendation: { primary: 'ML-KEM (Kyber) for key exchange, ML-DSA (Dilithium) for signatures', fallback: '—', fallback2: '—', effort: 'To be estimated' },
    vulnerableSurface: 'signature', hndlRelevant: false, dataClassification: null,
    remediation: {
      attackModel: 'Shor',
      rationale: 'RSA is broken by Shor\'s algorithm on a cryptographically relevant quantum computer. The attached backend suggestion is a code-level starting point, not a complete migration plan.',
      breakingChangeRisk: 'medium',
      breakingChangeReasons: ['Validate the PQC provider, certificate lifecycle, protocol interoperability, test coverage, and staged rollout with the owning team.'],
      effortHours: 16,
      bridge: { available: true, title: 'Backend-guided code change', summary: 'Review the generated Suggested Fix below.', library: 'liboqs-java', before: null, after: null, notes: null },
      full: { available: false, title: 'Organization-level migration required', summary: 'Plan certificate, protocol, interoperability, testing, and rollout work with the owning team.', library: null, before: null, after: null, notes: null },
    },
  },
  {
    id: 'f001', asset: 'payments.internal', type: 'Certificate', algorithm: 'RSA-2048',
    confidence: 0.93, location: 'src/tls/payments.pem', language: 'nginx / TLS config',
    shorVulnerable: true, band: 'critical',
    recommendation: { primary: 'ML-KEM-768', fallback: 'ML-KEM-1024 (hybrid w/ X25519)', fallback2: 'Classic McEliece-460896 (conservative alt. KEM)', effort: 'Medium' },
    vulnerableSurface: 'key-exchange', hndlRelevant: true,
    dataClassification: { label: 'Financial / payment data', shelfLifeYears: 15 },
    remediation: {
      attackModel: 'Shor',
      rationale: "This endpoint's TLS handshake negotiates its shared secret through an ephemeral key-exchange group (classically X25519 or P-256), which Shor's algorithm breaks on a large enough quantum computer. Traffic recorded today is decryptable retroactively once that capability exists — the classic 'harvest now, decrypt later' target. The certificate's own RSA-2048 keypair is a separate concern (see notes): it governs authentication, not this exposure.",
      breakingChangeRisk: 'medium',
      breakingChangeReasons: [
        'Every TLS-terminating hop (load balancers, CDN, reverse proxies) needs to support the negotiated group, not just the origin.',
        'Clients on older TLS stacks that offer no PQC group will fall back to classical key exchange — confirm that fallback is graceful, not a hard failure.',
      ],
      effortHours: 24,
      bridge: {
        available: true,
        title: 'Hybrid key exchange (X25519 + ML-KEM-768)',
        summary: "Add a post-quantum KEM alongside the classical exchange so a break of either alone isn't enough. Already the default in Chrome, Firefox, and OpenSSL 3.2+ with oqs-provider.",
        library: 'OpenSSL 3.2+ / oqs-provider, or a TLS stack that ships X25519MLKEM768 natively (BoringSSL, recent OpenSSL).',
        before: `# nginx.conf — payments.internal, classical-only key exchange\nssl_protocols        TLSv1.2 TLSv1.3;\nssl_ecdh_curve        X25519:prime256v1;\nssl_certificate       /etc/ssl/payments.internal.pem;   # RSA-2048\nssl_certificate_key   /etc/ssl/payments.internal.key;`,
        after: `# nginx.conf — hybrid PQC key exchange added\n# Requires nginx built against OpenSSL 3.2+ (or BoringSSL) with PQC group support\nssl_protocols        TLSv1.3;                          # PQC groups are TLS 1.3-only\nssl_ecdh_curve        X25519MLKEM768:X25519:prime256v1; # hybrid group offered first\nssl_certificate       /etc/ssl/payments.internal.pem;   # certificate itself unchanged\nssl_certificate_key   /etc/ssl/payments.internal.key;`,
        notes: "This only hybridizes the key-exchange group — the part that protects confidentiality against harvest-now-decrypt-later. The certificate's RSA-2048 signature (authentication) is lower-urgency and covered by the full-migration option.",
      },
      full: {
        available: true,
        title: 'Full PQC certificate (ML-KEM-768 leaf key)',
        summary: 'Reissue the certificate with an ML-KEM-768 keypair once your CA and client population support FIPS 203 certificates. Public CA support for PQC leaf certs is still rolling out — confirm your CA has a path before committing a cutover date.',
        library: 'openssl (oqs-provider) or your CA\'s PQC issuance API.',
        before: `openssl req -new -newkey rsa:2048 -keyout payments.key -out payments.csr`,
        after: `# Requires an OQS-enabled OpenSSL build\nopenssl req -new -newkey mlkem768 -keyout payments.key -out payments.csr`,
        notes: 'Confirm client/browser support before cutting over — clients with no PQC support at all will fail a PQC-only handshake rather than falling back.',
      },
    },
  },
  {
    id: 'f002', asset: 'legacy-portal.crt', type: 'Certificate', algorithm: 'RSA-1024',
    confidence: 0.91, location: 'infra/legacy-portal.crt', language: 'nginx / TLS config',
    shorVulnerable: true, band: 'critical',
    recommendation: { primary: 'ML-KEM-1024', fallback: 'ML-KEM-768 (hybrid w/ X25519)', fallback2: 'Classic McEliece-6688128 (conservative alt. KEM)', effort: 'High' },
    vulnerableSurface: 'key-exchange', hndlRelevant: true,
    dataClassification: { label: 'Customer / account data', shelfLifeYears: 8 },
    remediation: {
      attackModel: 'Shor',
      rationale: 'RSA-1024 is undersized even against classical factoring attacks today, on top of being fully broken by Shor\'s algorithm on a future quantum computer — this is the single highest-priority asset in the scan on both counts. As with any TLS endpoint, the HNDL exposure comes from the negotiated key-exchange group, independent of the certificate\'s own algorithm.',
      breakingChangeRisk: 'high',
      breakingChangeReasons: [
        "Named 'legacy-portal' — likely still serves old client software that may not support TLS 1.3 or any PQC group. Audit real client TLS versions before enforcing hybrid-only.",
        'RSA-1024 is weak classically too — if PQC tooling isn\'t ready, reissuing at RSA-3072 or ECDSA P-384 first is a reasonable immediate stopgap ahead of hybridizing.',
      ],
      effortHours: 40,
      bridge: {
        available: true,
        title: 'Hybrid key exchange (X25519 + ML-KEM-1024)',
        summary: 'Uses the higher-margin ML-KEM-1024 parameter set given this asset\'s exposure and likely longer client tail.',
        library: 'OpenSSL 3.2+ / oqs-provider.',
        before: `ssl_protocols        TLSv1.0 TLSv1.1 TLSv1.2;\nssl_ecdh_curve        prime256v1;\nssl_certificate       /etc/ssl/legacy-portal.crt;   # RSA-1024`,
        after: `# Legacy client audit required first — see breaking-change notes.\nssl_protocols        TLSv1.2 TLSv1.3;              # drop TLS 1.0/1.1 regardless\nssl_ecdh_curve        X25519MLKEM1024:X25519:prime256v1;\nssl_certificate       /etc/ssl/legacy-portal.crt;   # reissue at RSA-3072+ minimum if PQC tooling isn't ready`,
        notes: 'Dropping TLS 1.0/1.1 is worth doing immediately regardless of PQC timeline — those versions predate authenticated encryption in several cipher suites.',
      },
      full: {
        available: true,
        title: 'Full PQC certificate (ML-KEM-1024 leaf key)',
        summary: 'Reissue once CA and client support exists — track this asset separately since it likely has the longest client tail in the estate.',
        library: 'openssl (oqs-provider) or your CA\'s PQC issuance API.',
        before: `openssl req -new -newkey rsa:1024 -keyout portal.key -out portal.csr`,
        after: `openssl req -new -newkey mlkem1024 -keyout portal.key -out portal.csr`,
        notes: 'Do not ship PQC-only here until the legacy client audit above is complete.',
      },
    },
  },
  {
    id: 'f003', asset: 'legacy-build-key', type: 'SSH key', algorithm: 'RSA-1024',
    confidence: 0.82, location: 'keys/legacy-build-key', language: 'OpenSSH',
    shorVulnerable: true, band: 'critical',
    recommendation: { primary: 'ML-DSA-65', fallback: 'SLH-DSA', fallback2: 'FN-DSA-512 (Falcon)', effort: 'Medium' },
    vulnerableSurface: 'signature', hndlRelevant: false,
    dataClassification: null,
    remediation: {
      attackModel: 'Shor',
      rationale: "This key signs (authenticates), it doesn't encrypt — Shor's algorithm would let a future quantum adversary forge signatures from the recovered private key, but there's no stored ciphertext to harvest in the meantime. That means this finding is NOT an HNDL/breach-window case the way the two TLS certificates above are: the risk window only opens once a cryptographically-relevant quantum computer exists, not before.",
      breakingChangeRisk: 'low',
      breakingChangeReasons: ['Rotating a build key means updating deploy-pipeline secrets and any known-hosts / fingerprint pins that reference it.'],
      effortHours: 6,
      bridge: {
        available: false,
        title: 'No mainstream hybrid signature scheme yet',
        summary: 'OpenSSH does not yet ship a stable PQC signature key type (ML-DSA / SLH-DSA SSH host or user keys are still experimental upstream as of this writing) — there is no drop-in hybrid patch to show here.',
        library: null,
        before: `# Current: RSA-1024 signing key\nssh-keygen -t rsa -b 1024 -f legacy-build-key`,
        after: `# Interim mitigation (not a PQC migration — there isn't one to apply yet):\n\n# 1) Rotate the weak key now, independent of any quantum timeline — RSA-1024\n#    is within reach of classical factoring attacks today.\nssh-keygen -t rsa -b 4096 -f legacy-build-key-rotated\n\n# 2) Confirm hybrid PQC key EXCHANGE is active for the session — this protects\n#    confidentiality even though the signature algorithm above is still classical.\nssh -Q kex | grep mlkem\n#   mlkem768x25519-sha256      <- default on OpenSSH >= 9.9\n\n# 3) Track OpenSSH's release notes for a stable PQC signature key type before\n#    planning an actual "full" migration for this key.`,
        notes: 'The effort hours here are almost entirely key-rotation admin, not PQC engineering — there is nothing to port yet.',
      },
      full: {
        available: false,
        title: 'Full PQC signature migration — not yet available',
        summary: 'No stable ML-DSA/SLH-DSA SSH key type exists in mainstream OpenSSH as of this writing. Revisit once upstream ships one.',
        library: null, before: null, after: null, notes: null,
      },
    },
  },
  {
    id: 'f004', asset: 'deploy-key-01', type: 'SSH key', algorithm: 'ECDSA P-256',
    confidence: 0.85, location: 'keys/deploy-key-01', language: 'OpenSSH',
    shorVulnerable: true, band: 'high',
    recommendation: { primary: 'ML-DSA-65', fallback: 'SLH-DSA', fallback2: 'FN-DSA-512 (Falcon)', effort: 'Low' },
    vulnerableSurface: 'signature', hndlRelevant: false,
    dataClassification: null,
    remediation: {
      attackModel: 'Shor',
      rationale: "Like the RSA build key above, ECDSA relies on a hard problem (the elliptic-curve discrete log) that Shor's algorithm solves efficiently on a large quantum computer — and like that key, this is a signing key with no stored ciphertext to harvest, so it sits outside the HNDL/breach-window model.",
      breakingChangeRisk: 'low',
      breakingChangeReasons: ['Deploy tooling needs the new fingerprint; low blast radius otherwise.'],
      effortHours: 4,
      bridge: {
        available: false,
        title: 'No mainstream hybrid signature scheme yet',
        summary: 'Same gap as the RSA signing key above — no stable PQC SSH signature type exists upstream yet.',
        library: null,
        before: `# Current: ECDSA P-256 deploy key\nssh-keygen -t ecdsa -b 256 -f deploy-key-01`,
        after: `# ECDSA and Ed25519 are both elliptic-curve schemes broken by the same\n# Shor's-algorithm attack — rotating to Ed25519 improves classical hygiene\n# (smaller keys, fewer implementation pitfalls) but is NOT a quantum fix.\nssh-keygen -t ed25519 -f deploy-key-01-rotated\n\n# The real quantum mitigation available today is session-level, not key-level:\nssh -Q kex | grep mlkem\n#   mlkem768x25519-sha256      <- default hybrid PQC key exchange, OpenSSH >= 9.9\n\n# No stable PQC signature key type exists in mainstream OpenSSH yet.`,
        notes: "Don't market an Ed25519 rotation as a PQC fix internally — it's a legitimate classical-hygiene improvement, nothing more.",
      },
      full: {
        available: false,
        title: 'Full PQC signature migration — not yet available',
        summary: 'Track upstream OpenSSH support; nothing stable to migrate to yet.',
        library: null, before: null, after: null, notes: null,
      },
    },
  },
  {
    id: 'f005', asset: 'auth-service', type: 'Protocol', algorithm: 'TLS 1.0',
    confidence: 0.88, location: 'config/auth-service.yaml', language: 'YAML (service config)',
    shorVulnerable: false, band: 'high',
    recommendation: { primary: 'TLS 1.3', fallback: 'TLS 1.2 (interim)', fallback2: 'TLS 1.3 + hybrid ML-KEM-768 group', effort: 'Low' },
    vulnerableSurface: 'protocol-version', hndlRelevant: true,
    dataClassification: { label: 'Session tokens / auth traffic', shelfLifeYears: 2 },
    remediation: {
      attackModel: 'classical-only',
      rationale: "TLS 1.0 isn't itself a quantum concern — it's classical protocol hygiene. It's flagged here because PQC hybrid key-exchange groups are only defined for TLS 1.3, so this upgrade is the prerequisite, not the fix. It's also worth flagging the HNDL angle explicitly: some TLS 1.0 cipher suites use static RSA key transport with no forward secrecy at all, meaning every past session recorded under one of those suites is decryptable in bulk from a single compromised key — a starker exposure than a modern ephemeral-DHE endpoint.",
      breakingChangeRisk: 'low',
      breakingChangeReasons: ['Any client still hard-pinned to TLS 1.0 will break — check for legacy integrations before cutting over.'],
      effortHours: 8,
      bridge: {
        available: true,
        title: 'Required first step: TLS 1.3',
        summary: "This alone doesn't add quantum resistance, but it's the prerequisite — PQC hybrid groups can't be negotiated on anything older than TLS 1.3.",
        library: 'Your TLS terminator / service mesh config.',
        before: `# config/auth-service.yaml\ntls:\n  min_version: "1.0"\n  cipher_suites: ["TLS_RSA_WITH_AES_128_CBC_SHA"]   # static RSA key transport — no forward secrecy`,
        after: `tls:\n  min_version: "1.3"          # mandates forward secrecy; prerequisite for PQC hybrid groups`,
        notes: 'Do this regardless of PQC plans — it removes the non-forward-secret cipher suites, which is the more urgent problem.',
      },
      full: {
        available: true,
        title: 'Add hybrid PQC key exchange',
        summary: 'Once on TLS 1.3 and your terminator supports it, layer on the hybrid group.',
        library: 'A TLS 1.3 terminator with PQC group support.',
        before: `tls:\n  min_version: "1.3"`,
        after: `tls:\n  min_version: "1.3"\n  key_exchange_groups: ["X25519MLKEM768", "X25519"]`,
        notes: null,
      },
    },
  },
  {
    id: 'f006', asset: 'internal-mesh.pem', type: 'Certificate', algorithm: 'ECDSA P-256',
    confidence: 0.89, location: 'infra/mesh/internal-mesh.pem', language: 'Envoy / service-mesh config',
    shorVulnerable: true, band: 'moderate',
    recommendation: { primary: 'ML-DSA-65', fallback: 'SLH-DSA', fallback2: 'FN-DSA-512 (Falcon)', effort: 'Medium' },
    vulnerableSurface: 'key-exchange', hndlRelevant: true,
    dataClassification: { label: 'Internal service-mesh traffic', shelfLifeYears: 5 },
    remediation: {
      attackModel: 'Shor',
      rationale: "This mTLS endpoint's own ephemeral key-exchange group carries the same HNDL exposure as any TLS endpoint, independent of the certificate's ECDSA algorithm. The certificate's ECDSA P-256 signature is used to authenticate the service's identity during the handshake — a separate, non-HNDL, future-forgery-only concern (same category as the SSH signing keys above).",
      breakingChangeRisk: 'medium',
      breakingChangeReasons: ['Every mesh sidecar needs a PQC-capable TLS build before this can be enforced fleet-wide.'],
      effortHours: 16,
      bridge: {
        available: true,
        title: 'Hybrid key exchange in the mesh TLS context',
        summary: 'Illustrative Envoy-style config — the concrete keys will differ by mesh implementation (Envoy, Linkerd, Istio), but the shape is the same: raise the TLS floor, add the hybrid group.',
        library: 'A PQC-capable BoringSSL/OpenSSL build linked into your mesh proxy.',
        before: `# Envoy upstream TLS context (illustrative) — internal-mesh\ntls_context:\n  common_tls_context:\n    tls_params:\n      tls_minimum_protocol_version: TLSv1_2\n      ecdh_curves: [X25519, P-256]\n    tls_certificates:\n      - certificate_chain: { filename: "internal-mesh.pem" }   # ECDSA P-256`,
        after: `# Requires a mesh proxy build linked against a PQC-capable BoringSSL/OpenSSL\ntls_context:\n  common_tls_context:\n    tls_params:\n      tls_minimum_protocol_version: TLSv1_3\n      ecdh_curves: [X25519MLKEM768, X25519]\n    tls_certificates:\n      - certificate_chain: { filename: "internal-mesh.pem" }   # cert's ECDSA signature is a separate, non-HNDL item`,
        notes: null,
      },
      full: {
        available: false,
        title: 'Full PQC mesh certificates — ecosystem still maturing',
        summary: 'ML-DSA-signed mesh certificates are workable in principle but most service-mesh control planes (cert-manager, Istio Citadel, etc.) don\'t yet issue them out of the box. Revisit once your mesh\'s CA integration supports FIPS 204.',
        library: null, before: null, after: null, notes: null,
      },
    },
  },
  {
    id: 'f009', asset: 'internal-cache', type: 'Protocol', algorithm: 'TLS 1.2',
    confidence: 0.86, location: 'config/cache.yaml', language: 'YAML (service config)',
    shorVulnerable: false, band: 'low',
    recommendation: { primary: 'TLS 1.3', fallback: 'Keep TLS 1.2 with a strong cipher suite', fallback2: 'TLS 1.3 + hybrid ML-KEM-768 group (defer — short shelf-life)', effort: 'Low' },
    vulnerableSurface: 'protocol-version', hndlRelevant: true,
    dataClassification: { label: 'Short-lived cache data', shelfLifeYears: 1 },
    remediation: {
      attackModel: 'classical-only',
      rationale: 'TLS 1.2 with ECDHE already provides forward secrecy, so this is a low-urgency modernization rather than an active weakness — flagged mainly because this cache data has such a short required secrecy window (see the Mosca Timeline) that it may not be worth prioritizing ahead of the critical findings above.',
      breakingChangeRisk: 'low',
      breakingChangeReasons: [],
      effortHours: 4,
      bridge: {
        available: true,
        title: 'Move to TLS 1.3',
        summary: 'Low priority given the short data shelf-life, but a clean, low-risk change whenever it fits the schedule.',
        library: 'Your TLS terminator config.',
        before: `# config/cache.yaml\ntls:\n  min_version: "1.2"\n  cipher_suites: ["ECDHE-RSA-AES128-GCM-SHA256"]`,
        after: `tls:\n  min_version: "1.3"\n  key_exchange_groups: ["X25519MLKEM768", "X25519"]   # low priority — short-lived cache data`,
        notes: null,
      },
      full: { available: true, title: 'Already covered by the bridge step', summary: 'TLS 1.3 + hybrid group is the end state for this asset — no separate full-migration step.', library: null, before: null, after: null, notes: null },
    },
  },
  {
    id: 'f007', asset: 'database-proxy', type: 'Algorithm', algorithm: 'AES-256-GCM',
    confidence: 0.95, location: 'src/db/proxy.py', language: 'Python',
    shorVulnerable: false, band: 'safe',
    recommendation: { primary: 'AES-256-GCM — no change needed', fallback: '—', fallback2: '—', effort: 'None' },
    vulnerableSurface: 'symmetric', hndlRelevant: false, dataClassification: null, remediation: null,
  },
  {
    id: 'f008', asset: 'kms-master-key', type: 'Key', algorithm: 'AES-256',
    confidence: 0.94, location: 'vault/kms-master-key', language: 'N/A',
    shorVulnerable: false, band: 'safe',
    recommendation: { primary: 'AES-256 — no change needed', fallback: '—', fallback2: '—', effort: 'None' },
    vulnerableSurface: 'symmetric', hndlRelevant: false, dataClassification: null, remediation: null,
  },
];

// Findings that actually need action, ranked by urgency — the same filter
// the Dashboard's "PQC readiness" and "Recommendation" sections use,
// reused here so the Remediator and Mosca Timeline never diverge from it.
export function actionableFindings(findings = FINDINGS) {
  return [...findings].filter((f) => f.band !== 'safe').sort((a, b) => BAND_RANK[b.band] - BAND_RANK[a.band]);
}

// Only the subset where Mosca's inequality actually applies (see file header).
export function hndlFindings(findings = FINDINGS) {
  return actionableFindings(findings).filter((f) => f.hndlRelevant);
}
export function signatureOnlyFindings(findings = FINDINGS) {
  return actionableFindings(findings).filter((f) => !f.hndlRelevant);
}

// Projection used by the Dashboard's "before vs. after" bar graph — an
// estimate for planning, not a guarantee, exactly as labeled in the UI.
const PROJECTED_AFTER_FIXES = { safe: 7, low: 1, moderate: 1, high: 0, critical: 0 };
export function getRiskComparison(findings = FINDINGS) {
  return BAND_ORDER.slice().reverse().map((band) => ({
    band, label: BAND_LABEL[band],
    current: findings.filter((f) => f.band === band).length,
    projected: PROJECTED_AFTER_FIXES[band],
  }));
}

// ---------------------------------------------------------------------------
// Rough translation from "engineering hours to build the fix" to
// "organizational time to actually roll it out". Coordinated PQC rollouts
// carry planning, vendor/dependency, and staged-deployment overhead well
// beyond the raw coding hours, so this is a fixed minimum plus a
// risk-scaled multiplier on the effort hours — a starting point to
// override in the Mosca Timeline, not a forecast.
// ---------------------------------------------------------------------------
const MIN_ROLLOUT_YEARS = 0.5;
const RISK_MULTIPLIER = { low: 1, medium: 2, high: 3.5 };
const WORK_HOURS_PER_MONTH = 160;

export function estimateMigrationYears(effortHours, breakingChangeRisk) {
  if (!effortHours && effortHours !== 0) return null;
  const engineeringMonths = effortHours / WORK_HOURS_PER_MONTH;
  const rolloutYears = (engineeringMonths / 12) * (RISK_MULTIPLIER[breakingChangeRisk] || 1.5);
  return +(MIN_ROLLOUT_YEARS + rolloutYears).toFixed(2);
}

// ---------------------------------------------------------------------------
// Q-Day: modeled as a probability range, never a single confident year.
// The shape below is illustrative — built to look like the kind of
// expert-survey estimates published by groups such as the Global Risk
// Institute's Quantum Threat Timeline report — not a specific citation.
// Swap in your own organization's risk-register numbers; the simulator
// treats these as editable inputs, not fixed truth.
// ---------------------------------------------------------------------------
export const QDAY_DISTRIBUTION_YEARS_FROM_NOW = { p25: 8, p50: 13, p75: 21 };

// ---------------------------------------------------------------------------
// Compliance mapping tables (Compliance & CBOM Reports page).
// Dates and control IDs reflect publicly published NIST/NSA guidance as
// commonly summarized; both bodies have refined these over time, so treat
// this as a starting map and confirm against the current official advisory
// before using it as evidence in a real audit.
// ---------------------------------------------------------------------------
export const NIST_800_53_CONTROLS = [
  { id: 'SC-8', title: 'Transmission Confidentiality and Integrity', appliesTo: ['key-exchange', 'protocol-version'] },
  { id: 'SC-12', title: 'Cryptographic Key Establishment and Management', appliesTo: ['key-exchange', 'signature'] },
  { id: 'SC-13', title: 'Cryptographic Protection', appliesTo: ['key-exchange', 'signature', 'protocol-version'] },
  { id: 'SC-17', title: 'Public Key Infrastructure Certificates', appliesTo: ['signature'] },
  { id: 'IA-7', title: 'Cryptographic Module Authentication', appliesTo: ['signature'] },
];

export const CNSA2_MILESTONES = [
  { category: 'Software & firmware signing', preferBy: 2025, exclusiveBy: 2030 },
  { category: 'Web browsers, servers & cloud services', preferBy: 2025, exclusiveBy: 2033 },
  { category: 'Traditional networking equipment', preferBy: 2026, exclusiveBy: 2030 },
  { category: 'National security systems (general)', preferBy: 2027, exclusiveBy: 2033 },
];
