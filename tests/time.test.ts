import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  formatSendTime,
  getLocalParts,
  isValidTimeZone,
  nextSendAt,
} from "../app/shared/time";

describe("getLocalParts", () => {
  it("converts a UTC instant into the shop's local wall clock", () => {
    const parts = getLocalParts(new Date("2026-09-03T02:30:00Z"), "Asia/Kolkata");
    assert.equal(parts.dateKey, "2026-09-03");
    assert.equal(parts.hour, 8);
    assert.equal(parts.minute, 0);
    assert.equal(parts.minutesOfDay, 480);
  });

  it("rolls the local date back across the dateline", () => {
    // 02:30 UTC on the 3rd is still the evening of the 2nd in Los Angeles.
    const parts = getLocalParts(new Date("2026-09-03T02:30:00Z"), "America/Los_Angeles");
    assert.equal(parts.dateKey, "2026-09-02");
    assert.equal(parts.hour, 19);
  });

  it("reports midnight as hour 0, not 24", () => {
    const parts = getLocalParts(new Date("2026-09-03T00:00:00Z"), "UTC");
    assert.equal(parts.hour, 0);
    assert.equal(parts.minutesOfDay, 0);
  });

  it("follows daylight saving time rather than a fixed offset", () => {
    const summer = getLocalParts(new Date("2026-07-01T12:00:00Z"), "America/New_York");
    const winter = getLocalParts(new Date("2026-01-01T12:00:00Z"), "America/New_York");
    assert.equal(summer.hour, 8); // UTC-4
    assert.equal(winter.hour, 7); // UTC-5
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    const parts = getLocalParts(new Date("2026-09-03T09:15:00Z"), "Not/AZone");
    assert.equal(parts.hour, 9);
    assert.equal(parts.minute, 15);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    assert.equal(isValidTimeZone("Europe/London"), true);
    assert.equal(isValidTimeZone("Mars/Olympus"), false);
  });
});

describe("nextSendAt", () => {
  it("returns today's slot when it has not passed yet", () => {
    // 05:00 UTC = 05:00 London (BST is +1, so 06:00 local) — use UTC for clarity.
    const now = new Date("2026-09-03T05:00:00Z");
    const next = nextSendAt(now, "UTC", 8, 0);
    assert.equal(next.toISOString(), "2026-09-03T08:00:00.000Z");
  });

  it("rolls to tomorrow once the slot has passed", () => {
    const now = new Date("2026-09-03T09:00:00Z");
    const next = nextSendAt(now, "UTC", 8, 0);
    assert.equal(next.toISOString(), "2026-09-04T08:00:00.000Z");
  });

  it("respects the shop's timezone", () => {
    // 01:00 UTC is 06:30 in Kolkata, so 08:00 local is still ahead today.
    const now = new Date("2026-09-03T01:00:00Z");
    const next = nextSendAt(now, "Asia/Kolkata", 8, 0);
    assert.equal(next.toISOString(), "2026-09-03T02:30:00.000Z");
  });
});

describe("formatSendTime", () => {
  it("renders a 12-hour label", () => {
    assert.equal(formatSendTime(8, 0), "8:00 AM");
    assert.equal(formatSendTime(0, 30), "12:30 AM");
    assert.equal(formatSendTime(12, 0), "12:00 PM");
    assert.equal(formatSendTime(17, 45), "5:45 PM");
  });
});
