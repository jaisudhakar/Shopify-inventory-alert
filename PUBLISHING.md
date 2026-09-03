# Publishing this app

There are three ways to get this app onto a store. **Most people want the first
one.** Read the comparison before doing any work — the third is a months-long
commitment and is rarely what you need.

| | Custom app | Unlisted | Shopify App Store |
| --- | --- | --- | --- |
| Who can install | 1 store | Anyone with the link | Anyone browsing the store |
| Shopify review | No | No | **Yes** — weeks, often several rounds |
| Public listing | No | No | Yes |
| Billing API required | No | No | Yes, if you charge |
| Effort | Hours | Hours | Weeks to months |
| Plus-store note | Custom apps on Shopify Plus install via the org admin | — | — |

If you built this for your own store — which is what the original requirement
describes — use **custom** or **unlisted**. Skip to "Deploy the app", then
"Install on your store".

---

## Deploy the app (required for all three)

Shopify has to reach your app over public HTTPS. `localhost` will not work.

### 1. Switch to Postgres

SQLite is the default so the app runs with no setup, but it is wrong for
production: on most hosts the container's filesystem is wiped on every deploy,
which would delete the OAuth sessions and silently stop the digest.

In `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then point `DATABASE_URL` at a managed Postgres instance and run
`npx prisma migrate deploy`. No model changes are needed.

### 2. Set the production environment

```bash
SHOPIFY_API_KEY=...          # Partner Dashboard → your app → Configuration
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=https://your-app.example.com   # your real HTTPS domain
SCOPES=read_products,read_inventory,read_locations
DATABASE_URL=postgresql://...

EMAIL_FROM="Inventory Alerts <alerts@your-domain.com>"
RESEND_API_KEY=...           # or SMTP_HOST/... or SENDGRID_API_KEY

ENABLE_SCHEDULER=true        # see "Scheduling in production" below
CRON_SECRET=...              # a long random string
```

Use your host's secret manager. Do not commit `.env`.

**Verify your sending domain** (SPF/DKIM) with whichever email provider you
choose. Unverified domains land the digest in spam, which looks exactly like the
app being broken.

### 3. Deploy

```bash
docker build -t inventory-alert .
docker run -p 3000:3000 --env-file .env inventory-alert
```

The image runs `prisma migrate deploy` on start. Any host that runs a container
or a Node process works — Fly, Render, Railway, Heroku, ECS, a VPS.

### 4. Scheduling in production

| Your setup | Setting |
| --- | --- |
| One always-on instance | `ENABLE_SCHEDULER=true` — done |
| Two or more instances | `ENABLE_SCHEDULER=false`, else each one sends its own copy |
| Host sleeps idle processes | `ENABLE_SCHEDULER=false` |

For the last two, have an external scheduler POST to `/api/cron/daily` every
5–15 minutes with `Authorization: Bearer $CRON_SECRET`. It only sends to shops
whose local send time has arrived, so calling it often is safe.

### 5. Point the app config at the deployed URL

```bash
npm run config:link      # if not already linked
npm run deploy           # pushes shopify.app.toml + webhooks to Shopify
```

Set `application_url` in `shopify.app.toml` to your HTTPS domain, and make the
`redirect_urls` match it, before deploying. `npm run deploy` also registers the
compliance webhooks.

---

## Install on your store

### Custom app (one store)

1. Partner Dashboard → **Apps** → your app → **Distribution**
2. Choose **Custom distribution** and enter the store's `.myshopify.com` domain
3. Copy the generated install link and open it while logged into that store
4. Click **Install**

Custom distribution is permanent — you cannot switch an app to public
distribution afterwards. If you might list it publicly later, choose unlisted.

### Unlisted app (any store, no review)

Partner Dashboard → **Distribution** → **Shopify App Store** → choose
**unlisted**. You get an install link that works on any store but does not
appear in search. This still requires the App Store submission form, but no
review queue.

---

## Shopify App Store listing

Only worth it if you intend to sell this to other merchants. Expect several
review rounds.

### Already done in this repo

- ✅ **Compliance webhooks** — `customers/data_request`, `customers/redact`, and
  `shop/redact` are implemented and declared. `shop/redact` deletes the shop's
  settings, digest history, and session; the customer topics acknowledge and
  explain that no customer data is stored.
- ✅ **HMAC verification** on every webhook, via `authenticate.webhook`.
- ✅ **Minimal scopes** — read-only: `read_products`, `read_inventory`,
  `read_locations`. Reviewers reject scopes you do not use.
- ✅ **Session storage** in the database, not memory.
- ✅ **Embedded** with App Bridge, and it uninstalls cleanly.

### You still have to do

- [ ] **Privacy policy URL.** Required. It must state what you collect (shop
      settings, recipient email addresses, inventory data read from the store),
      why, how long you keep it, and who you share it with. Write this yourself
      or have it reviewed — it is a legal document and I have not drafted one.
- [ ] **Listing content**: name, icon (1200×1200), 3+ screenshots, description,
      support email, and a demo video for most categories.
- [ ] **A test store** with real-looking products for the reviewer, plus
      step-by-step instructions to reproduce the alert.
- [ ] **Billing** via the Billing API if you charge. Charging outside Shopify's
      billing is grounds for rejection.
- [ ] **Performance and uptime** — reviewers do install it and click around.
- [ ] Read the [App Store requirements checklist](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
      end to end. It is the same checklist the review team uses.

### Honest assessment before you submit

This app works and its logic is well tested, but as a *commercial listing* it is
thin. "Low stock email" is a crowded category on the App Store. Before investing
weeks in review, consider whether it needs a differentiator — per-supplier
digests, reorder quantity suggestions, Slack delivery, per-product thresholds.
As an internal tool for your own store it is complete as it stands.

---

## After going live

- **Watch the History page** — every digest attempt is recorded with its outcome.
- **Watch the startup summary** in your server logs; it lists each installed
  store, its threshold and send time, and flags any with no recipients.
- **Deliverability is the usual failure.** If merchants report missing digests,
  check the sending domain's SPF/DKIM before suspecting the app.
