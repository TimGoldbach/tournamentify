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
- **M1 — Plattform/Accounts ✅ umgesetzt:** Auth.js (Google + Dev-Credentials) + BFF-Actor-Bridge,
  Gast→User-Claim, `User`+`tier`, Tournament-CRUD, **eigener** Bracket-Generator
  (Single-Elim + Round-Robin korrekt; Double-Elim/Swiss als 501 bis M2/M3),
  Dashboard + History, **JSON-Setup-Import/Export**, Capability-Link-Datenschicht.
- **M2 — Editor & Live ✅ umgesetzt (Kern):** Scoring + Single-Elim-Progression + Bye-Auto-Advance,
  Round-Robin-Standings, **SSE-Live-Updates**, SVG-Bracket, Capability-Link-Sharing + öffentliche
  Live-/Score-Route, Theme-Token-Anwendung + Presets/Controls. (Drag-Reseeding & voller Theme-Editor
  mit gespeicherter Bibliothek → M2.1; double_elim-Progression → M3.)
- **M3 — Format-Breite (in Arbeit):** ✅ **Double-Elimination** (Winner-/Loser-Bracket + Grand Final,
  Power-of-2, voll unit-getestet inkl. Turnier-Simulation). Offen: DE-Nicht-Zweierpotenz/Byes +
  Bracket-Reset (**M3.1**), **Gruppen+KO** mit Cross-Stage-Seeding (**M3.2**), **Swiss** + Buchholz-
  Tiebreaker (**M3.3**). DE-Service-DB-Test, sobald eine DB verfügbar ist.
- **M4 — Extras:** Embed-Widget + PNG/PDF-Export; Serien/Ligen (+ optional Participant-Registry);
  reichere Stats.

## M1 — Bekannte Follow-ups (aus dem adversarialen Review)

Bewusst auf M2+ verschoben (kein M1-Blocker):
- **Capability-Links:** Default-Expiry setzen und VIEW/SCORE beim Projizieren der Detaildaten
  unterscheiden (aktuell gibt jeder gültige Token die volle Detail-Ansicht). Sharing-UI = M2.
- **Frontend-Client für Links:** `createCapabilityLink`/`listCapabilityLinks` in `api.ts` ergänzen
  (zusammen mit der Sharing-UI).
- **Response-Validierung:** Optionales `*.parse()` der Antworten gegen die Shared-DTOs, damit
  künftige Enum-/Casing-Drift laut statt still bricht.
- **BFF-Redirects:** `Location`-Header bei 3xx umschreiben/strippen (aktuell `redirect: "manual"`).

⚠️ **Vor dem ersten Start (online) nötig:** `pnpm install`, dann
`pnpm --filter @tournamentify/api prisma:migrate` (erste Migration — offline nicht erzeugbar),
danach `pnpm build && pnpm typecheck` zur Verifikation. Besonders prüfen: Generator-Ausgabe,
Auth.js-v5-Flow und der BFF-SSE-Stream.

## M2 — Bekannte Follow-ups (aus dem adversarialen Review)

**M2.1 ✅ umgesetzt:** Saved-Theme-Bibliothek (`SavedTheme`-CRUD, Account-Feature) + voller Theme-Editor
(Color-Picker, Hex↔HSL), Capability-Link-**Expiry + Revoke**, und **Reseeding** (Reihenfolge ändern →
Bracket-Regenerate; gesperrt sobald ein *echtes* Ergebnis existiert — Auto-Byes zählen nicht).
Reorder ist dependency-frei (Hoch/Runter), weil dnd-kit offline nicht installierbar war.

Noch offen (M3 / später):
- **dnd-kit-Politur** fürs Reseeding (aktuell dependency-freier Hoch/Runter-Reorder).
- **Re-Scoring/Korrektur** abgeschlossener Matches inkl. Re-Compute der Folgerunden — derzeit
  serverseitig abgelehnt (verhindert veraltete Sieger downstream).
- **SSE-Skalierung:** `EventsService` ist prozess-lokal (eine Instanz). Multi-Replica braucht
  Redis-Pub/Sub oder Postgres `LISTEN/NOTIFY`. SSE-Token reist im Query-String → `/events`-URLs
  nicht mit Query loggen.
- **In-App-Dialoge** statt `window.prompt/confirm` (Theme speichern, Revoke/Delete bestätigen).

⚠️ Vor dem Start (online), wie M1: `pnpm install`, `prisma migrate`, dann `pnpm build && pnpm typecheck`.
Besonders laufzeit-prüfen: Progression/Bye-Advance, SSE durch den BFF (EventSource sendet keine Header),
und das SVG-Bracket-Layout.

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
