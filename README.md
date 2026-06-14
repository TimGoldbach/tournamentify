# Tournamentify

Bau deinen eigenen, anpassbaren Turnierbaum – schnell und ohne Hürde. Account-Extras:
eigene Designs, Setup-Import/Export, History. Ziel-Formate: Single/Double-Elimination,
Round-Robin, Gruppen+KO und Swiss.

Vollständiger Plan: [`docs/PLAN.md`](docs/PLAN.md).

## Stack

- **Frontend** `apps/web` — Next.js (App Router), Tailwind + shadcn/ui, TanStack Query,
  Zustand, next-intl (DE/EN), Auth.js. Dient zugleich als **BFF** (Proxy zur API).
- **Backend** `apps/api` — NestJS, REST, Zod-Validierung, Prisma, brackets-manager, pino.
- **Shared** `packages/shared` — Zod-Schemas (Domain + JSON-Import/Export).
- **Infra** `infra/` — Docker Compose + Caddy (eigener VPS).

```
apps/
  web/      Next.js + BFF
  api/      NestJS + Prisma
packages/
  shared/   Zod-Schemas (Single Source of Truth)
infra/      docker-compose, Caddyfile, Dockerfiles
docs/       PLAN.md
```

## Setup (lokal)

Voraussetzungen: Node ≥ 20 (`.nvmrc` → 22), pnpm 11, Docker.

```bash
pnpm install

# env-Dateien anlegen (Beispiele kopieren)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Postgres starten
docker compose -f infra/docker-compose.yml up -d db

# Prisma-Client + erste Migration
pnpm --filter @tournamentify/api prisma:generate
pnpm --filter @tournamentify/api prisma:migrate

# Shared einmal bauen, dann alles im Watch-Modus
pnpm --filter @tournamentify/shared build
pnpm dev
```

- Web: http://localhost:3000
- API (privat, via BFF): http://localhost:3001/health
- BFF-Proxy: `GET /api/bff/health` (Next → Nest)

## Skripte (root)

| Befehl            | Wirkung |
|-------------------|---------|
| `pnpm dev`        | Turbo: alle Apps im Dev-Modus |
| `pnpm build`      | Alles bauen (shared zuerst) |
| `pnpm typecheck`  | TS-Checks |
| `pnpm lint`       | Linting |
| `pnpm test`       | Vitest |

## Deployment

`infra/docker-compose.yml` startet `db`, `api`, `web` und `caddy`. Nur Caddy ist nach
außen offen (TLS); `api` liegt im privaten Netz und ist nur über den BFF erreichbar.
Für Prod in `apps/web/.env` `API_INTERNAL_URL=http://api:3001` setzen und in der
`Caddyfile` die Domain eintragen.

> **Status:** M0-Gerüst. Auth.js, Bracket-Engine, Editor & Live-Updates folgen ab M1
> (siehe Fahrplan in `docs/PLAN.md`).