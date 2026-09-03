#!/usr/bin/env node
/**
 * Triggers the daily digest through the app's HTTP endpoint.
 *
 * Reads SHOPIFY_APP_URL and CRON_SECRET from the environment, falling back to
 * the project's .env file, so this works without exporting anything:
 *
 *   npm run alert:run
 *
 * Pass a shop domain to force that store's digest immediately, ignoring its
 * configured send time:
 *
 *   npm run alert:run -- demo.myshopify.com
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(projectRoot, ".env");

// Node 22 can read a .env file directly — no dotenv dependency needed.
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // A malformed .env should not stop an explicitly-set environment from working.
  }
}

const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/$/, "");
const secret = process.env.CRON_SECRET?.trim();

if (!appUrl) {
  console.error(
    [
      "SHOPIFY_APP_URL is not set.",
      "",
      "Set it in .env to the URL your app is actually reachable at:",
      "  - running `npm run dev`?  use the tunnel URL the Shopify CLI printed",
      "                            (https://....trycloudflare.com) — NOT localhost,",
      "                            because the CLI picks its own local port.",
      "  - running `npm start`?    http://localhost:3000",
    ].join("\n"),
  );
  process.exit(1);
}

if (!secret) {
  console.error(
    "CRON_SECRET is not set. Add it to .env (any random string) and restart the app so it picks up the same value.",
  );
  process.exit(1);
}

const shop = process.argv[2];
const url = new URL("/api/cron/daily", appUrl);
if (shop) url.searchParams.set("shop", shop);

console.error(`POST ${url}`);

let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
} catch (error) {
  console.error(
    [
      `Could not reach ${url.origin} — ${error.message}`,
      "",
      "Is the app running, and is SHOPIFY_APP_URL pointing at the right place?",
      "Under `npm run dev` the app is served on the Shopify CLI's tunnel URL,",
      "not on http://localhost:3000.",
    ].join("\n"),
  );
  process.exit(1);
}

const body = await response.text();

if (!response.ok) {
  const hint =
    response.status === 401
      ? "\nCRON_SECRET here does not match the one the running app was started with."
      : "";
  console.error(`Request failed (${response.status}): ${body}${hint}`);
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
