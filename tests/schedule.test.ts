import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { CATCH_UP_WINDOW_MINUTES, isDue, type ScheduleState } from "../app/shared/schedule";

const BASE: ScheduleState = {
  enabled: true,
  timezone: "UTC",
  sendHour: 8,
  sendMinute: 0,
  lastSentLocalDate: null,
};

const at = (iso: string) => new Date(iso);

describe("isDue", () => {
  it("is not due before the configured time", () => {
    assert.equal(isDue(BASE, at("2026-09-03T07:59:00Z")), false);
  });

  it("is due at the configured time", () => {
    assert.equal(isDue(BASE, at("2026-09-03T08:00:00Z")), true);
  });

  it("is due shortly after the configured time", () => {
    assert.equal(isDue(BASE, at("2026-09-03T08:04:00Z")), true);
  });

  it("never sends while alerts are disabled", () => {
    assert.equal(isDue({ ...BASE, enabled: false }, at("2026-09-03T08:00:00Z")), false);
  });

  it("does not send twice on the same local day", () => {
    const state = { ...BASE, lastSentLocalDate: "2026-09-03" };
    assert.equal(isDue(state, at("2026-09-03T08:00:00Z")), false);
    assert.equal(isDue(state, at("2026-09-03T08:30:00Z")), false);
  });

  it("sends again the next morning", () => {
    const state = { ...BASE, lastSentLocalDate: "2026-09-03" };
    assert.equal(isDue(state, at("2026-09-04T08:00:00Z")), true);
  });

  it("catches up on a missed slot within the catch-up window", () => {
    // Server was down at 08:00 and came back at 11:00.
    assert.equal(isDue(BASE, at("2026-09-03T11:00:00Z")), true);
  });

  it("gives up once the catch-up window has closed", () => {
    // 6h1m after the slot: a 'morning' digest at 14:01 helps nobody.
    assert.equal(isDue(BASE, at("2026-09-03T14:01:00Z")), false);
    assert.equal(CATCH_UP_WINDOW_MINUTES, 360);
  });

  it("uses the shop's timezone, not the server's", () => {
    const kolkata = { ...BASE, timezone: "Asia/Kolkata" };
    // 08:00 in Kolkata is 02:30 UTC.
    assert.equal(isDue(kolkata, at("2026-09-03T02:29:00Z")), false);
    assert.equal(isDue(kolkata, at("2026-09-03T02:30:00Z")), true);
    // 08:00 UTC is already 13:30 in Kolkata — still inside the catch-up window.
    assert.equal(isDue(kolkata, at("2026-09-03T08:00:00Z")), true);
  });

  it("tracks the shop's local date, so a UTC day boundary does not double-send", () => {
    // Los Angeles is UTC-7 in September, so 08:00 local on the 3rd is 15:00 UTC.
    const la = { ...BASE, timezone: "America/Los_Angeles", lastSentLocalDate: "2026-09-03" };
    // Past UTC midnight into the 4th, but still the evening of the 3rd in LA.
    assert.equal(isDue(la, at("2026-09-04T02:00:00Z")), false);
    // 08:00 on the 4th in LA.
    assert.equal(isDue(la, at("2026-09-04T15:00:00Z")), true);
  });

  it("still fires at the right local hour across a DST change", () => {
    const ny = { ...BASE, timezone: "America/New_York" };
    // Summer (EDT, UTC-4): 08:00 local = 12:00 UTC.
    assert.equal(isDue(ny, at("2026-07-01T11:59:00Z")), false);
    assert.equal(isDue(ny, at("2026-07-01T12:00:00Z")), true);
    // Winter (EST, UTC-5): 08:00 local = 13:00 UTC.
    assert.equal(isDue(ny, at("2026-01-15T12:59:00Z")), false);
    assert.equal(isDue(ny, at("2026-01-15T13:00:00Z")), true);
  });

  it("honours a non-zero send minute", () => {
    const state = { ...BASE, sendHour: 6, sendMinute: 30 };
    assert.equal(isDue(state, at("2026-09-03T06:29:00Z")), false);
    assert.equal(isDue(state, at("2026-09-03T06:30:00Z")), true);
  });
});
