# Greenscape Pro — Proposal Generation Agent

Turns a founder's messy site-walk notes into a priced, customer-ready proposal draft, then routes it for human approval before anything is sent.

**Problem it solves:** Greenscape Pro loses 35–40% of qualified leads because quotes take 6–9 days. This cuts that loop to minutes: notes → Claude draft → founder edits/approves → Slack alert.

## Architecture

```
Lead (Neon) + raw notes
        ↓
POST /api/generate-proposal
        ↓
Claude (claude-sonnet-4-6) → structured JSON line items
        ↓
Price against catalog (lib/pricing.ts) + JSON guardrails (retry once)
        ↓
Save proposal status=draft in Neon
        ↓
Admin UI (/) — review, edit prices, Approve & Send
        ↓
status=approved → Slack Incoming Webhook
```

| Layer | Choice |
| --- | --- |
| App | Next.js 14 App Router + TypeScript |
| DB | Neon serverless Postgres via `@neondatabase/serverless` |
| AI | Anthropic Claude `claude-sonnet-4-6` |
| UI | Tailwind CSS admin dashboard |
| Integration | Slack Incoming Webhook on approval |
| Deploy | Vercel |

## Why Neon

Neon is serverless Postgres that **scales to zero** and gives you a single pooled connection string. On Vercel, each API route is a short-lived function — you don't want a traditional connection pool. The Neon HTTP driver (`neon()` + tagged-template SQL) fits that model: no cold-start pool drama, parameterized queries by default, and real persistence (not localStorage / JSON files / in-memory demos).

## Why Claude Sonnet (not Opus)

Proposal generation here is **structured extraction + pricing**, not open-ended creative writing. Sonnet handles that well at roughly **$0.01–0.03 per proposal** (we log `model_used` and estimated `cost_usd` on every draft). Opus would cost more for little quality gain on this task — better spend that budget on volume and human review time.

## Local setup

### 1. Clone & install

```bash
npm install
```

### 2. Environment

Copy `.env.example` → `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API access |
| `DATABASE_URL` | Neon **pooled** connection string |
| `SLACK_WEBHOOK_URL` | Incoming webhook for approval alerts |

Never commit `.env` / `.env.local` — only `.env.example` belongs in git.

### 3. Database

In the Neon SQL Editor, run in order:

1. `schema.sql` — creates `leads` and `proposals`
2. `seed.sql` — inserts one sample site-walk lead

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Select the seed lead → **Generate Proposal** → edit if needed → **Approve & Send** (watch Slack).

### Deploy (Vercel)

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Set the same three env vars in the Vercel project settings.
4. Deploy. Run `schema.sql` / `seed.sql` against Neon once if you haven't already.

## Guardrails worth mentioning on the call

- Invalid JSON or a **total of 0** → do not save; retry Claude once; then return a clear API error.
- Founder must **edit + approve** before Slack fires (human-in-the-loop).
- Customer SMS/email is intentionally out of scope — approval + Slack proves the loop.

## What I'd build next

Auto-ingest new opportunities from GoHighLevel (webhook → `leads` row) so Marcus never pastes notes by hand, plus a closed-lost reactivation agent that re-scores stale quotes and drafts a short follow-up when competitors go quiet — the same pricing catalog and approval gate, just triggered by CRM events instead of a button click.

## Out of scope (on purpose)

- Live GHL sync (seeded / mocked lead source)
- Sending the proposal to the customer (email/SMS)
- Auth (single-user internal demo tool)
