import { timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

import { runDueAlerts, runInventoryAlert } from "../services/alerts.server";

/**
 * Trigger endpoint for an external scheduler (Heroku Scheduler, GitHub Actions,
 * Fly machines, cron-job.org, …). Use this instead of the in-process scheduler
 * whenever the app runs on more than one instance or on a platform that sleeps
 * idle processes — set ENABLE_SCHEDULER=false there so the digest is not sent
 * twice.
 *
 *   curl -X POST https://your-app.example.com/api/cron/daily \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Pass `?shop=example.myshopify.com` to force one store's digest immediately,
 * ignoring its configured send time.
 */
function assertAuthorized(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "CRON_SECRET is not configured on the server." }, 503);
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const provided = bearer || request.headers.get("x-cron-secret") || "";

  if (!safeEqual(provided, secret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths first — the
  // length of a secret is not itself sensitive.
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const unauthorized = assertAuthorized(request);
  if (unauthorized) return unauthorized;

  const shop = new URL(request.url).searchParams.get("shop");

  if (shop) {
    const result = await runInventoryAlert({ shop, trigger: "cron", force: true });
    return json({ ranAt: new Date().toISOString(), results: [summarize(result)] });
  }

  const results = await runDueAlerts(new Date(), "cron");
  return json({
    ranAt: new Date().toISOString(),
    shopsProcessed: results.length,
    results: results.map(summarize),
  });
};

// Schedulers that can only issue GET requests are supported too.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return action({ request, params: {}, context: {} } as ActionFunctionArgs);
};

function summarize(result: {
  shop: string;
  status: string;
  itemCount: number;
  message: string;
}) {
  return {
    shop: result.shop,
    status: result.status,
    itemCount: result.itemCount,
    message: result.message,
  };
}
