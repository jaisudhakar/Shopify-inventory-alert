import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

import { assertRequiredEnv } from "../app/env.server";

const REQUIRED = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"];

function setAll() {
  vi.stubEnv("SHOPIFY_API_KEY", "key");
  vi.stubEnv("SHOPIFY_API_SECRET", "secret");
  vi.stubEnv("SHOPIFY_APP_URL", "http://localhost:3000");
}

beforeEach(setAll);
afterEach(() => vi.unstubAllEnvs());

describe("assertRequiredEnv", () => {
  it("passes when every credential is present", () => {
    assert.doesNotThrow(() => assertRequiredEnv());
  });

  for (const name of REQUIRED) {
    it(`names ${name} when it is missing`, () => {
      vi.stubEnv(name, "");
      assert.throws(() => assertRequiredEnv(), new RegExp(name));
    });
  }

  it("treats a whitespace-only value as missing", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", "   ");
    assert.throws(() => assertRequiredEnv(), /SHOPIFY_API_SECRET/);
  });

  it("explains where the values come from instead of only naming them", () => {
    vi.stubEnv("SHOPIFY_API_KEY", "");
    try {
      assertRequiredEnv();
      assert.fail("expected assertRequiredEnv to throw");
    } catch (error) {
      const message = (error as Error).message;
      assert.match(message, /cp \.env\.example \.env/);
      assert.match(message, /npm run dev.*Shopify CLI injects/s);
    }
  });

  it("lists every missing variable at once, not just the first", () => {
    vi.stubEnv("SHOPIFY_API_KEY", "");
    vi.stubEnv("SHOPIFY_API_SECRET", "");
    try {
      assertRequiredEnv();
      assert.fail("expected assertRequiredEnv to throw");
    } catch (error) {
      const message = (error as Error).message;
      assert.match(message, /SHOPIFY_API_KEY/);
      assert.match(message, /SHOPIFY_API_SECRET/);
    }
  });
});
