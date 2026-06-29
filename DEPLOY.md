# Deployment & cutover runbook

Goal: get the app deployed on Cloudflare, behind Cloudflare Access (Entra ID),
with Teams notifications, then cut the team over from Monday.

Steps marked **[you]** require your Cloudflare/Microsoft 365 admin access — I
can't click those. Everything else is in this repo and ready.

---

## 0. Prerequisites

- A Cloudflare account (Workers + D1 are free at this scale).
- Microsoft 365 / Entra ID admin (to add the IdP + Access policy).
- Teams admin/member rights on the channel you want notifications in.
- `npm install` already run; `npx wrangler login` once **[you]** (opens a browser).

---

## 1. Create the D1 database **[you]**

```bash
npm run db:create          # npx wrangler d1 create greyloch-close
```

Copy the printed `database_id` into [`wrangler.jsonc`](wrangler.jsonc)
(`d1_databases[0].database_id`). Then load schema + seed + history:

```bash
npm run db:migrate:remote  # applies 0001..0004 to the remote DB
```

This creates the templates **and** backfills April/May (closed) + June (open,
in-progress) — see [§6 Cutover](#6-cutover-notes).

> Confirm the **team emails** in [`migrations/0002_seed.sql`](migrations/0002_seed.sql)
> are real and match Entra exactly *before* this step (or fix them later in the
> Users screen). At least one user must be `admin`.

---

## 2. Microsoft Teams notifications **[you]**

Classic O365 "Incoming Webhook" connectors are retiring, so use a Power Automate
**Workflow**:

1. In Teams, open the target channel → **•••** → **Workflows**.
2. Pick the template **"Post to a channel when a webhook request is received."**
3. Finish the wizard; it generates an **HTTP POST URL**. Copy it.
4. Store it as a Worker secret:
   ```bash
   npx wrangler secret put TEAMS_WEBHOOK_URL
   # paste the URL when prompted
   ```

The Worker posts Adaptive Cards in the shape this Workflow trigger expects. If
`TEAMS_WEBHOOK_URL` is unset, notifications are simply skipped (no errors), so
you can deploy first and add Teams later.

Notifications fire on: ready-for-review, sign-off, reopen, blocked, period
open/close, plus a **daily overdue digest** via the cron trigger
(`triggers.crons` in [`wrangler.jsonc`](wrangler.jsonc), 15:00 UTC ≈ 9am MT).

---

## 3. Cloudflare Access + Entra ID **[you]**

1. Cloudflare dashboard → **Zero Trust** (enable free plan if first time).
2. **Settings → Authentication → Login methods → Add new → Microsoft Entra ID**
   (Azure AD). Supply the Entra app registration's client ID/secret + directory
   ID. Test the connection.
3. **Access → Applications → Add → Self-hosted.** Set the application domain to
   the app's hostname (your `*.workers.dev` URL, or a custom domain).
4. **Policy:** Action *Allow*, Include → *Emails* = the team's addresses (or an
   Entra security group). This is the only gate on who can reach the app.
5. From the application's **Overview**, copy:
   - **Team domain** → `https://<your-team>.cloudflareaccess.com`
   - **Application Audience (AUD) tag**
6. Put them in [`wrangler.jsonc`](wrangler.jsonc) `vars` (`TEAM_DOMAIN`,
   `POLICY_AUD`) and set `APP_URL` to the app's public URL.

The Worker validates every request's Access JWT (signature + `iss` + `aud`); see
[`src/auth.ts`](src/auth.ts). Authorization (roles/SoD) is enforced separately in
the app.

---

## 4. Deploy **[you]**

```bash
npm run deploy             # vite build && wrangler deploy
```

Or connect the GitHub repo in **Workers & Pages → connect to Git** for
auto-deploy on push to `main` (build command `npm run build`; Cloudflare runs
`wrangler deploy`). Secrets and the D1 binding persist across deploys.

---

## 5. Smoke test **[you]**

1. Visit the app as yourself → you should pass Access and land as **admin**.
2. Confirm June shows ~66/83 done with the right tasks still open.
3. Have one teammate sign in → confirm they only act on their assigned tasks.
4. Prepare a task assigned to someone else → confirm a Teams card posts.
5. (Optional) Force the digest: `npx wrangler tail` in one shell, then trigger
   the cron from the dashboard, or wait for 15:00 UTC.

---

## 6. Cutover notes

- **History migrated** (migration `0004`): April & May 2026 as **closed**
  periods (all tasks complete), June 2026 as **open** with the 17 tasks still in
  flight on the Monday board left as *not started*. Timestamps are approximate —
  Monday doesn't expose per-task sign-off history — so the historical audit
  trail is "who/when by assignment + period," not minute-accurate.
- After cutover, **open July** in the app (it spawns fresh from the templates)
  and stop using the Monday close boards. Your other Monday boards (Job Creation,
  Delivery, Operations, etc.) are untouched.
- The June import assumes the assignee→preparer and Sharon/Austin reviewer
  defaults; reassign in-app as needed.

---

## 7. What still needs your input

| Item | Where |
| --- | --- |
| Real team emails (match Entra) | `migrations/0002_seed.sql` or Users screen |
| D1 `database_id` | `wrangler.jsonc` after `db:create` |
| `TEAM_DOMAIN`, `POLICY_AUD`, `APP_URL` | `wrangler.jsonc` vars |
| `TEAMS_WEBHOOK_URL` | `wrangler secret put` |
| Entra IdP + Access policy | Cloudflare Zero Trust dashboard |
