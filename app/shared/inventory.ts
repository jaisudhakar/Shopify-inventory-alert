/**
 * Shapes and pure helpers shared by the server services and the React routes.
 *
 * This module deliberately has no `.server` suffix: the dashboard renders
 * `LowStockItem` rows and links to them, so the type and the URL builder have
 * to be safe to include in the client bundle.
 */

/** A variant at or below the merchant's threshold. */
export interface LowStockItem {
  variantId: string;
  variantTitle: string;
  displayName: string;
  sku: string | null;
  productId: string;
  productTitle: string;
  productHandle: string;
  productStatus: string;
  /** Available quantity aggregated across every location. */
  quantity: number;
  locations: Array<{ name: string; quantity: number }>;
}

/** `gid://shopify/Product/123` -> `123`, for building admin deep links. */
export function numericIdFromGid(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

export function adminProductUrl(shop: string, productGid: string): string {
  return `https://${shop}/admin/products/${numericIdFromGid(productGid)}`;
}
