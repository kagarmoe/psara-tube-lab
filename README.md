# PSARA Tube Lab

**PSARA Tube Lab** is a browser- and tablet-friendly vacuum tube inventory workbench, reference library, and unmarked-tube identification assistant built for the **Puget Sound Antique Radio Association (PSARA)**.

It replaces desktop-only Excel/VBA spreadsheets so club members can search over **5,400 tubes across 700+ reference types**, check pinout and envelope diagrams on their phone or bench laptop, build print-ready pull sheets, identify unmarked mystery tubes, and let club curators stage donations without duplicate imports.

---

## Key Capabilities

- **Find a Tube (Accessible Club Search):**
  - 4-tier ranked lookup (`Exact` → `Prefix` → `Substitutes` → `Family/Notes Keywords`) with live stock totals computed dynamically per physical box and layer.
  - Strict quarantine of `Unidentified` records until verified by a curator.
  - Direction-aware substitute warnings (enforcing one-way `Related replaces Original` rules so an older tube is never mistakenly substituted into a socket requiring the upgraded replacement).
  - High-resolution **Basing / Pinout Diagrams** and **Envelope Outlines** (835 static reference PNGs), zoomable lightbox view, and a persistent **Inches (`in`) / Millimeters (`mm`)** unit toggle.
- **Pull Sheets & Return Ledger:**
  - Members reserve specific boxes/layers directly from tube pages, deduct stock inside atomic PostgreSQL transactions, print shop pick-lists, and log returns with updated test results (`Tested`, `Weak`, `Bad`) and condition (`NOS`, `Used`).
- **Mystery Tube Helper:**
  - 100% deterministic 5-stage physical identification checklist (`Pin Count`, `Base Socket`, `Top Cap`, `Envelope Silhouette`, `Diameter / Height`, `Filament Continuity` presets, and `Visible Electrodes`) ranking candidate tubes alongside inline trial pinouts.
  - Optional progressive-enhancement **Photo Assist** drawer supporting runtime env vars (or per-session BYOK / local Ollama) with zero keys saved to the repo or database.
- **Manage Inventory (Curator & Admin Workbench):**
  - **Single Intake** with existing reference enrichment snapshots or automatic `TXXXX` reference creation.
  - **Batch Spreadsheet Import** (`.xlsx`, `.xlsm`, `.csv`, or pasted rows) detecting headers in rows 1–20 and preventing double-imports via `Source Signature` deduplication.
  - **Review & Quarantine Queue**, **`?` Uncounted Lot & Split Audit**, **System Readiness Diagnostics**, and full multi-sheet **`.xlsx` Workbook Export**.

---

## Tech Stack

- **Frontend / Server:** SvelteKit (Svelte 5 + TypeScript + Tailwind CSS v4 + `@sveltejs/adapter-node`)
- **Database:** PostgreSQL (`drizzle-orm` + `drizzle-kit` + `postgres`)
- **Spreadsheet I/O:** `exceljs`, `jszip`, `fast-xml-parser`
- **Hosting:** Render.com Blueprint ([render.yaml](render.yaml)) + local Docker Compose Postgres ([docker-compose.yml](docker-compose.yml))

---

## Security & Zero-PII Design

- No member names, phone numbers, email addresses, or directory rosters live in this repository or database.
- Individual curator/admin passwords are `scrypt`-hashed and seeded from runtime environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`), alongside a shared club access code (`MEMBER_ACCESS_CODE`) and optional `DEMO_MODE=true` role switcher for portfolio visitors.
- AI keys are never committed or stored on disk; optional runtime variables can be injected strictly in memory (for example via 1Password CLI `op run`).

---

## Local Development Setup

### Prerequisites
- Node.js 22+
- Docker Desktop (for local PostgreSQL)

### Run Locally

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```
2. **Install dependencies & start PostgreSQL (exposed on port `5433` to avoid conflicting with local Postgres on `5432`):**
   ```bash
   npm install
   docker compose up -d
   ```
3. **Push Drizzle schema and load the seeded club catalog:**
   ```bash
   npm run db:push
   npm run seed:db
   ```
4. **Start the dev server:**
   ```bash
   npm run dev
   ```
5. **Run verification checks:**
   ```bash
   npm test
   npm run check
   npm run build
   ```

---

## Deploying to Render

This repository includes a Render Blueprint in [render.yaml](render.yaml) that provisions the Node web service and managed PostgreSQL database:

1. Push your branch to GitHub (`main`).
2. In the Render Dashboard, choose **New + -> Blueprint** (or sync the existing Blueprint) and connect this repository.
3. Fill in the prompted environment variables:
   - `MEMBER_ACCESS_CODE` (shared passcode for club members)
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` (credentials for the initial seeded curator/admin user)
4. Render automatically runs `drizzle-kit push --force`, runs the idempotent `seed:db` script against `seed/psara_seed.json`, and checks `GET /api/health`.
5. For real club production use (once ready), set `DEMO_MODE="false"` in the Render Dashboard Environment tab so sign-in is required.
