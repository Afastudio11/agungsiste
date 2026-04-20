# Event & Participant Management System

A comprehensive event and participant management system with Indonesian KTP (ID Card) scanning and OCR capabilities.

## Architecture

This is a **pnpm monorepo** with the following structure:

- `artifacts/api-server` — Express.js backend API (port 8080)
- `artifacts/dashboard` — React + Vite frontend (port 5173)
- `artifacts/telegram-bot` — Telegram bot for notifications
- `artifacts/report-bot` — Report bot
- `lib/db` — Drizzle ORM database layer (PostgreSQL)
- `lib/api-spec` — OpenAPI specification
- `lib/api-zod` — Generated Zod validation schemas
- `lib/api-client-react` — Generated TanStack Query hooks

## Key Features

- KTP (Indonesian ID card) scanning via OCR (Tesseract.js + Python/OpenCV fallback)
- Event and participant management
- QR code scanning for check-in
- Role-based access: Admin and Petugas (field officer) roles
- Excel export
- Gemini AI and Groq SDK integrations
- Clerk authentication

## Default Credentials (seeded on first run)

- Admin: `admin` / `admin123`
- Petugas: `budi` / `petugas123`

## Running the Project

The "Project" workflow starts both services in parallel:
- **API Server**: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- **Dashboard**: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev`

## Database

PostgreSQL via Replit's built-in database. Run migrations with:
```
pnpm --filter @workspace/db run push
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (set automatically by Replit)
- `PORT` — Port for each service (set per workflow)
- `BASE_PATH` — Base path for the dashboard (set to `/`)
- `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` — Clerk auth keys
- `REPORT_CHAT_ID` — Telegram chat ID for reports

## Deployment

Deployment target: autoscale. The API server is the main deployment target.
