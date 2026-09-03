import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import type { LowStockItem } from "../shared/inventory";

export type { LowStockItem };

export interface LowStockOptions {
  threshold: number;
  includeUntracked: boolean;
  onlyActiveProducts: boolean;
}

export interface LowStockResult {
  items: LowStockItem[];
  /** True when the page cap was hit and more low-stock variants may exist. */
  truncated: boolean;
}

const PAGE_SIZE = 100;
/** Hard cap so a huge catalog cannot make one digest run forever. */
const MAX_PAGES = 25;

const LOW_STOCK_QUERY = `#graphql
  query LowStockVariants($first: Int!, $after: String, $query: String) {
    productVariants(first: $first, after: $after, query: $query, sortKey: INVENTORY_QUANTITY) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        sku
        displayName
        inventoryQuantity
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 20) {
            nodes {
              id
              location {
                id
                name
              }
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
          }
        }
        product {
          id
          title
          handle
          status
          totalInventory
        }
      }
    }
  }
`;

interface VariantNode {
  id: string;
  title: string | null;
  sku: string | null;
  displayName: string | null;
  inventoryQuantity: number | null;
  inventoryItem: {
    id: string;
    tracked: boolean;
    inventoryLevels: {
      nodes: Array<{
        id: string;
        location: { id: string; name: string } | null;
        quantities: Array<{ name: string; quantity: number }> | null;
      }>;
    } | null;
  } | null;
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    totalInventory: number | null;
  } | null;
}

interface LowStockResponse {
  data?: {
    productVariants?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: VariantNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Fetches every variant whose available inventory is at or below `threshold`.
 *
 * The `inventory_quantity` search filter aggregates across locations, which is
 * the same number the merchant sees in the Products list, so the digest matches
 * what they would find by sorting that page by inventory.
 */
export async function fetchLowStockItems(
  admin: AdminApiContext,
  options: LowStockOptions,
): Promise<LowStockResult> {
  const threshold = Math.max(0, Math.trunc(options.threshold));
  const items: LowStockItem[] = [];

  let after: string | null = null;
  let pages = 0;
  let hasNextPage = true;

  while (hasNextPage && pages < MAX_PAGES) {
    const response = await admin.graphql(LOW_STOCK_QUERY, {
      variables: {
        first: PAGE_SIZE,
        after,
        query: `inventory_quantity:<=${threshold}`,
      },
    });

    const body = (await response.json()) as LowStockResponse;
    if (body.errors?.length) {
      throw new Error(
        `Shopify Admin API error: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }

    const connection = body.data?.productVariants;
    if (!connection) break;

    for (const node of connection.nodes) {
      const item = toLowStockItem(node, options);
      if (item) items.push(item);
    }

    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
    pages += 1;
  }

  items.sort((a, b) => a.quantity - b.quantity || a.displayName.localeCompare(b.displayName));

  return { items, truncated: hasNextPage };
}

function toLowStockItem(
  node: VariantNode,
  options: LowStockOptions,
): LowStockItem | null {
  const product = node.product;
  if (!product) return null;

  // Untracked variants always report 0, which would otherwise dominate the
  // digest even though the merchant is not managing their stock in Shopify.
  const tracked = node.inventoryItem?.tracked ?? false;
  if (!tracked && !options.includeUntracked) return null;

  if (options.onlyActiveProducts && product.status !== "ACTIVE") return null;

  const levels = node.inventoryItem?.inventoryLevels?.nodes ?? [];
  const locations = levels
    .map((level) => ({
      name: level.location?.name ?? "Unknown location",
      quantity:
        level.quantities?.find((q) => q.name === "available")?.quantity ?? 0,
    }))
    .sort((a, b) => a.quantity - b.quantity);

  return {
    variantId: node.id,
    variantTitle: node.title ?? "",
    displayName: node.displayName ?? product.title,
    sku: node.sku && node.sku.trim() !== "" ? node.sku : null,
    productId: product.id,
    productTitle: product.title,
    productHandle: product.handle,
    productStatus: product.status,
    quantity: node.inventoryQuantity ?? 0,
    locations,
  };
}
