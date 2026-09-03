# Inventory Alert — Shopify app

Set a low-stock threshold once, and every morning the store owner gets a single
email listing every product that has fallen to or below it.

- **Merchant picks the threshold.** Defaults to **10 units**, editable per store.
- **Sent every morning.** At an hour the merchant chooses, in the **store's own
  timezone** — so "8 AM" means 8 AM where the team actually is.
- **One digest, not a flood.** Every low variant in one email, sorted
  lowest-first, with a per-location breakdown and deep links into the admin.

---

## How it works

```
                     every 5 minutes
  node-cron tick ─────────────────────►  isDue(shop, now)?
                                              │  compares the shop's local time
                                              │  against its configured send time
                                              ▼
                                    runInventoryAlert(shop)
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              ▼                               ▼                               ▼
   Admin GraphQL productVariants     renderDigestEmail()              AlertRun audit row
   query: inventory_quantity:<=N     HTML + plain text            (shown on the History page)
              │                               │
              └──────────────► sendEmail() ◄──┘
                          SMTP / Resend / SendGrid
```

The scheduled job authenticates with the **offline access token** stored at
install time, so it runs while nobody is logged into the app.

### Why a threshold filter and not a webhook

`inventory_levels/update` fires on every sale. A merchant selling steadily would
get dozens of emails a day. A once-a-morning digest keyed off a threshold is what
the requirement asks for, and it is what a buyer can actually act on.

---

## Pages

| Page | What it does |
| --- | --- |
| **Overview** (`/app`) | Live list of everything at or below the threshold, plus counts and the next scheduled send. Includes **Send digest now** for an immediate test. |
| **Alert settings** (`/app/settings`) | Threshold, recipients, send time, timezone, and what to include. |
| **History** (`/app/history`) | Every digest attempt — sent, skipped, or failed — with the reason. |

---

## Running it

### What you need first

1. A free **[Shopify Partner account](https://partners.shopify.com/signup)**.
2. A **development store** (Partner Dashboard → Stores → Add store → Development
   store). This is a free test store — use it, not a live one.
3. **Node 20.10+**. Check with `node -v`.

You do *not* need an email provider to get started — see step 4.

---

### Step 1 — Install and set up the database

```bash
git clone https://github.com/jaisudhakar/Shopify-inventory-alert.git
cd Shopify-inventory-alert
git checkout claude/shopify-inventory-alert-app-yco983

npm install
cp .env.example .env
npm run setup:dev      # generates the Prisma client and creates the SQLite database
```

### Step 2 — Create the app in your Partner account

```bash
npm run config:link
```

This is interactive. It logs you into Shopify, asks whether to create a new app
or link an existing one (choose **Create a new app**), and then writes your
`client_id` into `shopify.app.toml` for you.

### Step 3 — Start it

```bash
npm run dev
```

The Shopify CLI opens a tunnel, injects `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
/ `SHOPIFY_APP_URL` for you, and prints an install link. Press `p` to open it,
pick your development store, and click **Install**.

The app opens inside the Shopify admin. On install it seeds itself with a
threshold of **10**, the store owner's email as the recipient, and your store's
own timezone.

### Step 4 — See the emails

Straight after install the app runs in **`console` mode**: nothing is sent, the
digest is printed to the terminal running `npm run dev`. Both the Overview and
Settings pages tell you this is happening.

Click **Send digest now** on the Overview page and the email appears in your
terminal — subject line, product list, quantities and all. That is the fastest
way to confirm the whole thing works.

**To send real email**, put credentials in `.env` and restart. Any one of these
is enough:

```bash
# Option A — any SMTP server (Gmail, Mailgun, Postmark, Amazon SES, ...)
EMAIL_FROM="Inventory Alerts <alerts@your-domain.com>"
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password

# Option B — Resend
EMAIL_FROM="Inventory Alerts <alerts@your-domain.com>"
RESEND_API_KEY=re_...

# Option C — SendGrid
EMAIL_FROM="Inventory Alerts <alerts@your-domain.com>"
SENDGRID_API_KEY=SG....
```

The Settings page shows which provider is active and warns you if none is.

### Step 5 — Test the morning schedule without waiting until morning

The simplest way is the **Send digest now** button on the Overview page — it
runs the exact same code the scheduler runs, with no ports or URLs involved.

To test the *timing* too, set the send time on the Settings page to a few
minutes from now. The scheduler ticks every 5 minutes, so the digest goes out on
the first tick after that time.

To fire it from the command line, add a secret to `.env`, restart the app, then:

```bash
npm run alert:run                            # every store whose send time has arrived
npm run alert:run -- YOUR-STORE.myshopify.com   # one store, right now
```

```bash
# in .env
CRON_SECRET=any-random-string
```

`npm run alert:run` reads `SHOPIFY_APP_URL` and `CRON_SECRET` out of `.env`
itself, so there is nothing to export.

> **Careful with the URL.** When you run `npm run dev`, the Shopify CLI picks its
> own local port and serves the app on a **tunnel URL** it prints at startup
> (`https://....trycloudflare.com`). It is *not* on `http://localhost:3000`, and
> curling that address gives you `Failed to connect to localhost port 3000`.
> Set `SHOPIFY_APP_URL` in `.env` to whichever of these applies:
>
> | How you started it | `SHOPIFY_APP_URL` |
> | --- | --- |
> | `npm run dev` | the tunnel URL the CLI printed |
> | `npm run build && npm start` | `http://localhost:3000` |

Every attempt — sent, skipped, or failed — is recorded on the **History** page
with the reason, so you can always see what happened.

### Running without a Shopify store

The logic is fully testable on its own, no store and no mail server required:

```bash
npm test        # 63 tests
npm run typecheck
npm run build
```

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | From the Partner Dashboard. `npm run dev` injects these for you locally; set them explicitly in production. |
| `SHOPIFY_APP_URL` | Public HTTPS URL of the app. Used for OAuth and for the settings link in the email. |
| `SCOPES` | `read_products,read_inventory,read_locations` |
| `DATABASE_URL` | SQLite by default (`file:./prisma/dev.sqlite`). |
| `EMAIL_PROVIDER` | `smtp`, `resend`, `sendgrid`, or `console`. Auto-detected from whichever credentials are present. |
| `EMAIL_FROM` | e.g. `Inventory Alerts <alerts@your-domain.com>` |
| `ENABLE_SCHEDULER` | `true` (default) runs the digest in-process. Set `false` to drive it externally — see below. |
| `SCHEDULER_CRON` | How often to check for due shops. Defaults to `*/5 * * * *`. |
| `CRON_SECRET` | Bearer token protecting `/api/cron/daily`. |

---

## Choosing where the schedule runs

The app ships with an in-process scheduler (`node-cron`) that ticks every five
minutes and sends each shop's digest when its local send time arrives. That is
the right choice for a single always-on instance.

**Set `ENABLE_SCHEDULER=false` and use the HTTP endpoint instead** if you run more
than one web instance (they would each send the digest) or your host sleeps idle
processes (Heroku eco dynos, Render free tier, most serverless platforms):

```bash
curl -X POST https://your-app.example.com/api/cron/daily \
     -H "Authorization: Bearer $CRON_SECRET"
```

Use the app's real public URL here, the same value as `SHOPIFY_APP_URL`.

Point any scheduler at that URL every 5–15 minutes; it sends only to the shops
whose local send time has arrived. `npm run alert:run` wraps the same call and
reads both values from `.env`:

```bash
npm run alert:run

# force one store immediately, ignoring its send time
npm run alert:run -- demo.myshopify.com
```

**Sending exactly once** is enforced in the data, not the timer: each shop
records the local calendar date of its last scheduled send, and `isDue()` refuses
to send again for the same date. Overlapping ticks, restarts, and a mix of both
schedulers are all safe. A digest missed while the process was down is still sent
when it comes back, up to six hours past the slot — after that it is dropped,
because a "morning" digest arriving at 9 PM is worse than none.

---

## Deploying

```bash
docker build -t inventory-alert .
docker run -p 3000:3000 --env-file .env inventory-alert
```

For anything beyond a single instance, switch `prisma/schema.prisma` to
`postgresql` and point `DATABASE_URL` at a managed database — SQLite in a
container is lost on every redeploy, taking the OAuth sessions with it. No model
changes are needed.

---

## Tests

```bash
npm test        # 63 tests, no Shopify store or mail server required
npm run typecheck
npm run build
```

The suites cover the parts that are expensive to get wrong:

| Suite | Covers |
| --- | --- |
| `tests/schedule.test.ts` | The send-once-per-local-day rule, DST changes, the catch-up window, and timezone handling across the UTC date boundary. |
| `tests/inventory.test.ts` | Pagination, the untracked/draft/archived filters, per-location breakdown, the page cap, and GraphQL error propagation. |
| `tests/email-template.test.ts` | Subject pluralisation, the all-clear email, HTML escaping of product titles, and admin deep links. |
| `tests/settings.test.ts` | Validation of the threshold, recipients, send time, and timezone. |
| `tests/time.test.ts` | Timezone conversion and next-send calculation. |
| `tests/mailer.test.ts` | Provider selection, the console fallback, and provider-rejection errors. |

---

## Project layout

```
app/
  shopify.server.ts             OAuth, session storage, webhooks
  models/settings.server.ts     per-shop settings + validation
  services/
    inventory.server.ts         Admin GraphQL low-stock query
    email-template.server.ts    HTML + plain-text digest
    mailer.server.ts            SMTP / Resend / SendGrid / console
    alerts.server.ts            orchestration + audit log
    scheduler.server.ts         in-process node-cron tick
  shared/
    schedule.ts                 isDue() — the send-once-per-day rule
    time.ts                     timezone helpers
    inventory.ts                types shared by server and UI
  routes/
    app._index.tsx              Overview
    app.settings.tsx            Alert settings
    app.history.tsx             History
    api.cron.daily.tsx          external scheduler endpoint
    webhooks.app.*.tsx          uninstall + scope updates
prisma/schema.prisma            Session, AlertSetting, AlertRun
```

---

## Notes and limitations

- **Scopes** are `read_products`, `read_inventory`, `read_locations` — read-only.
  The app never writes to the store.
- **The threshold compares the aggregate available quantity across all
  locations**, which is the number the merchant sees in the Products list. The
  email breaks it down per location so a "12 total" that is 0 in the warehouse is
  still visible.
- **Untracked variants** always report 0 in Shopify's API and are excluded by
  default; there is a setting to include them.
- **A very large catalog is capped** at 2,500 low-stock variants per run (25
  pages of 100). The email and the Overview both say so when the cap is hit.
- **Polaris React is deprecated** by Shopify in favour of Polaris web components.
  It still works and is used here for the admin UI, but a future version of this
  app should migrate. Nothing outside `app/routes/*.tsx` depends on it.
- **Uninstalling a store** deletes its settings, history, and sessions via the
  `app/uninstalled` webhook.
