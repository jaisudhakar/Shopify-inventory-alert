import cron, { type ScheduledTask } from "node-cron";

import { runDueAlerts } from "./alerts.server";

declare global {
  // eslint-disable-next-line no-var
  var inventoryAlertScheduler: ScheduledTask | undefined;
}

/**
 * How often we look for shops whose send time has arrived. Every shop keeps its
 * own timezone and send time, so a single frequent tick is simpler — and more
 * correct across DST — than one cron entry per shop.
 */
const TICK_EXPRESSION = process.env.SCHEDULER_CRON ?? "*/5 * * * *";

let running = false;

async function tick(): Promise<void> {
  // A slow catalog scan must not overlap with the next tick.
  if (running) {
    console.warn("[inventory-alert] previous scheduler tick is still running; skipping this one");
    return;
  }
  running = true;
  try {
    const results = await runDueAlerts(new Date(), "scheduled");
    if (results.length > 0) {
      console.info(`[inventory-alert] scheduler processed ${results.length} shop(s)`);
    }
  } catch (error) {
    console.error("[inventory-alert] scheduler tick failed:", error);
  } finally {
    running = false;
  }
}

/**
 * Starts the in-process scheduler. Safe to call more than once — Vite reloads
 * the server module graph in development, and a second timer would double-send.
 *
 * Set ENABLE_SCHEDULER=false when the host provides its own cron (see
 * `/api/cron/daily`) or when running more than one web instance, so only one
 * process owns the schedule.
 */
export function startScheduler(): void {
  if (process.env.ENABLE_SCHEDULER === "false") {
    console.info("[inventory-alert] in-process scheduler disabled (ENABLE_SCHEDULER=false)");
    return;
  }
  if (global.inventoryAlertScheduler) return;

  if (!cron.validate(TICK_EXPRESSION)) {
    console.error(`[inventory-alert] invalid SCHEDULER_CRON "${TICK_EXPRESSION}"; scheduler not started`);
    return;
  }

  global.inventoryAlertScheduler = cron.schedule(TICK_EXPRESSION, tick);
  console.info(`[inventory-alert] scheduler started (${TICK_EXPRESSION}, UTC ticks)`);
}

export function stopScheduler(): void {
  global.inventoryAlertScheduler?.stop();
  global.inventoryAlertScheduler = undefined;
}
