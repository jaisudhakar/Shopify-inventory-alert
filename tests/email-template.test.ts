import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { renderDigestEmail } from "../app/services/email-template.server";
import type { LowStockItem } from "../app/shared/inventory";

function item(overrides: Partial<LowStockItem> = {}): LowStockItem {
  return {
    variantId: "gid://shopify/ProductVariant/1",
    variantTitle: "Default Title",
    displayName: "Widget",
    sku: "W-1",
    productId: "gid://shopify/Product/1",
    productTitle: "Widget",
    productHandle: "widget",
    productStatus: "ACTIVE",
    quantity: 3,
    locations: [{ name: "Main", quantity: 3 }],
    ...overrides,
  };
}

const BASE = {
  shop: "demo.myshopify.com",
  shopName: "demo",
  threshold: 10,
  dateLabel: "Thursday, September 3, 2026",
  truncated: false,
  settingsUrl: "https://app.example.com/app/settings",
};

describe("renderDigestEmail", () => {
  it("summarises the count in the subject", () => {
    const email = renderDigestEmail({ ...BASE, items: [item(), item({ quantity: 0 })] });
    assert.match(email.subject, /demo: 2 products at or below 10 in stock/);
  });

  it("uses the singular form for one product", () => {
    const email = renderDigestEmail({ ...BASE, items: [item()] });
    assert.match(email.subject, /1 product at or below 10 in stock/);
    assert.doesNotMatch(email.subject, /1 products/);
  });

  it("sends an all-clear subject when nothing is low", () => {
    const email = renderDigestEmail({ ...BASE, items: [] });
    assert.match(email.subject, /inventory is healthy/);
    assert.match(email.html, /Everything is above your threshold/);
    assert.match(email.text, /No product is at or below 10 units today/);
  });

  it("counts out-of-stock variants separately", () => {
    const email = renderDigestEmail({
      ...BASE,
      items: [item({ quantity: 0 }), item({ quantity: 0 }), item({ quantity: 5 })],
    });
    assert.match(email.text, /3 products at or below 10 units \(2 out of stock\)/);
  });

  it("links each row to the product in the Shopify admin", () => {
    const email = renderDigestEmail({ ...BASE, items: [item()] });
    assert.match(email.html, /https:\/\/demo\.myshopify\.com\/admin\/products\/1/);
  });

  it("escapes HTML in merchant-controlled product titles", () => {
    const email = renderDigestEmail({
      ...BASE,
      items: [item({ productTitle: '<script>alert("xss")</script>' })],
    });
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
  });

  it("hides the placeholder variant name but shows a real one", () => {
    const defaultTitle = renderDigestEmail({ ...BASE, items: [item()] });
    assert.doesNotMatch(defaultTitle.html, /Default Title/);

    const realTitle = renderDigestEmail({
      ...BASE,
      items: [item({ variantTitle: "Large / Blue" })],
    });
    assert.match(realTitle.html, /Large \/ Blue/);
    assert.match(realTitle.text, /Widget — Large \/ Blue/);
  });

  it("breaks the quantity down by location when there is more than one", () => {
    const email = renderDigestEmail({
      ...BASE,
      items: [
        item({
          quantity: 4,
          locations: [
            { name: "Warehouse", quantity: 1 },
            { name: "Retail", quantity: 3 },
          ],
        }),
      ],
    });
    assert.match(email.html, /Warehouse: 1/);
    assert.match(email.html, /Retail: 3/);
  });

  it("warns the reader when the report was truncated", () => {
    const email = renderDigestEmail({ ...BASE, items: [item()], truncated: true });
    assert.match(email.html, /Lower your threshold/);
    assert.match(email.text, /Lower your threshold/);
  });

  it("includes a link back to the settings page", () => {
    const email = renderDigestEmail({ ...BASE, items: [item()] });
    assert.match(email.html, /app\.example\.com\/app\/settings/);
    assert.match(email.text, /app\.example\.com\/app\/settings/);
  });
});
