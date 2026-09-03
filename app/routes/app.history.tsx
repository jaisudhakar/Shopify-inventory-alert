import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  DataTable,
  EmptyState,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { ensureSettingsForShop } from "../models/settings.server";
import { formatInTimeZone } from "../shared/time";

const PAGE_SIZE = 50;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await ensureSettingsForShop(session.shop);

  const runs = await prisma.alertRun.findMany({
    where: { shop: session.shop },
    orderBy: { runAt: "desc" },
    take: PAGE_SIZE,
  });

  return {
    runs: runs.map((run) => ({
      id: run.id,
      runAtLabel: formatInTimeZone(run.runAt, settings.timezone),
      trigger: run.trigger,
      status: run.status,
      threshold: run.threshold,
      itemCount: run.itemCount,
      recipients: run.recipients,
      message: run.message ?? "",
    })),
    timezone: settings.timezone,
  };
};

const STATUS_TONE = {
  sent: "success",
  skipped: "info",
  failed: "critical",
} as const;

const TRIGGER_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  manual: "Sent manually",
  cron: "External cron",
  test: "Test",
};

export default function HistoryPage() {
  const { runs, timezone } = useLoaderData<typeof loader>();

  const rows = runs.map((run) => [
    run.runAtLabel,
    TRIGGER_LABEL[run.trigger] ?? run.trigger,
    <Badge
      key={`${run.id}-status`}
      tone={STATUS_TONE[run.status as keyof typeof STATUS_TONE] ?? "info"}
    >
      {run.status}
    </Badge>,
    String(run.threshold),
    String(run.itemCount),
    run.recipients || "—",
    run.message,
  ]);

  return (
    <Page>
      <TitleBar title="History" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Recent alert runs
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                The last {PAGE_SIZE} attempts, in {timezone}.
              </Text>
              {runs.length === 0 ? (
                <EmptyState
                  heading="No alert runs yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Once the first digest is sent — or you use “Send digest now” — every
                    attempt is recorded here.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "numeric",
                    "numeric",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "When",
                    "Trigger",
                    "Status",
                    "Threshold",
                    "Items",
                    "Recipients",
                    "Details",
                  ]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
