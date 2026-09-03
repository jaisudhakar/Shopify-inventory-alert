import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

import { renderDigestEmail } from "../app/services/email-template.server";
import {
  getFromAddress,
  isMailConfigured,
  resolveProvider,
  sendEmail,
} from "../app/services/mailer.server";

/** Clear every provider credential so the test does not depend on the dev's env. */
function clearProviderEnv() {
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SENDGRID_API_KEY", "");
}

beforeEach(clearProviderEnv);
afterEach(() => vi.unstubAllEnvs());

describe("resolveProvider", () => {
  it("falls back to console when nothing is configured", () => {
    assert.equal(resolveProvider(), "console");
    assert.equal(isMailConfigured(), false);
  });

  it("infers the provider from whichever credential is present", () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    assert.equal(resolveProvider(), "smtp");
    assert.equal(isMailConfigured(), true);

    clearProviderEnv();
    vi.stubEnv("RESEND_API_KEY", "re_123");
    assert.equal(resolveProvider(), "resend");

    clearProviderEnv();
    vi.stubEnv("SENDGRID_API_KEY", "SG.123");
    assert.equal(resolveProvider(), "sendgrid");
  });

  it("lets EMAIL_PROVIDER override the inference", () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("EMAIL_PROVIDER", "console");
    assert.equal(resolveProvider(), "console");
  });

  it("ignores an unrecognised EMAIL_PROVIDER rather than crashing", () => {
    vi.stubEnv("EMAIL_PROVIDER", "carrier-pigeon");
    assert.equal(resolveProvider(), "console");
  });
});

describe("getFromAddress", () => {
  it("uses EMAIL_FROM when set", () => {
    vi.stubEnv("EMAIL_FROM", "Alerts <alerts@shop.com>");
    assert.equal(getFromAddress(), "Alerts <alerts@shop.com>");
  });

  it("has a usable default", () => {
    vi.stubEnv("EMAIL_FROM", "");
    assert.match(getFromAddress(), /@/);
  });
});

describe("sendEmail", () => {
  it("renders and delivers a digest end to end in console mode", async () => {
    const email = renderDigestEmail({
      shop: "demo.myshopify.com",
      shopName: "demo",
      threshold: 10,
      dateLabel: "Thursday, September 3, 2026",
      truncated: false,
      settingsUrl: "https://app.example.com/app/settings",
      items: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          variantTitle: "Large / Blue",
          displayName: "Hoodie",
          sku: "HD-L-BL",
          productId: "gid://shopify/Product/1",
          productTitle: "Hoodie",
          productHandle: "hoodie",
          productStatus: "ACTIVE",
          quantity: 2,
          locations: [{ name: "Warehouse", quantity: 2 }],
        },
      ],
    });

    const result = await sendEmail({ to: ["owner@example.com"], ...email });
    assert.equal(result.provider, "console");
  });

  it("refuses to send with no recipients", async () => {
    await assert.rejects(
      () => sendEmail({ to: [], subject: "s", html: "<p>h</p>", text: "t" }),
      /No recipients configured/,
    );
  });

  it("reports a provider rejection instead of silently succeeding", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_invalid");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "API key is invalid" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await assert.rejects(
      () => sendEmail({ to: ["a@b.com"], subject: "s", html: "<p>h</p>", text: "t" }),
      /Resend rejected the email \(401\): API key is invalid/,
    );

    vi.unstubAllGlobals();
  });
});
