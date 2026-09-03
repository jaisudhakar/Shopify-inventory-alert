/**
 * Startup check for the credentials the app cannot run without.
 *
 * Without this, a missing value surfaces as a stack trace from deep inside the
 * Shopify library, which does not tell you where the value was supposed to come
 * from. Imported for its side effect at the top of `shopify.server.ts`, so it
 * runs before the API client is constructed.
 */

interface RequiredVar {
  name: string;
  hint: string;
}

const REQUIRED: RequiredVar[] = [
  { name: "SHOPIFY_API_KEY", hint: "Partner Dashboard → your app → Configuration → Client ID" },
  { name: "SHOPIFY_API_SECRET", hint: "Partner Dashboard → your app → Configuration → Client secret" },
  { name: "SHOPIFY_APP_URL", hint: "the public URL the app is served from, e.g. http://localhost:3000" },
];

export function assertRequiredEnv(): void {
  const missing = REQUIRED.filter(({ name }) => !process.env[name]?.trim());
  if (missing.length === 0) return;

  const lines = [
    "",
    "Cannot start: required environment variables are missing.",
    "",
    ...missing.map(({ name, hint }) => `  ${name}  — ${hint}`),
    "",
    "`npm start` reads these from a .env file in the project root.",
    "(`npm run dev` does not need it — the Shopify CLI injects them for you.)",
    "",
    "Fix:",
    "  1. cp .env.example .env",
    "  2. fill in the values above",
    "  3. npm start",
    "",
  ];

  throw new Error(lines.join("\n"));
}
