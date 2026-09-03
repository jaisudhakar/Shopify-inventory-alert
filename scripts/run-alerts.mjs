#!/usr/bin/env node
/**
 * Triggers the daily digest through the app's HTTP endpoint.
 *
 * Use this from an external scheduler (Heroku Scheduler, a systemd timer, a
 * GitHub Actions cron, cron-job.org) when you have set ENABLE_SCHEDULER=false:
 *
 *   SHOPIFY_APP_URL=https://your-app.example.com \
 *   CRON_SECRET=... \
 *   node scripts/run-alerts.mjs
 *
 * Pass a shop domain to force one store's digest immediately, ignoring its
 * configured send time:
 *
 *   node scripts/run-alerts.mjs demo.myshopify.com
 */

const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!appUrl) {
  console.error("SHOPIFY_APP_URL is required.");
  process.exit(1);
}
if (!secret) {
  console.error("CRON_SECRET is required and must match the app's environment.");
  process.exit(1);
}

const shop = process.argv[2];
const url = new URL("/api/cron/daily", appUrl);
if (shop) url.searchParams.set("shop", shop);

const response = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});

const body = await response.text();

if (!response.ok) {
  console.error(`Request failed (${response.status}): ${body}`);
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
