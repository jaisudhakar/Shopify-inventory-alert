import type { AlertSetting } from "@prisma/client";

import prisma from "../db.server";
import { ensureSettingsForShop, parseRecipients } from "../models/settings.server";
import { isDue } from "../shared/schedule";
import { formatInTimeZone, getLocalParts } from "../shared/time";
import { renderDigestEmail } from "./email-template.server";
import type { LowStockItem } from "../shared/inventory";
import { fetchLowStockItems } from "./inventory.server";
import { resolveProvider, sendEmail } from "./mailer.server";

export type AlertTrigger = "scheduled" | "manual" | "cron" | "test";
export type AlertStatus = "sent" | "skipped" | "failed";

export interface AlertRunResult {
  shop: string;
  status: AlertStatus;
  itemCount: number;
  recipients: string[];
  message: string;
  items: LowStockItem[];
}

interface RunOptions {
  shop: string;
  trigger: AlertTrigger;
  /** Send even when the digest is empty or alerts are disabled (used by "Send now"). */
  force?: boolean;
}

function settingsUrlFor(shop: string): string {
  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "") ?? "";
  return `${appUrl}/app/settings?shop=${encodeURIComponent(shop)}`;
}

/**
 * Runs the whole digest for one shop: read settings, query the Admin API for
 * low-stock variants, send the email, and record the attempt. Never throws —
 * failures are recorded as a "failed" AlertRun so the scheduler keeps going and
 * the merchant can see what happened on the History page.
 */
export async function runInventoryAlert(options: RunOptions): Promise<AlertRunResult> {
  const { shop, trigger, force = false } = options;

  let settings: AlertSetting | null = null;
  try {
    settings = await ensureSettingsForShop(shop);

    if (!settings.enabled && !force) {
      return await record(shop, settings, {
        status: "skipped",
        itemCount: 0,
        recipients: [],
        message: "Alerts are turned off for this store.",
        items: [],
        trigger,
      });
    }

    const recipients = parseRecipients(settings.recipients);
    if (recipients.length === 0) {
      return await record(shop, settings, {
        status: "failed",
        itemCount: 0,
        recipients: [],
        message: "No recipient email addresses are configured.",
        items: [],
        trigger,
      });
    }

    const { unauthenticated } = await import("../shopify.server");
    const { admin, session } = await unauthenticated.admin(shop);

    const { items, truncated } = await fetchLowStockItems(admin, {
      threshold: settings.threshold,
      includeUntracked: settings.includeUntracked,
      onlyActiveProducts: settings.onlyActiveProducts,
    });

    if (items.length === 0 && settings.skipWhenEmpty && !force) {
      return await record(shop, settings, {
        status: "skipped",
        itemCount: 0,
        recipients,
        message: `Nothing is at or below ${settings.threshold}. No email sent.`,
        items: [],
        trigger,
      });
    }

    const now = new Date();
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(now);

    const email = renderDigestEmail({
      shop,
      shopName: session.shop.replace(/\.myshopify\.com$/, ""),
      threshold: settings.threshold,
      items,
      dateLabel,
      truncated,
      settingsUrl: settingsUrlFor(shop),
    });

    await sendEmail({ to: recipients, ...email });

    const provider = resolveProvider();
    const note =
      provider === "console"
        ? " (no email provider configured — logged to the server console)"
        : "";

    return await record(shop, settings, {
      status: "sent",
      itemCount: items.length,
      recipients,
      message: `Sent to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"} via ${provider}${note}.`,
      items,
      trigger,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[inventory-alert] run failed for ${shop}:`, error);
    return await record(shop, settings, {
      status: "failed",
      itemCount: 0,
      recipients: settings ? parseRecipients(settings.recipients) : [],
      message,
      items: [],
      trigger,
    });
  }
}

interface RecordInput {
  status: AlertStatus;
  itemCount: number;
  recipients: string[];
  message: string;
  items: LowStockItem[];
  trigger: AlertTrigger;
}

async function record(
  shop: string,
  settings: AlertSetting | null,
  input: RecordInput,
): Promise<AlertRunResult> {
  const now = new Date();

  await prisma.alertRun.create({
    data: {
      shop,
      trigger: input.trigger,
      status: input.status,
      threshold: settings?.threshold ?? 0,
      itemCount: input.itemCount,
      recipients: input.recipients.join(", "),
      message: input.message,
      // Keep the snapshot small; the History page only shows a preview.
      payload: JSON.stringify(input.items.slice(0, 50)),
    },
  });

  // Only a scheduled run claims the day's slot. A manual "Send now" must not
  // suppress the next morning's digest.
  if (settings && input.trigger === "scheduled") {
    await prisma.alertSetting.update({
      where: { shop },
      data: {
        lastRunAt: now,
        lastSentLocalDate: getLocalParts(now, settings.timezone).dateKey,
      },
    });
  } else if (settings) {
    await prisma.alertSetting.update({ where: { shop }, data: { lastRunAt: now } });
  }

  return {
    shop,
    status: input.status,
    itemCount: input.itemCount,
    recipients: input.recipients,
    message: input.message,
    items: input.items,
  };
}

/**
 * Every shop whose configured send time has arrived today and that has not been
 * sent a digest yet for its own local date.
 */
export async function findShopsDueNow(now: Date = new Date()): Promise<AlertSetting[]> {
  const candidates = await prisma.alertSetting.findMany({ where: { enabled: true } });

  return candidates.filter((setting) => isDue(setting, now));
}

/** Runs the digest for every shop that is due. Used by cron and the API route. */
export async function runDueAlerts(
  now: Date = new Date(),
  trigger: AlertTrigger = "scheduled",
): Promise<AlertRunResult[]> {
  const due = await findShopsDueNow(now);
  const results: AlertRunResult[] = [];

  for (const setting of due) {
    console.info(
      `[inventory-alert] running ${trigger} digest for ${setting.shop} (local time ${formatInTimeZone(now, setting.timezone)})`,
    );
    results.push(await runInventoryAlert({ shop: setting.shop, trigger }));
  }

  return results;
}
