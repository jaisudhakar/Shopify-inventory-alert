import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  provider: string;
  messageId?: string;
}

export type MailProvider = "smtp" | "resend" | "sendgrid" | "console";

/**
 * Resolves the provider from the environment. `EMAIL_PROVIDER` wins; otherwise
 * we infer it from whichever credentials are present, and fall back to
 * `console` so a fresh checkout runs without any mail configuration at all.
 */
export function resolveProvider(): MailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (
    explicit === "smtp" ||
    explicit === "resend" ||
    explicit === "sendgrid" ||
    explicit === "console"
  ) {
    return explicit;
  }
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SENDGRID_API_KEY) return "sendgrid";
  if (process.env.SMTP_HOST) return "smtp";
  return "console";
}

export function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "Inventory Alerts <inventory-alerts@example.com>"
  );
}

/** True when the resolved provider has everything it needs to actually send. */
export function isMailConfigured(): boolean {
  switch (resolveProvider()) {
    case "smtp":
      return Boolean(process.env.SMTP_HOST);
    case "resend":
      return Boolean(process.env.RESEND_API_KEY);
    case "sendgrid":
      return Boolean(process.env.SENDGRID_API_KEY);
    case "console":
      return false;
  }
}

let transporter: Transporter | undefined;

function getSmtpTransport(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP_HOST is not set. Configure SMTP or pick another EMAIL_PROVIDER.");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  // Port 465 is implicit TLS; 587/25 start plaintext and upgrade with STARTTLS.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });

  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (message.to.length === 0) {
    throw new Error("No recipients configured for this alert.");
  }

  const provider = resolveProvider();
  const from = getFromAddress();

  switch (provider) {
    case "smtp": {
      const info = await getSmtpTransport().sendMail({
        from,
        to: message.to.join(", "),
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { provider, messageId: info.messageId };
    }

    case "resend": {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status}): ${body.message ?? "unknown error"}`);
      }
      return { provider, messageId: body.id };
    }

    case "sendgrid": {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: message.to.map((email) => ({ email })) }],
          from: parseFromAddress(from),
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`SendGrid rejected the email (${response.status}): ${detail}`);
      }
      return {
        provider,
        messageId: response.headers.get("x-message-id") ?? undefined,
      };
    }

    case "console": {
      console.info(
        [
          "[inventory-alert] No email provider configured — printing instead of sending.",
          `  from:    ${from}`,
          `  to:      ${message.to.join(", ")}`,
          `  subject: ${message.subject}`,
          "",
          message.text,
        ].join("\n"),
      );
      return { provider };
    }
  }
}

/** Turns `Name <a@b.com>` into SendGrid's `{ email, name }` shape. */
function parseFromAddress(value: string): { email: string; name?: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { email: match[2].trim(), name: match[1].replace(/^"|"$/g, "").trim() || undefined };
  }
  return { email: value.trim() };
}

/** Used by the settings page to verify SMTP credentials without sending. */
export async function verifyTransport(): Promise<void> {
  if (resolveProvider() !== "smtp") return;
  await getSmtpTransport().verify();
}
