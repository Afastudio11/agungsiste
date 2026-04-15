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
- **OCR**: Tesseract.js v7 (client-side-less server OCR; no LLM/AI used)

## Artifacts

- **KTP Dashboard** (`artifacts/dashboard`) — React + Vite frontend at `/dashboard`
- **API Server** (`artifacts/api-server`) — Express 5 backend at `/api`

## Features

### Admin Role
- Dashboard with stats (total registrations, events, participants, officers)
- Event management: create, edit, delete, view participant lists, export CSV
- Participant management: search by NIK/name, city fix (uses `city` not `nationality`), export CSV
- Officers (Petugas) management: view all users, "Petugas Aktif" count, leaderboard
- Staff statistics page (`/staff`): top-performing staff with input/event counts
- KTP Scan admin page: scan KTP image with Tesseract.js OCR (3-pass, persistent worker, ~5s), register to event, auto-reset form
- Pemetaan page (`/pemetaan`): participant density by kabupaten/kecamatan/desa with pagination (100/page)
- Peta Interaktif page (`/peta`): Leaflet choropleth map, 5 kabupaten Jawa Timur, kabupaten→kecamatan drill-down, data from Overpass API (client-side, sessionStorage cached)
- Settings: autoResetForm, showTotalOnSuccess stored in localStorage

### Petugas (Staff) Role
- Select event to work on
- Scan KTP on-the-spot with AI OCR (photo upload)
- RSVP verification: enter NIK to check if participant is registered

### Security
- All `/api/users` endpoints require auth (`requireAuth` middleware)
- Role-based route guards in React: petugas → `/petugas`, admin → `/dashboard`
- Session stored server-side; credentials: "include" on all API calls

## Database Tables

- `users` — admin/petugas accounts with role field
- `participants` — unique per NIK; fields: nik, fullName, gender, province, city, kecamatan, kelurahan, occupation, nationality
- `events` — event records; fields: name, category, isRsvp, startTime, endTime, targetParticipants, status, location, description
- `event_registrations` — junction table; unique constraint (event_id, participant_id); stores staffName

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
- `POST /api/ktp/scan` — AI OCR scan of KTP image
- `POST /api/ktp/register` — register scanned KTP to event
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

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
