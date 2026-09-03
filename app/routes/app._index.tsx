import { useEffect, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link as RemixLink, useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  DataTable,
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { ensureSettingsForShop, parseRecipients } from "../models/settings.server";
import { runInventoryAlert } from "../services/alerts.server";
import { adminProductUrl, type LowStockItem } from "../shared/inventory";
import { fetchLowStockItems } from "../services/inventory.server";
import { isMailConfigured, resolveProvider } from "../services/mailer.server";
import { formatSendTime, nextSendAt, formatInTimeZone } from "../shared/time";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await ensureSettingsForShop(session.shop);

  let items: LowStockItem[] = [];
  let truncated = false;
  let loadError: string | null = null;

  try {
    const result = await fetchLowStockItems(admin, {
      threshold: settings.threshold,
      includeUntracked: settings.includeUntracked,
      onlyActiveProducts: settings.onlyActiveProducts,
    });
    items = result.items;
    truncated = result.truncated;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  const now = new Date();

  return {
    shop: session.shop,
    threshold: settings.threshold,
    enabled: settings.enabled,
    recipients: parseRecipients(settings.recipients),
    timezone: settings.timezone,
    sendTimeLabel: formatSendTime(settings.sendHour, settings.sendMinute),
    nextSendLabel: formatInTimeZone(
      nextSendAt(now, settings.timezone, settings.sendHour, settings.sendMinute),
      settings.timezone,
    ),
    lastRunLabel: settings.lastRunAt
      ? formatInTimeZone(settings.lastRunAt, settings.timezone)
      : null,
    items,
    truncated,
    loadError,
    mailConfigured: isMailConfigured(),
    mailProvider: resolveProvider(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const result = await runInventoryAlert({
    shop: session.shop,
    trigger: "manual",
    force: true,
  });

  return {
    status: result.status,
    message: result.message,
    itemCount: result.itemCount,
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isSending = fetcher.state !== "idle";
  const result = fetcher.data;

  useEffect(() => {
    if (result && fetcher.state === "idle") {
      shopify.toast.show(result.message, { isError: result.status === "failed" });
    }
  }, [result, fetcher.state, shopify]);

  const outOfStock = useMemo(
    () => data.items.filter((item) => item.quantity <= 0).length,
    [data.items],
  );

  const rows = data.items.map((item) => [
    <Link
      key={item.variantId}
      url={adminProductUrl(data.shop, item.productId)}
      target="_blank"
      removeUnderline
    >
      {item.productTitle}
    </Link>,
    item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : "—",
    item.sku ?? "—",
    <Badge
      key={`${item.variantId}-qty`}
      tone={item.quantity <= 0 ? "critical" : item.quantity <= 3 ? "warning" : "attention"}
    >
      {String(item.quantity)}
    </Badge>,
    item.locations.length > 1
      ? item.locations.map((l) => `${l.name}: ${l.quantity}`).join(" · ")
      : (item.locations[0]?.name ?? "—"),
  ]);

  return (
    <Page>
      <TitleBar title="Inventory alerts" />
      <BlockStack gap="500">
        {!data.enabled && (
          <Banner tone="warning" title="Daily alerts are turned off">
            <p>
              Nobody will receive the morning digest until you turn alerts back on in{" "}
              <RemixLink to="/app/settings">Alert settings</RemixLink>.
            </p>
          </Banner>
        )}

        {data.enabled && data.recipients.length === 0 && (
          <Banner tone="critical" title="No recipients configured">
            <p>
              Add at least one email address in{" "}
              <RemixLink to="/app/settings">Alert settings</RemixLink> so the digest has
              somewhere to go.
            </p>
          </Banner>
        )}

        {!data.mailConfigured && (
          <Banner tone="warning" title="No email provider configured">
            <p>
              Emails are being written to the server log instead of sent. Set{" "}
              <code>SMTP_HOST</code>, <code>RESEND_API_KEY</code>, or{" "}
              <code>SENDGRID_API_KEY</code> in your environment to deliver them for real.
            </p>
          </Banner>
        )}

        {data.loadError && (
          <Banner tone="critical" title="Could not read inventory from Shopify">
            <p>{data.loadError}</p>
          </Banner>
        )}

        {data.truncated && (
          <Banner tone="warning" title="Report was truncated">
            <p>
              This store has more low-stock variants than one report can hold. Lower your
              threshold to narrow the list.
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    At or below {data.threshold}
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {data.items.length}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Out of stock
                  </Text>
                  <Text as="p" variant="heading2xl" tone={outOfStock > 0 ? "critical" : undefined}>
                    {outOfStock}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Next digest
                  </Text>
                  <Text as="p" variant="headingMd">
                    {data.enabled ? data.nextSendLabel : "Paused"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {data.sendTimeLabel} · {data.timezone}
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Low stock right now
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {data.recipients.length > 0
                        ? `Digest goes to ${data.recipients.join(", ")}`
                        : "No recipients configured"}
                      {data.lastRunLabel ? ` · Last run ${data.lastRunLabel}` : ""}
                    </Text>
                  </BlockStack>
                  <fetcher.Form method="post">
                    <Button submit variant="primary" loading={isSending}>
                      Send digest now
                    </Button>
                  </fetcher.Form>
                </InlineStack>

                {data.items.length === 0 ? (
                  <EmptyState
                    heading="Everything is above your threshold"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      No product is at or below {data.threshold} units. You will get an email
                      the morning that changes.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "text"]}
                    headings={["Product", "Variant", "SKU", "Available", "Locations"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
