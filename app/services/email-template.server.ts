import { adminProductUrl, type LowStockItem } from "../shared/inventory";

export interface DigestInput {
  shop: string;
  shopName: string;
  threshold: number;
  items: LowStockItem[];
  /** Human-readable date of the digest in the shop's timezone. */
  dateLabel: string;
  truncated: boolean;
  settingsUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quantityColor(quantity: number): string {
  if (quantity <= 0) return "#b42318";
  if (quantity <= 3) return "#b54708";
  return "#175cd3";
}

export function renderDigestEmail(input: DigestInput): RenderedEmail {
  const { shop, shopName, threshold, items, dateLabel, truncated, settingsUrl } = input;

  const outOfStock = items.filter((item) => item.quantity <= 0).length;
  const subject =
    items.length === 0
      ? `${shopName}: inventory is healthy — nothing at or below ${threshold}`
      : `${shopName}: ${items.length} product${items.length === 1 ? "" : "s"} at or below ${threshold} in stock`;

  const rows = items
    .map((item) => {
      const locationLabel =
        item.locations.length > 1
          ? item.locations
              .map((location) => `${escapeHtml(location.name)}: ${location.quantity}`)
              .join(" &middot; ")
          : escapeHtml(item.locations[0]?.name ?? "—");

      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e4e5e7;">
            <a href="${escapeHtml(adminProductUrl(shop, item.productId))}" style="color:#1f2933;font-weight:600;text-decoration:none;">${escapeHtml(item.productTitle)}</a>
            ${item.variantTitle && item.variantTitle !== "Default Title" ? `<div style="color:#6d7175;font-size:13px;margin-top:2px;">${escapeHtml(item.variantTitle)}</div>` : ""}
            ${item.sku ? `<div style="color:#8c9196;font-size:12px;margin-top:2px;">SKU ${escapeHtml(item.sku)}</div>` : ""}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e4e5e7;text-align:right;white-space:nowrap;">
            <span style="color:${quantityColor(item.quantity)};font-weight:700;font-size:16px;">${item.quantity}</span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e4e5e7;color:#6d7175;font-size:13px;">
            ${locationLabel}
          </td>
        </tr>`;
    })
    .join("");

  const emptyState = `
    <div style="padding:28px 16px;text-align:center;color:#6d7175;">
      <div style="font-size:32px;line-height:1;margin-bottom:8px;">&#10003;</div>
      <strong style="color:#1f2933;">Everything is above your threshold.</strong>
      <div style="margin-top:4px;font-size:14px;">No product is at or below ${threshold} units today.</div>
    </div>`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px 12px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e5e7;">
      <tr>
        <td style="padding:24px 16px 8px;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6d7175;">Daily inventory alert</div>
          <h1 style="margin:6px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(shopName)}</h1>
          <div style="color:#6d7175;font-size:14px;">${escapeHtml(dateLabel)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 16px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px;background:#f6f6f7;border-radius:8px;text-align:center;">
                <div style="font-size:24px;font-weight:700;">${items.length}</div>
                <div style="font-size:12px;color:#6d7175;">at or below ${threshold}</div>
              </td>
              <td style="width:12px;"></td>
              <td style="padding:12px;background:#f6f6f7;border-radius:8px;text-align:center;">
                <div style="font-size:24px;font-weight:700;color:${outOfStock > 0 ? "#b42318" : "#1f2933"};">${outOfStock}</div>
                <div style="font-size:12px;color:#6d7175;">out of stock</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 8px;">
          ${
            items.length === 0
              ? emptyState
              : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e4e5e7;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#fafbfb;">
                  <th align="left" style="padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6d7175;border-bottom:1px solid #e4e5e7;">Product</th>
                  <th align="right" style="padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6d7175;border-bottom:1px solid #e4e5e7;">Qty</th>
                  <th align="left" style="padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6d7175;border-bottom:1px solid #e4e5e7;">Locations</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
          }
          ${
            truncated
              ? `<p style="margin:12px 0 0;font-size:13px;color:#b54708;">Only the first ${items.length} low-stock variants are listed. Lower your threshold to narrow the report.</p>`
              : ""
          }
        </td>
      </tr>
      <tr>
        <td style="padding:16px;">
          <a href="${escapeHtml(`https://${shop}/admin/products`)}" style="display:inline-block;background:#1f2933;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Open products in Shopify</a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 24px;color:#8c9196;font-size:12px;line-height:1.6;border-top:1px solid #e4e5e7;padding-top:16px;">
          You receive this because inventory alerts are enabled for ${escapeHtml(shop)}.
          <a href="${escapeHtml(settingsUrl)}" style="color:#6d7175;">Change the threshold, recipients, or delivery time</a>.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `${shopName} — daily inventory alert`,
    dateLabel,
    "",
    items.length === 0
      ? `No product is at or below ${threshold} units today.`
      : `${items.length} product${items.length === 1 ? "" : "s"} at or below ${threshold} units (${outOfStock} out of stock):`,
    "",
    ...items.map((item) => {
      const name = item.variantTitle && item.variantTitle !== "Default Title"
        ? `${item.productTitle} — ${item.variantTitle}`
        : item.productTitle;
      const sku = item.sku ? ` [SKU ${item.sku}]` : "";
      return `  - ${name}${sku}: ${item.quantity} left`;
    }),
    "",
    truncated
      ? `Only the first ${items.length} low-stock variants are listed. Lower your threshold to narrow the report.`
      : "",
    `Products: https://${shop}/admin/products`,
    `Settings: ${settingsUrl}`,
  ].filter((line) => line !== undefined);

  return { subject, html, text: textLines.join("\n") };
}
