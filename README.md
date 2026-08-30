# WAR ROOM UI

The view half of WAR ROOM — a single-operator outbound system. Dashboards over a
Neon Postgres database: pipeline funnel, lead review, run status.

This repo is deliberately public and deliberately dumb: it reads the database and
renders. The operating half (workflows, tools, schema, migrations) lives in a
private repo; the two meet only at the database. The UI's Postgres role can read
and leave notes — it cannot touch money or outbound state.

- Next.js (App Router) on Vercel · Tailwind v4 · shadcn/ui
- Token layer: `src/app/globals.css` (dark-first; purple is identity, color only
  means status)
- Primitive inventory: `/kitchen-sink`

```bash
npm install
cp .env.example .env.local   # fill in the two values
npm run dev
```

No license: source-visible, all rights reserved.
