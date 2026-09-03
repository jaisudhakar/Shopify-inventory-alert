import { getLocalParts } from "./time";

/**
 * The subset of a shop's settings that decides whether its digest is due.
 * Kept separate from the Prisma model so the rule can be tested on its own.
 */
export interface ScheduleState {
  enabled: boolean;
  timezone: string;
  sendHour: number;
  sendMinute: number;
  /** Local calendar date ("YYYY-MM-DD") of the last scheduled send. */
  lastSentLocalDate: string | null;
}

/**
 * How long after the configured time we will still send a missed digest.
 *
 * A process that was asleep, redeployed, or throttled past the slot should
 * still get the morning email out. But a "morning" digest arriving at 9pm is
 * worse than none, so the catch-up window closes after six hours.
 */
export const CATCH_UP_WINDOW_MINUTES = 6 * 60;

export function isDue(state: ScheduleState, now: Date): boolean {
  if (!state.enabled) return false;

  const local = getLocalParts(now, state.timezone);
  const target = state.sendHour * 60 + state.sendMinute;

  // Not yet time today.
  if (local.minutesOfDay < target) return false;
  // Too long past the slot to still count as the morning digest.
  if (local.minutesOfDay - target > CATCH_UP_WINDOW_MINUTES) return false;
  // Already sent for this local date — this is what makes the scheduler
  // idempotent across restarts and overlapping ticks.
  return state.lastSentLocalDate !== local.dateKey;
}
