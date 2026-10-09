import assert from "node:assert/strict";
import test from "node:test";
import {
  addSalonDays,
  canChangeBooking,
  clockRange,
  dateInHorizon,
  salonDate,
  salonMidnight,
  slotsForDay,
} from "./slots.js";

const DATE = "2026-10-06";

function day(workEndHour: number, busy: { start: string; end: string }[] = [], extras?: Partial<Parameters<typeof slotsForDay>[0]>) {
  const work = [clockRange(DATE, 10 * 60, workEndHour * 60)];
  return slotsForDay({
    date: DATE,
    durationMin: 45,
    stepMin: 15,
    noticeMin: 0,
    now: salonMidnight(DATE),
    work,
    busy: busy.map((item) => ({
      start: clockRange(DATE, clock(item.start), clock(item.end)).start,
      end: clockRange(DATE, clock(item.start), clock(item.end)).end,
    })),
    ...extras,
  });
}

function clock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

test("обед вырезает слоты, которые в него заходят", () => {
  const slots = day(21, [{ start: "13:00", end: "14:00" }]);
  assert.equal(slots.includes("12:15"), true);
  assert.equal(slots.includes("12:30"), false);
  assert.equal(slots.includes("13:00"), false);
  assert.equal(slots.includes("13:45"), false);
  assert.equal(slots.includes("14:00"), true);
});

test("услуга должна закончиться до конца смены", () => {
  const slots = day(12);
  assert.deepEqual(slots.at(-1), "11:15");
  assert.equal(slots.includes("11:30"), false);
});

test("короткая услуга помещается ближе к концу смены", () => {
  const slots = day(12, [], { durationMin: 20 });
  assert.equal(slots.at(-1), "11:30");
});

test("исключение и существующая запись убирают пересечение", () => {
  const slots = day(18, [
    { start: "11:00", end: "11:45" },
    { start: "15:00", end: "17:00" },
  ]);
  assert.equal(slots.includes("10:30"), false);
  assert.equal(slots.includes("11:00"), false);
  assert.equal(slots.includes("11:45"), true);
  assert.equal(slots.includes("14:30"), false);
  assert.equal(slots.includes("15:00"), false);
  assert.equal(slots.includes("17:00"), true);
});

test("min_notice_min скрывает слишком близкие слоты", () => {
  const slots = day(12, [], { now: salonMidnight(DATE) + 10 * 60 * 60 * 1000, noticeMin: 30 });
  assert.equal(slots.includes("10:15"), false);
  assert.equal(slots[0], "10:30");
});

test("горизонт записи считается включительно от сегодня", () => {
  assert.equal(dateInHorizon("2026-10-06", "2026-10-06", 30), true);
  assert.equal(dateInHorizon(addSalonDays("2026-10-06", 30), "2026-10-06", 30), true);
  assert.equal(dateInHorizon(addSalonDays("2026-10-06", 31), "2026-10-06", 30), false);
  assert.equal(dateInHorizon("2026-10-05", "2026-10-06", 30), false);
});

test("отмена и перенос закрываются за cutoff минут", () => {
  const start = salonMidnight(DATE) + 12 * 60 * 60 * 1000;
  assert.equal(canChangeBooking(start, start - 30 * 60_000, 30), true);
  assert.equal(canChangeBooking(start, start - 29 * 60_000, 30), false);
});

test("дата салона не уезжает на предыдущий день из-за UTC", () => {
  assert.equal(salonDate(salonMidnight(DATE) + 60_000), DATE);
});
