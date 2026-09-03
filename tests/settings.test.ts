import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  isValidEmail,
  parseRecipients,
  validateSettings,
  type SettingsInput,
} from "../app/models/settings.server";

const VALID: SettingsInput = {
  enabled: true,
  threshold: 10,
  recipients: ["owner@example.com"],
  sendHour: 8,
  sendMinute: 0,
  timezone: "Asia/Kolkata",
  includeUntracked: false,
  onlyActiveProducts: true,
  skipWhenEmpty: true,
};

describe("parseRecipients", () => {
  it("splits on commas, semicolons and newlines and trims", () => {
    assert.deepEqual(parseRecipients("a@x.com, b@x.com;\n c@x.com "), [
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("returns an empty list for blank input", () => {
    assert.deepEqual(parseRecipients("   "), []);
    assert.deepEqual(parseRecipients(",, ;"), []);
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses and rejects malformed ones", () => {
    assert.equal(isValidEmail("owner@example.com"), true);
    assert.equal(isValidEmail("owner+alerts@sub.example.co.uk"), true);
    assert.equal(isValidEmail("owner@example"), false);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail(""), false);
  });
});

describe("validateSettings", () => {
  it("accepts a well-formed configuration", () => {
    assert.deepEqual(validateSettings(VALID), {});
  });

  it("allows a threshold of zero (out-of-stock only)", () => {
    assert.deepEqual(validateSettings({ ...VALID, threshold: 0 }), {});
  });

  it("rejects a negative or non-numeric threshold", () => {
    assert.ok(validateSettings({ ...VALID, threshold: -1 }).threshold);
    assert.ok(validateSettings({ ...VALID, threshold: Number.NaN }).threshold);
  });

  it("rejects an hour outside 0-23 and a minute outside 0-59", () => {
    assert.ok(validateSettings({ ...VALID, sendHour: 24 }).sendHour);
    assert.ok(validateSettings({ ...VALID, sendMinute: 60 }).sendMinute);
  });

  it("rejects an unknown timezone", () => {
    assert.ok(validateSettings({ ...VALID, timezone: "Mars/Olympus" }).timezone);
  });

  it("requires a recipient while alerts are enabled", () => {
    assert.ok(validateSettings({ ...VALID, recipients: [] }).recipients);
  });

  it("allows an empty recipient list once alerts are turned off", () => {
    assert.deepEqual(validateSettings({ ...VALID, enabled: false, recipients: [] }), {});
  });

  it("names the invalid address", () => {
    const errors = validateSettings({ ...VALID, recipients: ["ok@x.com", "broken"] });
    assert.match(errors.recipients, /broken/);
  });

  it("caps the recipient list", () => {
    const many = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);
    assert.ok(validateSettings({ ...VALID, recipients: many }).recipients);
  });
});
