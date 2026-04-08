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
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (whitelabel)
- **AI**: OpenAI via Replit AI Integrations (for KTP OCR)

## Artifacts

- **KTP Dashboard** (`artifacts/dashboard`) — React + Vite frontend at `/`
- **API Server** (`artifacts/api-server`) — Express 5 backend at `/api`

## Features

- 2-role system: **Supervisor** (manages events, views reports) and **Staff** (scans KTP)
- Staff scans KTP photos → AI reads data (NIK, name, address, etc.) → data confirmed → registered to event
- No images stored, only extracted text
- Duplicate detection: same NIK + same event = blocked with warning
- Participants can join multiple events; each instance is tracked
- Dashboard: total participants, events, registrations, charts, date filters
- Event management: create/delete/view participant lists
- Participant management: search by NIK or name, profile with event history

## Database Tables

- `participants` — unique per NIK
- `events` — event records
- `event_registrations` — junction table with unique constraint (event_id, participant_id)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Role Management

Roles are managed through Clerk's user publicMetadata:
- Set `{ role: "supervisor" }` or `{ role: "staff" }` in the Auth pane
- Supervisors access dashboard, events, participants pages
- Staff access only the scan page

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
