export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Range = { start: number; end: number };

export type SlotInput = {
  date: string;
  durationMin: number;
  stepMin: number;
  noticeMin: number;
  now: number;
  work: Range[];
  busy: Range[];
};

export function salonDate(ms: number): string {
  const local = new Date(ms + TASHKENT_OFFSET_MS);
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${local.getUTCFullYear()}-${month}-${day}`;
}

export function salonMidnight(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day) - TASHKENT_OFFSET_MS;
}

export function addSalonDays(isoDate: string, days: number): string {
  return salonDate(salonMidnight(isoDate) + days * DAY_MS);
}

export function weekdaySalon(isoDate: string): number {
  return new Date(salonMidnight(isoDate) + 12 * 60 * 60 * 1000).getUTCDay();
}

export function clockMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function clockRange(date: string, startMin: number, endMin: number): Range {
  const midnight = salonMidnight(date);
  return { start: midnight + startMin * 60_000, end: midnight + endMin * 60_000 };
}

export function formatClock(ms: number): string {
  const local = new Date(ms + TASHKENT_OFFSET_MS);
  const hours = String(local.getUTCHours()).padStart(2, "0");
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function dateInHorizon(date: string, today: string, horizonDays: number): boolean {
  return date >= today && date <= addSalonDays(today, horizonDays);
}

export function canChangeBooking(startsAtMs: number, nowMs: number, cutoffMin: number): boolean {
  return startsAtMs - nowMs >= cutoffMin * 60_000;
}

export function subtractRanges(windows: Range[], blocks: Range[]): Range[] {
  let current = windows.filter((window) => window.end > window.start);
  for (const block of blocks) {
    const next: Range[] = [];
    for (const window of current) {
      if (block.end <= window.start || block.start >= window.end) {
        next.push(window);
        continue;
      }
      if (block.start > window.start) {
        next.push({ start: window.start, end: Math.min(block.start, window.end) });
      }
      if (block.end < window.end) {
        next.push({ start: Math.max(block.end, window.start), end: window.end });
      }
    }
    current = next.filter((window) => window.end > window.start);
  }
  return current;
}

export function slotsForDay(input: SlotInput): string[] {
  const earliest = input.now + input.noticeMin * 60_000;
  const step = input.stepMin * 60_000;
  const duration = input.durationMin * 60_000;
  const midnight = salonMidnight(input.date);
  const times: string[] = [];

  for (const window of subtractRanges(input.work, input.busy)) {
    let cursor = window.start;
    const offset = (cursor - midnight) % step;
    if (offset !== 0) cursor += step - offset;
    for (let start = cursor; start + duration <= window.end; start += step) {
      if (start >= earliest) times.push(formatClock(start));
    }
  }

  return times;
}

export function mergeSlots(groups: string[][]): string[] {
  return [...new Set(groups.flat())].sort();
}
