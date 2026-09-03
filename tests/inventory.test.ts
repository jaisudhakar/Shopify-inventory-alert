import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { fetchLowStockItems } from "../app/services/inventory.server";
import { adminProductUrl, numericIdFromGid } from "../app/shared/inventory";

interface VariantSpec {
  id: number;
  title?: string;
  sku?: string | null;
  quantity: number;
  tracked?: boolean;
  productStatus?: string;
  productTitle?: string;
  locations?: Array<{ name: string; quantity: number }>;
}

function variant(spec: VariantSpec) {
  const locations = spec.locations ?? [{ name: "Main warehouse", quantity: spec.quantity }];
  return {
    id: `gid://shopify/ProductVariant/${spec.id}`,
    title: spec.title ?? "Default Title",
    sku: spec.sku === undefined ? `SKU-${spec.id}` : spec.sku,
    displayName: `${spec.productTitle ?? `Product ${spec.id}`} - ${spec.title ?? "Default Title"}`,
    inventoryQuantity: spec.quantity,
    inventoryItem: {
      id: `gid://shopify/InventoryItem/${spec.id}`,
      tracked: spec.tracked ?? true,
      inventoryLevels: {
        nodes: locations.map((location, index) => ({
          id: `gid://shopify/InventoryLevel/${spec.id}-${index}`,
          location: { id: `gid://shopify/Location/${index}`, name: location.name },
          quantities: [{ name: "available", quantity: location.quantity }],
        })),
      },
    },
    product: {
      id: `gid://shopify/Product/${spec.id}`,
      title: spec.productTitle ?? `Product ${spec.id}`,
      handle: `product-${spec.id}`,
      status: spec.productStatus ?? "ACTIVE",
      totalInventory: spec.quantity,
    },
  };
}

/** Minimal stand-in for the Admin API client, one canned page per call. */
function stubAdmin(pages: Array<{ nodes: unknown[]; hasNextPage?: boolean }>) {
  const calls: Array<Record<string, unknown>> = [];
  let index = 0;

  const admin = {
    graphql: async (_query: string, options?: { variables?: Record<string, unknown> }) => {
      calls.push(options?.variables ?? {});
      const page = pages[index] ?? { nodes: [], hasNextPage: false };
      index += 1;
      return {
        json: async () => ({
          data: {
            productVariants: {
              pageInfo: {
                hasNextPage: page.hasNextPage ?? false,
                endCursor: `cursor-${index}`,
              },
              nodes: page.nodes,
            },
          },
        }),
      };
    },
  };

  return { admin: admin as never, calls };
}

const OPTIONS = { threshold: 10, includeUntracked: false, onlyActiveProducts: true };

describe("fetchLowStockItems", () => {
  it("asks Shopify for variants at or below the threshold", async () => {
    const { admin, calls } = stubAdmin([{ nodes: [] }]);
    await fetchLowStockItems(admin, { ...OPTIONS, threshold: 10 });
    assert.equal(calls[0].query, "inventory_quantity:<=10");
    assert.equal(calls[0].first, 100);
  });

  it("returns low-stock variants sorted by quantity ascending", async () => {
    const { admin } = stubAdmin([
      {
        nodes: [
          variant({ id: 1, quantity: 7 }),
          variant({ id: 2, quantity: 0 }),
          variant({ id: 3, quantity: 3 }),
        ],
      },
    ]);

    const { items, truncated } = await fetchLowStockItems(admin, OPTIONS);

    assert.deepEqual(
      items.map((item) => item.quantity),
      [0, 3, 7],
    );
    assert.equal(truncated, false);
  });

  it("excludes untracked variants by default and includes them on request", async () => {
    const nodes = [
      variant({ id: 1, quantity: 4, tracked: true }),
      variant({ id: 2, quantity: 0, tracked: false }),
    ];

    const excluded = await fetchLowStockItems(stubAdmin([{ nodes }]).admin, OPTIONS);
    assert.deepEqual(excluded.items.map((item) => item.variantId), [
      "gid://shopify/ProductVariant/1",
    ]);

    const included = await fetchLowStockItems(stubAdmin([{ nodes }]).admin, {
      ...OPTIONS,
      includeUntracked: true,
    });
    assert.equal(included.items.length, 2);
  });

  it("drops draft and archived products when onlyActiveProducts is set", async () => {
    const nodes = [
      variant({ id: 1, quantity: 2, productStatus: "ACTIVE" }),
      variant({ id: 2, quantity: 1, productStatus: "DRAFT" }),
      variant({ id: 3, quantity: 0, productStatus: "ARCHIVED" }),
    ];

    const active = await fetchLowStockItems(stubAdmin([{ nodes }]).admin, OPTIONS);
    assert.deepEqual(active.items.map((item) => item.productStatus), ["ACTIVE"]);

    const all = await fetchLowStockItems(stubAdmin([{ nodes }]).admin, {
      ...OPTIONS,
      onlyActiveProducts: false,
    });
    assert.equal(all.items.length, 3);
  });

  it("follows pagination until Shopify says there is no next page", async () => {
    const { admin, calls } = stubAdmin([
      { nodes: [variant({ id: 1, quantity: 1 })], hasNextPage: true },
      { nodes: [variant({ id: 2, quantity: 2 })], hasNextPage: true },
      { nodes: [variant({ id: 3, quantity: 3 })], hasNextPage: false },
    ]);

    const { items } = await fetchLowStockItems(admin, OPTIONS);

    assert.equal(items.length, 3);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].after, null);
    assert.equal(calls[1].after, "cursor-1");
  });

  it("flags the result as truncated when the page cap is reached", async () => {
    const pages = Array.from({ length: 30 }, (_, index) => ({
      nodes: [variant({ id: index + 1, quantity: 1 })],
      hasNextPage: true,
    }));

    const { items, truncated } = await fetchLowStockItems(stubAdmin(pages).admin, OPTIONS);

    assert.equal(truncated, true);
    assert.equal(items.length, 25, "stops at the 25-page cap");
  });

  it("keeps a per-location breakdown, lowest first", async () => {
    const { admin } = stubAdmin([
      {
        nodes: [
          variant({
            id: 1,
            quantity: 5,
            locations: [
              { name: "Retail", quantity: 4 },
              { name: "Warehouse", quantity: 1 },
            ],
          }),
        ],
      },
    ]);

    const { items } = await fetchLowStockItems(admin, OPTIONS);
    assert.deepEqual(items[0].locations, [
      { name: "Warehouse", quantity: 1 },
      { name: "Retail", quantity: 4 },
    ]);
  });

  it("normalises a blank SKU to null", async () => {
    const { admin } = stubAdmin([
      { nodes: [variant({ id: 1, quantity: 1, sku: "  " })] },
    ]);
    const { items } = await fetchLowStockItems(admin, OPTIONS);
    assert.equal(items[0].sku, null);
  });

  it("surfaces GraphQL errors instead of reporting an empty catalog", async () => {
    const admin = {
      graphql: async () => ({
        json: async () => ({ errors: [{ message: "Access denied for productVariants" }] }),
      }),
    } as never;

    await assert.rejects(
      () => fetchLowStockItems(admin, OPTIONS),
      /Access denied for productVariants/,
    );
  });
});

describe("admin links", () => {
  it("builds a product URL from a gid", () => {
    assert.equal(numericIdFromGid("gid://shopify/Product/123"), "123");
    assert.equal(
      adminProductUrl("demo.myshopify.com", "gid://shopify/Product/123"),
      "https://demo.myshopify.com/admin/products/123",
    );
  });
});
