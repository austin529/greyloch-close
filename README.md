# Greyloch Month-End Close

Internal web app for the Greyloch accounting team to run month-end close: a
recurring checklist with per-task preparer/reviewer sign-off, collaboration, and
an append-only audit trail. Runs entirely on Cloudflare.

> **Checklist source:** the seeded templates ([`migrations/0002_seed.sql`](migrations/0002_seed.sql))
> mirror the team's Monday "TEMPLATE Reoccurring Task List" (83 tasks). There are
> no categories — tasks carry a **day of the month** (stored in `sequence`),
> which sets each task's due date when a period opens and orders the dashboard.
> Monday's single Assignee maps to the **preparer**; the **reviewer** defaults to
> Sharon for Austin's tasks and Austin for everyone else's, so segregation of
> duties is always satisfiable. `requires_review` and reviewers are editable
> per template. Tasks tagged `[C]` are ones with an existing Cowork automation.

- **Backend + frontend:** one Cloudflare Worker (Hono API under `/api/*`, serving
  the built React SPA via the static-assets binding).
- **Database:** Cloudflare D1 (SQLite).
- **Auth:** Cloudflare Access (Zero Trust) authenticates against Microsoft Entra
  ID; the Worker validates the Access JWT and the app enforces authorization.
- **Notifications:** Microsoft Teams (Adaptive Cards via a Power Automate
  webhook) on ready-for-review / sign-off / reopen / blocked / period events,
  plus a daily overdue digest (cron). No-ops if the webhook isn't configured.
- **Also:** tasks can be flagged **blocked**, admins can filter the board by
  person, and April–June 2026 are pre-loaded from Monday (see below).

> **Deploying / cutting over from Monday?** Follow the step-by-step runbook in
> [`DEPLOY.md`](DEPLOY.md).

---

## How auth works (important)

**Cloudflare Access handles _authentication_ (who you are). The app handles
_authorization_ (what you may do).**

1. Access only lets approved identities reach the app and attaches a signed JWT
   (`Cf-Access-Jwt-Assertion` header / `CF_Authorization` cookie).
2. The Worker **validates that JWT** against Cloudflare's public keys (signature +
   `iss` + `aud`) — see [`src/auth.ts`](src/auth.ts). It never trusts a plain
   email header.
3. The verified email is looked up in the `users` table to get the user's
   `system_role`.
4. **Every mutating request is re-checked server-side.** The client UI only
   hides/disables controls; it is never the source of truth.

### Permission model

Global `system_role` (per user):

| Role     | Can do |
| -------- | ------ |
| `admin`  | Open/close/reopen periods, edit templates, manage users, reassign any task, reopen reviewed tasks, override segregation of duties. |
| `staff`  | Work tasks where they are the assigned preparer or reviewer. |
| `viewer` | Read-only everywhere. |

Per-task assignment: each task has its own `preparer_id` and `reviewer_id`, so
the same person can be admin globally, a preparer on some tasks, and a reviewer
on others.

Server-enforced rules (in [`src/routes/tasks.ts`](src/routes/tasks.ts)):

- Move a task to `prepared` → must be the task's `preparer_id` (or admin).
- Move a task to `reviewed` → must be the task's `reviewer_id` (or admin).
- **Segregation of duties:** on `requires_review = 1` tasks, the reviewer must
  differ from the preparer, and the preparer cannot review their own work. Admins
  may override explicitly (`override_sod: true`).
- **Closed periods are read-only** until an admin reopens them.
- `activity_log` is **append-only** — every status change, assignment, edit, and
  comment writes a row; nothing is ever updated or deleted.
- Opening a period **copies** template fields into each task, so later template
  edits never rewrite history.

### Status flow

```
not_started → in_progress → prepared → reviewed
                   ↑                       |
                   └──────── reopened ←─────┘
```

Tasks with `requires_review = 0` are "done" at `prepared` (no reviewer step).
Reopening clears the prepared/reviewed sign-offs (re-prepare required) but the
timeline retains the full history.

---

## Project layout

```
greyloch-close/
  wrangler.jsonc        Worker config: D1 binding, assets binding, Access vars
  migrations/           D1 schema (0001_init) + seed (0002_seed)
  src/                  Worker (TypeScript, Hono)
    index.ts            App + routing; /api/* requires auth
    auth.ts             Access JWT validation + dev bypass
    db.ts               D1 query helpers
    util.ts             HttpError + authorization helpers
    routes/             me, periods, tasks, templates, users
  web/                  React + Vite + Tailwind frontend (builds to ../dist)
  dist/                 Build output served by the Worker (gitignored)
```

---

## Local development

Prerequisites: Node 20+ and npm.

```bash
npm install

# Set up local auth bypass (so you don't need to sit behind Access locally):
cp .dev.vars.example .dev.vars

# Create the local D1 database and load schema + seed:
npm run db:migrate:local

# Build the SPA, then run the Worker (serves API + SPA on http://localhost:8787):
npm run build
npm run dev
```

Open http://localhost:8787.

### Acting as different users locally

`.dev.vars` sets `AUTH_DEV_BYPASS=true`, which skips JWT validation and trusts
`DEV_EMAIL` (default `austin@greyloch.com`). The app shows a **"Dev: act as"**
switcher in the header — pick any seeded user to test roles and permissions.
Under the hood the client sends an `X-Dev-Email` header.

> `.dev.vars` is gitignored and is **only** loaded by `wrangler dev`. It is never
> deployed, so the bypass cannot be enabled in production.

### Faster frontend iteration

```bash
npm run dev       # terminal 1: Worker/API on :8787
npm run dev:web   # terminal 2: Vite dev server on :5173, proxies /api -> :8787
```

### Reset local data

```bash
npm run db:reset:local
```

---

## Deploying to Cloudflare

### 1. Create the D1 database

```bash
npm run db:create          # wrangler d1 create greyloch-close
```

Copy the printed `database_id` into [`wrangler.jsonc`](wrangler.jsonc)
(`d1_databases[0].database_id`), then apply migrations to the remote DB:

```bash
npm run db:migrate:remote
```

### 2. Set up Cloudflare Access + Entra ID

1. Enable **Zero Trust** on the Cloudflare account (free plan covers 50 users).
2. Zero Trust → **Settings → Authentication** → add **Microsoft Entra ID** as an
   identity provider (OIDC/SAML).
3. Create a **self-hosted Access application** pointed at the app's hostname
   (your `workers.dev` URL or a custom domain).
4. Add an Access **policy** allowing the four team emails (or a dedicated Entra
   security group).
5. From the application's settings, copy:
   - **Team domain** → `https://<your-team>.cloudflareaccess.com`
   - **Application Audience (AUD) tag**
6. Put them in [`wrangler.jsonc`](wrangler.jsonc) `vars`:
   ```jsonc
   "vars": {
     "TEAM_DOMAIN": "https://<your-team>.cloudflareaccess.com",
     "POLICY_AUD": "<your-application-aud-tag>"
   }
   ```
   (These are not secrets, but you can also set them as Worker secrets/vars in the
   dashboard.)

### 3. Seed the users

[`migrations/0002_seed.sql`](migrations/0002_seed.sql) seeds five users
(Austin = admin; Christina, Sydney, Sharon, Lynette = staff) and the recurring
checklist. **The non-Austin emails are best-guess placeholders** — confirm each
matches exactly what Entra/Access sends, then run `npm run db:migrate:remote`, or
fix them in the in-app Users screen once an admin can sign in. Make sure at least
one user is `admin`.

### 4. Deploy

```bash
npm run deploy             # vite build && wrangler deploy
```

Or connect the GitHub repo in the Cloudflare dashboard
(**Workers & Pages → Create → connect to Git**) for auto-deploy on push to
`main`. Set the build command to `npm run build` and the deploy command to
`npx wrangler deploy` (Cloudflare runs `wrangler deploy` automatically for Workers
projects).

### 5. Smoke-test

Visit the app as each of the four identities and confirm roles behave as
expected (admin sees Templates/Users tabs; staff can only act on their assigned
tasks; viewer is read-only).

---

## API reference

All routes require a valid Access JWT (or dev bypass locally). Authorization is
enforced per route.

| Method | Route | Who | Purpose |
| ------ | ----- | --- | ------- |
| GET | `/api/me` | any | Current user + role |
| GET | `/api/periods` | any | List periods (with progress) |
| GET | `/api/periods/:id` | any | One period |
| POST | `/api/periods` | admin | Open period; spawn tasks from active templates |
| POST | `/api/periods/:id/close` | admin | Close (locks tasks) |
| POST | `/api/periods/:id/reopen` | admin | Reopen a closed period |
| GET | `/api/periods/:id/tasks` | any | Tasks for a period |
| GET | `/api/tasks/:id` | any | One task |
| PATCH | `/api/tasks/:id` | admin / assigned | Notes (assigned), assignment/name/category/due (admin) |
| POST | `/api/tasks/:id/prepare` | preparer / admin | Mark prepared |
| POST | `/api/tasks/:id/review` | reviewer / admin | Sign off |
| POST | `/api/tasks/:id/reopen` | reviewer / admin | Pull back a sign-off |
| POST | `/api/tasks/:id/comments` | writer | Add comment |
| GET | `/api/tasks/:id/activity` | any | Task timeline |
| GET/POST | `/api/templates` | read: any / write: admin | Master checklist |
| PATCH/DELETE | `/api/templates/:id` | admin | Edit / deactivate template |
| GET | `/api/users` | any | List users |
| POST | `/api/users` | admin | Add user |
| PATCH | `/api/users/:id` | admin | Edit user / role / active |

## NPM scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Run the Worker locally (API + built SPA) on :8787 |
| `npm run dev:web` | Vite dev server on :5173 (proxies `/api` to :8787) |
| `npm run build` | Build the SPA into `dist/` |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:create` | Create the remote D1 database |
| `npm run db:migrate:local` | Apply migrations to the local DB |
| `npm run db:migrate:remote` | Apply migrations to the remote DB |
| `npm run db:reset:local` | Wipe local state and re-migrate |
