Purpose. This file tells AI coding agents how to work on this project: what the app does, how to build/test/deploy it, architectural guardrails, and the rules of engagement. Think of it as a README for agents. 
GitHub
+1

1) Project overview

App: Plan group activities without fear of rejection. Flow = Host creates event â†’ quorum vote â†’ attendees block days they donâ€™t want â†’ results suggest earliest all-available and earliest most-available â†’ host picks final date.

Stack: Next.js (App Router) + TypeScript + Tailwind v3, Prisma + Supabase Postgres, Auth.js/NextAuth v5 (Discord), Pusher Channels (realtime).

Hosting: Vercel (Serverless).

Design: Minimal, white theme; mobile-first.

Why AGENTS.md? Put agent-facing instructions (build, test, coding rules) in one place so tools like Codex/Claude/Cursor behave consistently. 
Builder.io
+1

2) Repository map (high level)
app/
  (marketing)/page.tsx        # Landing
  host/page.tsx               # Create event
  attend/page.tsx             # Enter invite code
  e/[token]/page.tsx          # Dynamic event page
  api/
    auth/[...nextauth]/route.ts
    events/route.ts           # POST create
    events/[token]/route.ts   # GET event (summary + availability)
    events/[token]/join/route.ts
    events/[token]/vote/route.ts
    events/[token]/blocks/route.ts
    events/[token]/phase/route.ts
    events/[token]/final/route.ts
    cron/phase-sweeper/route.ts
components/                   # UI components
lib/                          # non-React helpers (auth, prisma, realtime, results, utils)
prisma/schema.prisma          # DB schema
styles/globals.css
vercel.json                   # Cron


Keep this section brief and structuralâ€”agents donâ€™t need a file-by-file dump; just enough to navigate. 
GitHub

3) Setup / build / run

Install

pnpm install


Env

cp .env.example .env.local
# Fill: DATABASE_URL (pooled 6543), DIRECT_URL (direct 5432), NEXTAUTH_*, DISCORD_*, PUSHER_*, CRON_SECRET


DB & Dev

npx prisma generate
npx prisma migrate dev --name init
pnpm dev


Build

pnpm build


Migrations (prod)

npx prisma migrate deploy


Tests

pnpm test           # runs unit + e2e if configured
pnpm test:unit      # vitest
pnpm test:e2e       # playwright


These explicit commands help agents run the right flows automatically. 
Agents

4) Critical guardrails (do not violate)

Prisma must run on Node runtime.
Any route touching Prisma must export:

export const runtime = 'nodejs';


Database URLs.

Runtime: pooled DATABASE_URL (pgBouncer 6543).

Migrations: DIRECT_URL (5432).
Agents must not swap these.

Pusher.

Client: pusher-js

Server: pusher
Emit events only on the server after successful DB writes; clients simply mutate() SWR caches.

Auth.
Auth.js / NextAuth v5 (beta) with Prisma adapter + Discord provider. Do not mix v4 and v5 APIs.

Tailwind.
Stay on v3 unless a dedicated migration PR updates config & build.

Secrets.
Never hardcode. Only read from env; do not print secrets in logs or tests.

Type safety.
No any. Validate request bodies with Zod; return 400s on invalid payloads.

Accessibility.
Keyboard-accessible controls; labels for inputs; 44px targets; avoid color-only status.

5) Product rules the code must enforce

Quorum: On vote, if inCount >= quorum and now < voteDeadline and phase is VOTE, set phase â†’ PICK_DAYS and emit phase.changed.

Auto-fail: If now > voteDeadline and inCount < quorum and phase is VOTE, set phase â†’ FAILED (lazy check in GET + daily cron sweeper).

Host-only: Only host can change phase or pick final date (403 otherwise).

Person-centric approach: Track people, not complex sessions. Anonymous users can freely switch between names. Logged-in users can claim and protect their person name.

Join gating: A viewer must select a host-provided name (and be logged in if requireLoginToAttend) before voting/blocking days.

Anonymity: Day blocks are anonymous by default; toggle per attendee allowed.

6) Tasks agents may perform

Add/modify API routes, components, lib utils in line with sections above.

Introduce Zod schemas for API bodies; add input validation.

Improve UX (copy, labels, a11y) as long as behavior stays consistent.

Add tests (Vitest unit, Playwright e2e); improve CI (GitHub Actions).

Optimize performance (batch Pusher emits, reduce over-fetching).

Do not:

Change DB URLs semantics, Tailwind major version, or Auth major version without a migration plan.

Commit secrets or rotate keys.

Remove export const runtime = 'nodejs' from Prisma routes.

7) Coding conventions

TypeScript strict; prefer explicit types for API JSON.

Components in /components, pure helpers in /lib.

Styling: Tailwind utility-first; keep minimal, white UI with clear states.

Naming: LowerCamelCase for vars/functions, PascalCase for components, slugified file names.

Errors: User-friendly messages; never leak internals.

Include coding rules and workflows in AGENTS.md so agents can align with your house style. 
Agents.md Guide for OpenAI Codex

8) Testing policy

Unit (Vitest):

lib/results.computeAvailability (no blockers / partial / all / ties â†’ earliest).

Date helpers (UTC date-only semantics).

Zod validators for each POST body.

E2E (Playwright):

Create event â†’ join (two browsers) â†’ both vote IN â†’ auto-promote to PICK_DAYS.

Block/sync via Pusher; verify results show earliest-ALL / earliest-MOST.

Host sets final date; both clients reflect it.

CI: GitHub Actions should run typecheck, build, unit tests, start server with a Postgres service or Supabase URL secret, run Playwright, upload artifacts.

What to include in AGENTS.md test sections: build/test commands, frameworks, and the minimal â€œhowâ€ context. 
GitHub

9) Deployment / cron

Vercel: connect GitHub â†’ add env vars â†’ first deploy â†’ run npx prisma migrate deploy.

Cron (vercel.json):

Daily GET to /api/cron/phase-sweeper with Authorization: Bearer $CRON_SECRET to flip overdue VOTE â†’ FAILED.

10) Quality gates (block merge if any fail)

 All Prisma routes use Node runtime.

 Pooled vs direct DB URLs used correctly.

 Join gating + require-login enforced.

 Auto-promote on quorum; auto-fail after deadline (lazy + cron).

 Host-only enforcement returns 403 to non-hosts.

 Pusher emits only server-side.

 Results show earliest ALL, earliest MOST, per-day availability.

 pnpm build succeeds on clean checkout; tests green in CI.

11) Agent etiquette

Prefer small, focused PRs with a short â€œWhat/Why/Howâ€ description.

Add comments where logic is non-obvious (phase transitions, cron, pooled vs direct DB).

Keep changes reversible and documented.

If you propose a major change (Auth v4â†”v5, Tailwind v4), open a design PR first.
