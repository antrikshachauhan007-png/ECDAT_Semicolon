<div align="center">

# `;` Semicolon — ECDAT

### Enterprise Cryptographic Discovery & Analysis Tool

**Find quantum-vulnerable cryptography. Score the risk. Plan the migration.**

Smart India Hackathon 2026 · Problem Statement **SIH26164** · NTRO · Blockchain & Cybersecurity

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.x-3776ab?logo=python&logoColor=white)
![CycloneDX](https://img.shields.io/badge/CBOM-CycloneDX%201.6-orange)

</div>

---

## The problem

Most organisations cannot say where RSA, ECC, or SHA-1 lives in their code, containers, and certificates. That matters because of **Harvest Now, Decrypt Later (HNDL)**: data encrypted today with quantum-vulnerable algorithms can be stolen now and decrypted once a large quantum computer exists. You can't migrate what you haven't found.

## What Semicolon does

```
Scan  →  Classify  →  CBOM  →  Risk score  →  Recommendations  →  Dashboard & reports
```

1. **Discover** cryptographic assets across source code, dependencies, certificates, Dockerfiles, container images, and binaries.
2. **Classify** them (algorithm, hash, library, key, certificate, protocol) and build a **Cryptographic Bill of Materials (CBOM)**.
3. **Score** each finding with a quantum-aware risk engine based on Mosca's theorem.
4. **Recommend** post-quantum replacements (e.g. RSA → ML-KEM, ECC/Ed25519 → ML-DSA, SHA-1 → SHA-256, DES → AES-256).
5. **Visualise and report** everything in a web dashboard: topology graph, PQC remediation, HNDL breach timeline, and audit-ready exports.

---

## Features

### Scanner (`scanner/`)
- Recursive directory scanning with per-language detectors: **Python, Java, C, JavaScript**, plus tree-sitter and Semgrep-based detection
- **Dependency** detection (crypto libraries in manifests)
- **Certificate & key analysis** via the OpenSSL CLI (subject, issuer, curve/key size, expiry, serial)
- **Dockerfile** and **container image** scanning (`--container python:3.12`)
- **Protocol** detection (TLS / SSL / SSH) and **binary** scanning
- Deduplicated, normalised JSON output

### CBOM (`cbom/`)
- Classification, duplicate removal with full provenance (every file and line an artifact was found at)
- Cross-file and cross-language pattern recognition
- Recommendation database and guided **fix-it suggestions** (before/after code for RSA and MD5 in Python and Java)
- **CycloneDX** export

### Risk engine (`risk_engine/`, `ecdat_risk_engine.py`)
- QARS-style scoring, separated by layer: **in transit / in use / at rest**
- Shor vs. Grover attenuation (symmetric crypto is far less affected than RSA/ECC)
- Mosca margins, review queue, and a data-quality report
- All weights, thresholds, and the Q-Day year are **planning parameters**, overridable via config

### Web app (`frontend/`)
| Route | Page |
|---|---|
| `/` | Landing page |
| `/login` | Sign-in |
| `/dashboard` | Scan overview, readiness score, interactive topology graph |
| `/remediator` | **PQC Remediation**: hybrid (X25519 + ML-KEM) and full-migration patch options, PR text, reviewer checklist |
| `/mosca-timeline` | **HNDL timeline**: Q-Day modelled as a P25/P50/P75 band against each asset's required-secrecy period |
| `/compliance-reports` | **CBOM & compliance**: CycloneDX 1.6 CBOM, NIST SP 800-53 and CNSA 2.0 coverage, PDF / CSV / ZIP evidence bundle |
| `/references`, `/help`, `/news`, `/activity`, `/settings` | Supporting pages |

Everything in the web app runs **client-side**. PDF, CSV, JSON, and ZIP generation happen in the browser (`jspdf`, `jszip`, Web Crypto).

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 18, Vite 5, React Router 6, Recharts, react-force-graph-2d, lucide-react, jsPDF, JSZip |
| Scanner / CBOM | Python 3, `javalang`, OpenSSL CLI, tree-sitter, Semgrep |
| Risk engine | Pure Python, no third-party dependencies |
| Testing | pytest |

---

## Repository structure

```
.
├── scanner/                 # Part 1: discovery engine
│   ├── scanner.py           #   orchestrator
│   └── detectors/           #   python, java, c, javascript, certificate, docker, ...
├── cbom/                    # Part 2: CBOM generation, classification, CycloneDX export
├── risk_engine/             # Part 3: Mosca / QARS risk scoring (package)
├── ecdat_risk_engine.py     #   standalone single-file risk engine + CLI
├── samples/                 # Intentionally weak sample code, Dockerfiles, certs for demos
├── sample_output/           # Example scanner and CBOM output
├── tests/                   # pytest suite
└── frontend/                # Part 5: React + Vite web app
    └── src/
        ├── pages/           #   Home, Dashboard, Remediator, MoscaTimeline, ComplianceReports, ...
        ├── components/      #   Sidebar, TopBar, ProtectedRoute, ErrorBoundary, ...
        ├── context/         #   AuthContext, ScanContext (single shared state)
        ├── data/            #   findings.js, references.js
        └── utils/           #   mosca.js, cbom.js
```

---

## Getting started

### Prerequisites
- **Node.js 18+** and npm (frontend)
- **Python 3.x** (scanner, CBOM, risk engine)
- **OpenSSL CLI** on your `PATH`. Certificate scanning shells out to it and fails without it.

### 1. Run the web app

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Build for production with `npm run build`.

### 2. Run the scan pipeline

```bash
pip install javalang

# 1. Scan a directory (the bundled samples are a good start)
python scanner/scanner.py samples -o scanner_output.json

# 2. Generate the CBOM
python cbom/cbom_generator.py scanner_output.json cbom_output.json

# 3. Score the findings
python ecdat_risk_engine.py scanner_output.json -o risk_report.json
```

Scan a container image instead:

```bash
python scanner/scanner.py --container python:3.12
```

Custom risk parameters:

```bash
python ecdat_risk_engine.py scanner_output.json --config cfg.json --q-day-year 2032
```

### 3. Run the tests

```bash
python -m pytest tests/ -v
```

---

## Current status and limitations

We'd rather be upfront about what is and isn't real yet.

- **The web app is not yet connected to the scanner.** The dashboard runs on a fixed demo dataset (`frontend/src/data/findings.js`). The Python pipeline produces the real scanner/CBOM/risk JSON; wiring it into the UI needs the backend API.
- **Backend API and database are not built yet** (planned: API + MongoDB).
- **Login is a client-side mock.** Route protection is UX gating, not security.
- **PQC Remediation is a deterministic lookup** of pre-written patch templates, not an AI model. Nothing is auto-applied to your code.
- **The CycloneDX CBOM is a defensible subset** of the 1.6 crypto-asset schema, not validated against the official JSON Schema.
- **Risk weights, Q-Day estimates, CNSA 2.0 dates, and NIST control mappings are illustrative planning values.** Confirm against current official guidance before using any output as audit evidence.

## Roadmap

- [ ] Backend API + database, and connecting the scanner output to the dashboard
- [ ] Fix-it suggestions for more languages and algorithms
- [ ] Validate CBOM output against the official CycloneDX schema
- [ ] Real authentication

---

## Team Semicolon

| Module | Owner |
|---|---|
| Scanner / discovery engine | Vaishnavi (initial Python/Java/C version by Snigdha) |
| CBOM generation, classification, recommendations | Snigdha |
| Risk engine (Mosca, scoring) | Samridhi |
| Backend API + database | Mansi |
| Frontend / dashboard | Antriksha & Anisha |

## References

Standards and sources used by the project are listed on the in-app **References** page. Key ones: NIST FIPS 203/204 (ML-KEM, ML-DSA), NIST SP 800-53, NIST IR 8547, NSA CNSA 2.0, CycloneDX 1.6, and the QARS quantum-risk-scoring literature.

---

<div align="center">
Built for Smart India Hackathon 2026
</div>
