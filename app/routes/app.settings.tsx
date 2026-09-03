import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Card,
  Checkbox,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import {
  ensureSettingsForShop,
  parseRecipients,
  saveSettings,
  validateSettings,
} from "../models/settings.server";
import { isMailConfigured, resolveProvider } from "../services/mailer.server";

/** A short, common list plus whatever the shop is already using. */
const BASE_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await ensureSettingsForShop(session.shop);

  const timezones = Array.from(new Set([settings.timezone, ...BASE_TIMEZONES])).sort();

  return {
    settings: {
      enabled: settings.enabled,
      threshold: settings.threshold,
      recipients: settings.recipients,
      sendHour: settings.sendHour,
      sendMinute: settings.sendMinute,
      timezone: settings.timezone,
      includeUntracked: settings.includeUntracked,
      onlyActiveProducts: settings.onlyActiveProducts,
      skipWhenEmpty: settings.skipWhenEmpty,
    },
    timezones,
    mailConfigured: isMailConfigured(),
    mailProvider: resolveProvider(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const input = {
    enabled: form.get("enabled") === "true",
    threshold: Number.parseInt(String(form.get("threshold") ?? ""), 10),
    recipients: parseRecipients(String(form.get("recipients") ?? "")),
    sendHour: Number.parseInt(String(form.get("sendHour") ?? ""), 10),
    sendMinute: Number.parseInt(String(form.get("sendMinute") ?? ""), 10),
    timezone: String(form.get("timezone") ?? "UTC"),
    includeUntracked: form.get("includeUntracked") === "true",
    onlyActiveProducts: form.get("onlyActiveProducts") === "true",
    skipWhenEmpty: form.get("skipWhenEmpty") === "true",
  };

  const errors = validateSettings(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false as const, errors };
  }

  await saveSettings(session.shop, input);
  return { ok: true as const, errors: {} as Record<string, string> };
};

export default function SettingsPage() {
  const { settings, timezones, mailConfigured, mailProvider } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [form, setForm] = useState(settings);
  const [dirty, setDirty] = useState(false);

  const errors = fetcher.data?.errors ?? {};
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setDirty(false);
      shopify.saveBar.hide("settings-save-bar");
      shopify.toast.show("Alert settings saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  function update<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (!dirty) {
      setDirty(true);
      shopify.saveBar.show("settings-save-bar");
    }
  }

  function submit() {
    fetcher.submit(
      {
        enabled: String(form.enabled),
        threshold: String(form.threshold),
        recipients: form.recipients,
        sendHour: String(form.sendHour),
        sendMinute: String(form.sendMinute),
        timezone: form.timezone,
        includeUntracked: String(form.includeUntracked),
        onlyActiveProducts: String(form.onlyActiveProducts),
        skipWhenEmpty: String(form.skipWhenEmpty),
      },
      { method: "post" },
    );
  }

  function discard() {
    setForm(settings);
    setDirty(false);
    shopify.saveBar.hide("settings-save-bar");
  }

  const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
    label: `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? "AM" : "PM"}`,
    value: String(hour),
  }));
  const minuteOptions = [0, 15, 30, 45].map((minute) => ({
    label: `:${String(minute).padStart(2, "0")}`,
    value: String(minute),
  }));

  return (
    <Page>
      <TitleBar title="Alert settings" />
      <SaveBar id="settings-save-bar">
        <button variant="primary" onClick={submit} disabled={isSaving} />
        <button onClick={discard} disabled={isSaving} />
      </SaveBar>

      <Layout>
        <Layout.AnnotatedSection
          title="Daily digest"
          description="One email each morning listing every product at or below your threshold. Nothing is sent while this is off."
        >
          <Card>
            <FormLayout>
              <Checkbox
                label="Send the daily inventory digest"
                checked={form.enabled}
                onChange={(value) => update("enabled", value)}
              />
              <TextField
                label="Low stock threshold"
                type="number"
                min={0}
                autoComplete="off"
                value={String(form.threshold)}
                onChange={(value) => update("threshold", Number.parseInt(value || "0", 10))}
                error={errors.threshold}
                helpText="Alert when a variant's available quantity across all locations is at or below this number."
                suffix="units"
              />
              <TextField
                label="Send to"
                multiline={3}
                autoComplete="off"
                value={form.recipients}
                onChange={(value) => update("recipients", value)}
                error={errors.recipients}
                helpText="Comma-separated. Seeded with the store owner's email at install; add warehouse or buying-team addresses here."
                placeholder="owner@store.com, purchasing@store.com"
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Delivery time"
          description="The digest is sent at this local time in the store's own timezone, so it lands first thing in the morning wherever your team is."
        >
          <Card>
            <FormLayout>
              <InlineStack gap="300" wrap={false}>
                <Select
                  label="Hour"
                  options={hourOptions}
                  value={String(form.sendHour)}
                  onChange={(value) => update("sendHour", Number.parseInt(value, 10))}
                  error={errors.sendHour}
                />
                <Select
                  label="Minute"
                  options={minuteOptions}
                  value={String(form.sendMinute)}
                  onChange={(value) => update("sendMinute", Number.parseInt(value, 10))}
                  error={errors.sendMinute}
                />
              </InlineStack>
              <Select
                label="Timezone"
                options={timezones.map((zone) => ({ label: zone, value: zone }))}
                value={form.timezone}
                onChange={(value) => update("timezone", value)}
                error={errors.timezone}
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="What to include"
          description="Trim the digest down to the products you actually restock."
        >
          <Card>
            <BlockStack gap="300">
              <Checkbox
                label="Only active products"
                checked={form.onlyActiveProducts}
                onChange={(value) => update("onlyActiveProducts", value)}
                helpText="Skip draft and archived products."
              />
              <Checkbox
                label="Include products Shopify doesn't track"
                checked={form.includeUntracked}
                onChange={(value) => update("includeUntracked", value)}
                helpText="Untracked variants always report 0, so leaving this off keeps the digest meaningful."
              />
              <Checkbox
                label="Skip the email when nothing is low"
                checked={form.skipWhenEmpty}
                onChange={(value) => update("skipWhenEmpty", value)}
                helpText="Turn this off to receive a daily all-clear confirmation instead."
              />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Email delivery"
          description="Configured by the app operator through environment variables, not per store."
        >
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Current provider: <b>{mailProvider}</b>
              </Text>
              {mailConfigured ? (
                <Banner tone="success">
                  <p>Emails are being delivered through {mailProvider}.</p>
                </Banner>
              ) : (
                <Banner tone="warning" title="Emails are not being delivered">
                  <p>
                    Set <code>SMTP_HOST</code>, <code>RESEND_API_KEY</code>, or{" "}
                    <code>SENDGRID_API_KEY</code> (plus <code>EMAIL_FROM</code>) in the
                    app's environment. Until then the digest is written to the server log.
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
