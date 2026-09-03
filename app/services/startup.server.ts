import prisma from "../db.server";
import { formatSendTime, nextSendAt, formatInTimeZone } from "../shared/time";
import { isMailConfigured, resolveProvider } from "./mailer.server";

const LINE = "─".repeat(66);

/** True for addresses Shopify's servers cannot reach from the internet. */
export function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
}

/**
 * Prints what the server is actually going to do, once, at boot.
 *
 * Without this the process starts, logs a URL, and goes quiet — which looks
 * identical whether the app is fully working or has no stores installed and no
 * way to get any. The most common case by far is a local server that Shopify
 * cannot reach, so that gets called out explicitly.
 */
export async function logStartupSummary(): Promise<void> {
  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "") ?? "(not set)";
  const provider = resolveProvider();
  const schedulerOn = process.env.ENABLE_SCHEDULER !== "false";
  const now = new Date();

  let shops: Array<{
    shop: string;
    enabled: boolean;
    threshold: number;
    timezone: string;
    sendHour: number;
    sendMinute: number;
    recipients: string;
  }> = [];
  let installedCount = 0;
  let dbError: string | null = null;

  try {
    [shops, installedCount] = await Promise.all([
      prisma.alertSetting.findMany({
        select: {
          shop: true,
          enabled: true,
          threshold: true,
          timezone: true,
          sendHour: true,
          sendMinute: true,
          recipients: true,
        },
        orderBy: { shop: "asc" },
      }),
      prisma.session.count(),
    ]);
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
  }

  const out: string[] = ["", LINE, " Inventory Alert", LINE];

  out.push(` App URL     ${appUrl}`);
  out.push(
    ` Email       ${provider}${isMailConfigured() ? "" : "  (not delivering — digests print to this log)"}`,
  );
  out.push(
    ` Scheduler   ${schedulerOn ? `on — checks every ${process.env.SCHEDULER_CRON ?? "*/5 * * * *"}` : "off (ENABLE_SCHEDULER=false)"}`,
  );

  if (dbError) {
    out.push(` Database    UNREACHABLE — ${dbError}`);
    out.push("");
    out.push(" Run `npm run setup:dev` to create the database, then restart.");
  } else if (shops.length === 0) {
    out.push(` Stores      none installed yet`);
    out.push("");
    out.push(" Nothing will happen until a store installs the app.");
    if (isLocalUrl(appUrl) || appUrl === "(not set)") {
      out.push("");
      out.push(" Shopify cannot reach this server at a local address, so the app");
      out.push(" cannot be installed from here. Stop this process and run:");
      out.push("");
      out.push("     npm run dev");
      out.push("");
      out.push(" That opens a public tunnel, installs the app on your development");
      out.push(" store, and prints a link to open it. Use `npm start` only once the");
      out.push(" app is deployed somewhere Shopify can reach over HTTPS.");
    } else {
      out.push(" Open the app from your Shopify admin to install it.");
    }
  } else {
    out.push(` Sessions    ${installedCount} stored`);
    out.push(` Stores      ${shops.length}`);
    for (const shop of shops) {
      const when = shop.enabled
        ? `next digest ${formatInTimeZone(nextSendAt(now, shop.timezone, shop.sendHour, shop.sendMinute), shop.timezone)}`
        : "alerts off";
      out.push(
        `   • ${shop.shop} — threshold ${shop.threshold}, ${formatSendTime(shop.sendHour, shop.sendMinute)} ${shop.timezone}, ${when}`,
      );
      if (shop.enabled && shop.recipients.trim() === "") {
        out.push("     ⚠ no recipients configured — add one on the Alert settings page");
      }
    }
  }

  out.push(LINE, "");
  console.info(out.join("\n"));
}
