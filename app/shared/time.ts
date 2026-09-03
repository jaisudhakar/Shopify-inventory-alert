/**
 * Timezone helpers. The digest is scheduled in each shop's own local time, so
 * every comparison has to be made through `Intl` rather than the server clock.
 */

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** "YYYY-MM-DD" in the target timezone. */
  dateKey: string;
  /** Minutes elapsed since local midnight. */
  minutesOfDay: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getLocalParts(date: Date, timeZone: string): LocalParts {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    // h23 keeps midnight as 00 instead of the 24 that hour12:false can yield.
    hourCycle: "h23",
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const hour = pick("hour");
  const minute = pick("minute");

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutesOfDay: hour * 60 + minute,
  };
}

export function formatInTimeZone(date: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** "8:00 AM" style label for a stored hour/minute pair. */
export function formatSendTime(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * When the next digest is due, as a UTC instant. Returns today's slot if it has
 * not passed yet in the shop's timezone, otherwise tomorrow's.
 */
export function nextSendAt(
  now: Date,
  timeZone: string,
  sendHour: number,
  sendMinute: number,
): Date {
  const local = getLocalParts(now, timeZone);
  const target = sendHour * 60 + sendMinute;
  const daysAhead = local.minutesOfDay < target ? 0 : 1;
  const deltaMinutes = target - local.minutesOfDay + daysAhead * 24 * 60;
  return new Date(now.getTime() + deltaMinutes * 60_000);
}
