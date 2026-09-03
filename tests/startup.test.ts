import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { isLocalUrl } from "../app/services/startup.server";

describe("isLocalUrl", () => {
  it("flags addresses Shopify cannot reach", () => {
    for (const url of [
      "http://localhost:3000",
      "https://localhost",
      "http://127.0.0.1:3000",
      "http://0.0.0.0:8080",
      "http://[::1]:3000",
      "http://LOCALHOST:3000",
    ]) {
      assert.equal(isLocalUrl(url), true, `${url} should be local`);
    }
  });

  it("accepts public URLs, including CLI tunnels", () => {
    for (const url of [
      "https://quiet-forest-1234.trycloudflare.com",
      "https://my-app.fly.dev",
      "https://inventory.example.com",
      "https://abc123.ngrok-free.app",
    ]) {
      assert.equal(isLocalUrl(url), false, `${url} should be public`);
    }
  });

  it("does not mistake a public host that merely contains 'localhost'", () => {
    assert.equal(isLocalUrl("https://localhost.example.com"), false);
    assert.equal(isLocalUrl("https://mylocalhost.dev"), false);
  });
});
