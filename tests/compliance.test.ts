import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { parse as parseToml } from "smol-toml";

/**
 * Shopify requires all three compliance topics for any app distributed through
 * the Partner Dashboard, and rejects submission without them. These assertions
 * exist so a future config edit cannot silently drop one.
 */
const REQUIRED: Array<{ topic: string; uri: string; route: string }> = [
  {
    topic: "customers/data_request",
    uri: "/webhooks/customers/data_request",
    route: "app/routes/webhooks.customers.data_request.tsx",
  },
  {
    topic: "customers/redact",
    uri: "/webhooks/customers/redact",
    route: "app/routes/webhooks.customers.redact.tsx",
  },
  {
    topic: "shop/redact",
    uri: "/webhooks/shop/redact",
    route: "app/routes/webhooks.shop.redact.tsx",
  },
];

interface Subscription {
  uri?: string;
  topics?: string[];
  compliance_topics?: string[];
}

interface AppConfig {
  webhooks: { api_version: string; subscriptions: Subscription[] };
  access_scopes: { scopes: string };
}

const config = parseToml(
  readFileSync("shopify.app.toml", "utf8"),
) as unknown as AppConfig;

const subscriptions = config.webhooks.subscriptions;

describe("mandatory compliance webhooks", () => {
  for (const { topic, uri, route } of REQUIRED) {
    it(`declares ${topic} in shopify.app.toml`, () => {
      const match = subscriptions.find((s) => s.compliance_topics?.includes(topic));
      assert.ok(match, `${topic} is not declared — Shopify will reject the app`);
      assert.equal(match.uri, uri);
    });

    it(`has a handler for ${topic} that verifies the request`, () => {
      const source = readFileSync(route, "utf8");
      // authenticate.webhook performs the HMAC check; without it the endpoint
      // would act on unsigned requests from anyone.
      assert.match(source, /authenticate\.webhook\(request\)/);
      assert.match(source, /export const action/);
    });
  }

  it("uses compliance_topics rather than topics for these", () => {
    for (const { topic } of REQUIRED) {
      const wrong = subscriptions.find((s) => s.topics?.includes(topic));
      assert.equal(wrong, undefined, `${topic} must use compliance_topics, not topics`);
    }
  });

  it("erases shop data on shop/redact, not just settings", () => {
    const source = readFileSync("app/routes/webhooks.shop.redact.tsx", "utf8");
    assert.match(source, /purgeShopData/);
    const model = readFileSync("app/models/settings.server.ts", "utf8");
    for (const table of ["alertSetting", "alertRun", "session"]) {
      assert.match(model, new RegExp(`prisma\\.${table}\\.deleteMany`));
    }
  });
});

describe("app configuration", () => {
  it("requests only the read scopes the digest needs", () => {
    assert.equal(
      config.access_scopes.scopes,
      "read_products,read_inventory,read_locations",
    );
    assert.doesNotMatch(config.access_scopes.scopes, /write_/);
  });

  it("still subscribes to app/uninstalled so data is cleaned up on removal", () => {
    const match = subscriptions.find((s) => s.topics?.includes("app/uninstalled"));
    assert.ok(match);
    assert.equal(match.uri, "/webhooks/app/uninstalled");
  });
});
