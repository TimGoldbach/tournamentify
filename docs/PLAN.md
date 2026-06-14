# Tournamentify — Projektplan

> Verbindliche Referenz für Architektur- und Produktentscheidungen.
> Entstanden aus einer ausführlichen Grilling-Session. Änderungen bitte per PR mit Begründung.

## Produkt in einem Satz

Ein Tool, mit dem man **ohne Hürde (als Gast)** sofort einen anpassbaren Turnierbaum
baut, scored und teilt — mit **Account-Extras** (eigene Designs, Setup-Import/Export,
History) und langfristig **voller Format-Suite inkl. Swiss**.

## Entscheidungen (Stand: Grilling)

| #  | Thema            | Entscheidung |
|----|------------------|--------------|
| 1  | Custom-Tiefe     | **Hybrid** — Standard-Format als Start, danach frei editierbar (Editier-Layer über der Engine) |
| 2  | Formate (Ziel)   | **Volle Suite**: Single/Double-Elim, Round-Robin, Gruppen+KO, **Swiss** |
| 3  | Auth-Modell      | **Server-first + anonymer Owner-Token**, Signup „claimed" Gast-Turniere |
| 4  | Projektziel      | **Offen/Mischung** → monetarisierbar bauen, nicht jetzt monetarisieren (`tier`-Flag) |
| 5  | Auth-Tech        | **Auth.js (NextAuth)** im Frontend |
| 6  | Auth-Bridge      | **BFF-Proxy über Next** (Nest privat, Service-Token + User-Context) |
| 7  | Repo             | **Monorepo: pnpm + Turborepo** (`apps/web`, `apps/api`, `packages/shared`) |
| 8  | API-Stil         | **REST + geteilte Zod-Schemas** |
| 9  | DB/ORM           | **Postgres + Prisma** |
| 10 | Speichermodell   | **Voll normalisiert** |
| 11 | Bracket-Engine   | **brackets-manager-Lib** + erprobtes Schema, Swiss selbst |
| 12 | Bracket-Render   | **Custom SVG/HTML + dnd-kit** |
| 13 | Live-Updates     | **SSE durch den BFF** |
| 14 | Permissions      | **Capability-Links** (View + Score) |
| 15 | Import/Export    | **Nur Setup/Template** (ohne Ergebnisse), versioniert |
| 16 | Statistiken      | **Minimal** (Basis-Zähler pro Turnier) |
| 17 | Designs          | **Token-basierte Themes** (Presets + eigene Tokens) |
| 18 | Extras auf Radar | **Embed-Widget + PNG/PDF-Export**, **Serien/Ligen** |
| 19 | FE-State         | **TanStack Query + Zustand** |
| 20 | UI-Kit           | **Tailwind + shadcn/ui** |
| 21 | Hosting          | **Eigener VPS + Docker Compose** (+ Caddy/Traefik, pg-Backups) |
| 22 | Testing          | **Breite Test-Pyramide** (Vitest, Testcontainers, Playwright) |
| 23 | i18n             | **DE + EN ab Tag 1** (next-intl) |
| 24 | Observability    | **Minimal** (pino-Logs), Sentry später nachrüstbar |
| 25 | Reihenfolge      | **Plattform/Accounts zuerst** (mit minimalem Erzeugungspfad, s.u.) |

Implizit gesetzt: Next **App Router**, TypeScript strict überall, ESLint + Prettier.

## Architektur

```
Browser ──cookie/session──► Next (apps/web)
                             │  Auth.js (Login/Provider)
                             │  BFF: Server-Route-Handler  (src/app/api/bff/[...path])
                             │   - REST-Calls ──Service-Token + User-Ctx──► Nest
                             │   - SSE-Passthrough  ◄──────stream───────────┘
                             ▼
                          Nest (apps/api)  [privates Netz]
                             │  REST-Controller (Zod-validiert)
                             │  brackets-manager Engine (Storage-Adapter → Prisma)
                             │  SSE-Emitter (Score-Events)
                             ▼
                          Postgres  (normalisiert + JSONB für Design/Overrides)

packages/shared: Zod-Schemas (Domain + Import/Export) → Quelle der Wahrheit für FE, BE & JSON
```

## Datenmodell (normalisiert, brackets-manager-kompatibel)

Siehe `apps/api/prisma/schema.prisma`. Kern:

```
User(id, email, authProviderId, tier, …)
Series(id, ownerUserId, name)                         ← Ligen-Radar (offen halten)
Tournament(id, ownerUserId?, anonOwnerToken?, seriesId?, name,
           status, settings:jsonb, designTokens:jsonb, …)
Stage(id, tournamentId, type, number, settings:jsonb) ← Gruppen+KO = 2 Stages
Group(id, stageId, number)                            ← Bracket-Seiten / RR-Gruppen
Round(id, groupId, number, nameOverride?, bestOf)     ← Custom-Edits leben hier mit
Match(id, roundId, number, status, opponent1:jsonb, opponent2:jsonb)
MatchGame(id, matchId, number, scores)
Participant(id, tournamentId, name, seed)             ← ad-hoc; später ParticipantIdentity
CapabilityLink(id, tournamentId, type[view|score], token, expiresAt?)
SavedTheme(id, ownerUserId, name, tokens:jsonb)
```

## Offene Spannungen (bewusst mitführen)

1. **Plattform-zuerst braucht trotzdem früh einen Erzeugungspfad** — sonst verwalten
   History/Import/Export nichts. → M1 enthält einen minimalen „create-from-template"-Pfad;
   der reiche Editor kommt in M2.
2. **Serien/Ligen ↔ Minimal-Stats** — Ligen verlangen persistente Teilnehmer-Identitäten,
   die bei Stats rausgenommen wurden. → `Series` + spätere `ParticipantIdentity` einplanen,
   jetzt nicht bauen.
3. **brackets-manager kann kein echtes Freiform-Editing** — generiert nur Standard-Strukturen.
   → Spike in M1/M2: wo ist die Lib-Grenze, was übernimmt unser Editier-Layer?
4. **Auth.js (FE) ↔ Nest-Daten unter BFF** — Token-Mechanik sauber definieren
   (Session in Next, Service-Token + User-Ctx zum privaten Nest). Sicherheits-kritisch.
5. **Swiss-Pairing + Tiebreaker** = selbst gebaut, größter Engine-Risikoblock
   → hohe Test-Priorität, kommt spät (M3).

## Fahrplan

- **M0 — Fundament:** Monorepo (pnpm+Turborepo), `packages/shared` Zod, Nest+Prisma+Postgres,
  Next+Auth.js+BFF-Verdrahtung, Docker Compose + Caddy, next-intl (DE+EN), pino. *(dieses Gerüst)*
- **M1 — Plattform/Accounts:** Auth + Claim-Gerüst, `User`+`tier`, komplettes Schema+Migrations,
  **minimale** Turnier-Erzeugung aus Single/Double-Elim-Template (Engine), Dashboard + History,
  **JSON Setup Import/Export** (round-trip getestet), Capability-Link-Datenschicht.
- **M2 — Editor & Live:** Custom-SVG + dnd-kit Editor (Seeding, Scores, Custom-Edits),
  Token-Theme-Editor + Presets, **SSE** live, Share-/Score-Link-UX, Gast→Account-Claim-Flow.
- **M3 — Format-Breite:** Round-Robin + Standings, Gruppen+KO (2 Stages),
  dann **Swiss** + Tiebreaker (stark getestet).
- **M4 — Extras:** Embed-Widget + PNG/PDF-Export; Serien/Ligen (+ optional Participant-Registry);
  reichere Stats.

## Tech-Stack (Kurzreferenz)

| Schicht        | Wahl |
|----------------|------|
| Frontend       | Next.js (App Router) · React · Tailwind + shadcn/ui · TanStack Query · Zustand · next-intl |
| Auth           | Auth.js (NextAuth) im FE, Nest als Identitäts-/Datenquelle via BFF |
| Backend        | NestJS · REST · Zod-Validierung · brackets-manager · pino |
| DB             | PostgreSQL · Prisma |
| Shared         | `@tournamentify/shared` — Zod-Schemas (Domain + Import/Export) |
| Infra          | Docker Compose · Caddy (TLS) · eigener VPS |
| CI             | Bewusst keine — Checks lokal vor Commit, Deploy + Betrieb VPS-seitig |
| Tests          | Vitest · Testcontainers · Playwright |
