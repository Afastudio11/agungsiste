# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild
- **Auth**: Session-based (username/password, express-session)
- **OCR**: Python 3.12 + OpenCV + pytesseract (primary); Tesseract.js v7 (fallback) — no LLM/AI used
  - Python scanner: CLAHE preprocessing, deskew, adaptive thresholding, zone-based extraction, digit whitelist for NIK
  - Region matching in Node.js: NIK-derived province/city, fuzzy birth place matching against 514 kabupaten/kota
- **Region DB**: Indonesian administrative regions (38 provinces, 500+ kabupaten/kota) with NIK-based auto-lookup and Levenshtein fuzzy matching (`artifacts/api-server/src/data/regions.ts`)

## Artifacts

- **KTP Dashboard** (`artifacts/dashboard`) — React + Vite frontend at `/dashboard`
- **API Server** (`artifacts/api-server`) — Express 5 backend at `/api`

## Features

### Admin Role
- Dashboard with stats (total registrations, events, participants, officers)
- Event management: create, edit, delete, view participant lists, export CSV
- Event detail: QR code/link generation for public registration and attendance (token-based)
- Participant management: search by NIK/name, city fix (uses `city` not `nationality`), export CSV
- Participant detail: KTP image viewer (show/hide toggle for stored KTP photos)
- Officers (Petugas) management: view all users, "Petugas Aktif" count, leaderboard
- Staff statistics page (`/staff`): top-performing staff with input/event counts
- KTP Scan admin page: scan KTP image with Tesseract.js OCR (dual persistent workers, parallel PSM-6+PSM-11, ~1.8s), register to event, auto-reset form
- Prize monitoring page (`/prizes`): CRUD for event prizes, distribution tracking with progress bars
- Pemetaan page (`/pemetaan`): participant density by kabupaten/kecamatan/desa with pagination (100/page)
- Peta Interaktif page (`/peta`): Leaflet choropleth map, 5 kabupaten Jawa Timur, kabupaten→kecamatan drill-down, data from Overpass API (client-side, sessionStorage cached)
- Settings: autoResetForm, showTotalOnSuccess stored in localStorage

### Public Pages (No Auth Required)
- Public registration page (`/p/register/:token`): multi-step flow — check prior registration → NIK-only or scan KTP → form → submit
- Public attendance page (`/p/attend/:token`): same flow but marks attendance with check-in timestamp
- KTP photo capture and storage during registration (compressed with sharp, deduplicated)
- Token-scoped access: all public endpoints validate event token

### Petugas (Staff) Role
- Select event to work on
- Scan KTP on-the-spot with Tesseract.js OCR (photo upload)
- RSVP verification: enter NIK to check if participant is registered

### Security
- All `/api/users` endpoints require auth (`requireAuth` middleware)
- KTP image viewing requires auth (`GET /api/ktp/image/:nik` protected)
- KTP image saving requires either auth or valid event token
- Public NIK lookup requires valid event token (prevents enumeration)
- Role-based route guards in React: petugas → `/petugas`, admin → `/dashboard`
- Session stored server-side; credentials: "include" on all API calls

## Database Tables

- `users` — admin/petugas accounts with role field
- `participants` — unique per NIK; fields: nik, fullName, gender, province, city, kecamatan, kelurahan, occupation, nationality, ktpImagePath (compressed base64 data URI)
- `events` — event records; fields: name, category, isRsvp, startTime, endTime, targetParticipants, status, location, description, registrationToken, attendanceToken
- `event_registrations` — junction table; unique constraint (event_id, participant_id); stores staffName, registrationType (rsvp/onsite)
- `prizes` — event prizes; fields: eventId, name, quantity, distributedCount
- `prize_distributions` — prize distribution tracking; fields: prizeId, participantId, distributedAt, staffName

## API Endpoints (Key)

- `POST /api/auth/login` — login with username/password
- `GET /api/auth/me` — get current user
- `GET /api/events` — list events (all fields)
- `POST /api/events` — create event (admin)
- `PUT /api/events/:id` — update event (admin)
- `DELETE /api/events/:id` — delete event (admin)
- `GET /api/events/:id/participants` — list participants for event (includes city, staffName)
- `POST /api/events/:id/rsvp/check` — check if NIK is registered for event (RSVP verification)
- `GET /api/participants` — list all participants (includes city)
- `POST /api/ktp/scan` — Tesseract.js OCR scan of KTP image
- `POST /api/ktp/register` — register scanned KTP to event
- `POST /api/ktp/save-image` — save compressed KTP photo (requires auth or event token)
- `GET /api/ktp/image/:nik` — get stored KTP image (requireAuth)
- `POST /api/events/:id/generate-tokens` — generate registration/attendance tokens
- `GET /api/events/:id/qrcode/:type` — get QR code for event link
- `GET /api/events/public/by-token/:token` — get event info by token (public)
- `POST /api/events/public/check-nik` — check if NIK exists (requires event token)
- `POST /api/events/public/register/:token` — register/attend via public link
- `GET/POST/PUT/DELETE /api/prizes` — prize CRUD
- `POST /api/prizes/:id/distribute` — distribute prize to participant
- `GET /api/users` — list all petugas users with stats (requireAuth)
- `GET /api/dashboard/stats` — admin dashboard stats
- `GET /api/dashboard/staff` — staff performance stats

## Design System

- Font: Plus Jakarta Sans
- Cards: `rounded-2xl border border-slate-100` with white background
- Admin accent: blue (blue-600)
- Petugas accent: orange (orange-500)
- Tables: `rounded-xl overflow-hidden border border-slate-100`
- Buttons: solid primary (blue/orange) + outline variants

## Demo Accounts

- `admin / admin123` — Admin role
- `budi / petugas123` — Petugas role
- `rina / petugas123` — Petugas role
- `agus / petugas123` — Petugas role

## Workflows (IMPORTANT — do not create manual workflows)

Both services are managed exclusively by artifact workflows. Never create manual workflows (e.g. "Start application", "API Server") — they will conflict with the artifact workflows and break the preview.

| Workflow | Port | Purpose |
|---|---|---|
| `artifacts/dashboard: web` | 5173 | React + Vite frontend |
| `artifacts/api-server: API Server` | 8080 | Express API backend |

If the app ever shows "not running", restart these two artifact workflows — do NOT create new manual workflows.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
