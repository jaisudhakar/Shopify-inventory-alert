import type { AlertSetting } from "@prisma/client";

import prisma from "../db.server";
import { isValidTimeZone } from "../shared/time";

export const DEFAULT_THRESHOLD = 10;
export const DEFAULT_SEND_HOUR = 8;

const SHOP_INFO_QUERY = `#graphql
  query ShopInfo {
    shop {
      id
      name
      email
      contactEmail
      myshopifyDomain
      ianaTimezone
      url
      currencyCode
    }
  }
`;

export interface SettingsInput {
  enabled: boolean;
  threshold: number;
  recipients: string[];
  sendHour: number;
  sendMinute: number;
  timezone: string;
  includeUntracked: boolean;
  onlyActiveProducts: boolean;
  skipWhenEmpty: boolean;
}

export function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export async function getSettings(shop: string): Promise<AlertSetting | null> {
  return prisma.alertSetting.findUnique({ where: { shop } });
}

/**
 * Creates the shop's settings row if it does not exist yet, then tries to fill
 * in the two values we can only learn from the Admin API: the store owner's
 * email and the shop's timezone. Called from `afterAuth`, so a failure here
 * must never break installation.
 */
export async function ensureSettingsForShop(shop: string): Promise<AlertSetting> {
  const existing = await prisma.alertSetting.findUnique({ where: { shop } });
  const setting =
    existing ??
    (await prisma.alertSetting.create({
      data: { shop, threshold: DEFAULT_THRESHOLD, sendHour: DEFAULT_SEND_HOUR },
    }));

  // Only seed; never overwrite what the merchant has since configured.
  const needsRecipients = setting.recipients.trim() === "";
  const needsTimezone = setting.timezone === "UTC";
  if (!needsRecipients && !needsTimezone) {
    return setting;
  }

  try {
    const { unauthenticated } = await import("../shopify.server");
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(SHOP_INFO_QUERY);
    const body = (await response.json()) as {
      data?: {
        shop?: { email?: string; contactEmail?: string; ianaTimezone?: string };
      };
    };
    const shopInfo = body.data?.shop;
    if (!shopInfo) return setting;

    const ownerEmail = shopInfo.email || shopInfo.contactEmail || "";
    const data: { recipients?: string; timezone?: string } = {};
    if (needsRecipients && isValidEmail(ownerEmail)) {
      data.recipients = ownerEmail;
    }
    if (needsTimezone && shopInfo.ianaTimezone && isValidTimeZone(shopInfo.ianaTimezone)) {
      data.timezone = shopInfo.ianaTimezone;
    }
    if (Object.keys(data).length === 0) return setting;

    return await prisma.alertSetting.update({ where: { shop }, data });
  } catch (error) {
    console.error(`[inventory-alert] could not seed settings for ${shop}:`, error);
    return setting;
  }
}

export function validateSettings(input: SettingsInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!Number.isInteger(input.threshold) || input.threshold < 0 || input.threshold > 100_000) {
    errors.threshold = "Enter a whole number between 0 and 100000.";
  }
  if (!Number.isInteger(input.sendHour) || input.sendHour < 0 || input.sendHour > 23) {
    errors.sendHour = "Choose an hour between 0 and 23.";
  }
  if (!Number.isInteger(input.sendMinute) || input.sendMinute < 0 || input.sendMinute > 59) {
    errors.sendMinute = "Choose a minute between 0 and 59.";
  }
  if (!isValidTimeZone(input.timezone)) {
    errors.timezone = "Choose a valid timezone.";
  }
  if (input.enabled && input.recipients.length === 0) {
    errors.recipients = "Add at least one recipient email address.";
  }
  const invalid = input.recipients.filter((email) => !isValidEmail(email));
  if (invalid.length > 0) {
    errors.recipients = `Not a valid email address: ${invalid.join(", ")}`;
  }
  if (input.recipients.length > 20) {
    errors.recipients = "Add at most 20 recipient email addresses.";
  }

  return errors;
}

export async function saveSettings(
  shop: string,
  input: SettingsInput,
): Promise<AlertSetting> {
  const data = {
    enabled: input.enabled,
    threshold: input.threshold,
    recipients: input.recipients.join(", "),
    sendHour: input.sendHour,
    sendMinute: input.sendMinute,
    timezone: input.timezone,
    includeUntracked: input.includeUntracked,
    onlyActiveProducts: input.onlyActiveProducts,
    skipWhenEmpty: input.skipWhenEmpty,
  };

  return prisma.alertSetting.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}

export async function deleteShopData(shop: string): Promise<void> {
  await prisma.alertSetting.deleteMany({ where: { shop } });
  await prisma.alertRun.deleteMany({ where: { shop } });
}
