import type { PrismaClient } from "db";
import { ApiError } from "./errors.js";
import { notifyBooking } from "./notify.js";
import { telegramBookingLink } from "./telegram-link.js";
import {
  addSalonDays,
  canChangeBooking,
  clockMinutes,
  clockRange,
  dateInHorizon,
  formatClock,
  mergeSlots,
  salonDate,
  salonMidnight,
  slotsForDay,
  weekdaySalon,
  type Range,
} from "./slots.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type Db = PrismaClient;

type Settings = {
  cancelCutoffMin: number;
  slotStepMin: number;
  horizonDays: number;
  minNoticeMin: number;
};

type ServiceLink = {
  serviceId: string;
  durationMin: number | null;
  price: number | null;
  service: { id: string; name: string; description: string; durationMin: number; price: number; isActive: boolean };
};

type BarberRow = {
  id: string;
  name: string;
  sortOrder: number;
  services: ServiceLink[];
};

export type BookingView = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  manageToken: string;
  telegramLink: string | null;
  canChange: boolean;
  barber: { id: string; name: string };
  client: { name: string; phone: string };
  services: { id: string; name: string; durationMin: number; price: number }[];
};

function numberSetting(rows: { key: string; value: string }[], key: string, fallback: number) {
  const raw = rows.find((row) => row.key === key)?.value;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.setting.findMany();
  return {
    cancelCutoffMin: numberSetting(rows, "cancel_cutoff_min", 30),
    slotStepMin: numberSetting(rows, "slot_step_min", 15),
    horizonDays: numberSetting(rows, "booking_horizon_days", 30),
    minNoticeMin: numberSetting(rows, "min_notice_min", 30),
  };
}

function durationOf(barber: BarberRow, serviceIds: string[]) {
  return serviceIds.reduce((sum, id) => {
    const link = barber.services.find((item) => item.serviceId === id);
    if (!link) return sum;
    return sum + (link.durationMin ?? link.service.durationMin);
  }, 0);
}

function priceOf(barber: BarberRow, serviceIds: string[]) {
  return serviceIds.reduce((sum, id) => {
    const link = barber.services.find((item) => item.serviceId === id);
    if (!link) return sum;
    return sum + (link.price ?? link.service.price);
  }, 0);
}

function linesOf(barber: BarberRow, serviceIds: string[]) {
  return serviceIds.map((id) => {
    const link = barber.services.find((item) => item.serviceId === id);
    if (!link || !link.service.isActive) {
      throw new ApiError(422, "VALIDATION", "Одна из услуг больше не доступна");
    }
    return {
      serviceId: id,
      name: link.service.name,
      durationMin: link.durationMin ?? link.service.durationMin,
      price: link.price ?? link.service.price,
    };
  });
}

async function eligibleBarbers(db: Db, serviceIds: string[], barberId: string) {
  const barbers = await db.barber.findMany({
    where: { isActive: true, ...(barberId === "any" ? {} : { id: barberId }) },
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: { isEnabled: true, serviceId: { in: serviceIds } },
        include: { service: true },
      },
    },
  });
  const matched = barbers.filter((barber) =>
    serviceIds.every((id) => barber.services.some((link) => link.serviceId === id && link.service.isActive)),
  );
  if (barberId !== "any" && matched.length === 0) {
    throw new ApiError(422, "VALIDATION", "Барбер не выполняет выбранные услуги");
  }
  return matched;
}

type Schedule = {
  hours: { barberId: string; weekday: number; startTime: Date; endTime: Date }[];
  breaks: { barberId: string; weekday: number; startTime: Date; endTime: Date }[];
  timeOff: { barberId: string | null; startsAt: Date; endsAt: Date }[];
  bookings: { id: string; barberId: string; startsAt: Date; endsAt: Date }[];
};

async function loadSchedule(db: Db, barberIds: string[], fromMs: number, toMs: number): Promise<Schedule> {
  const [hours, breaks, timeOff, bookings] = await Promise.all([
    db.workingHour.findMany({ where: { barberId: { in: barberIds } } }),
    db.break.findMany({ where: { barberId: { in: barberIds } } }),
    db.timeOff.findMany({
      where: {
        OR: [{ barberId: { in: barberIds } }, { barberId: null }],
        startsAt: { lt: new Date(toMs) },
        endsAt: { gt: new Date(fromMs) },
      },
    }),
    db.booking.findMany({
      where: {
        barberId: { in: barberIds },
        status: "confirmed",
        startsAt: { lt: new Date(toMs) },
        endsAt: { gt: new Date(fromMs) },
      },
      select: { id: true, barberId: true, startsAt: true, endsAt: true },
    }),
  ]);
  return { hours, breaks, timeOff, bookings };
}

function durationForRequest(barber: BarberRow, serviceIds: string[]) {
  return durationOf(
    {
      ...barber,
      services: barber.services.filter((link) => serviceIds.includes(link.serviceId)),
    },
    serviceIds,
  );
}

function slotsOnDate(
  barbers: BarberRow[],
  serviceIds: string[],
  date: string,
  schedule: Schedule,
  settings: Settings,
  now: number,
  ignoreBookingId?: string,
  skipBookings = false,
) {
  return mergeSlots(
    barbers.map((barber) => {
      const focused: BarberRow = {
        ...barber,
        services: barber.services.filter((link) => serviceIds.includes(link.serviceId)),
      };
      const weekday = weekdaySalon(date);
      const work = schedule.hours
        .filter((row) => row.barberId === barber.id && row.weekday === weekday)
        .map((row) => clockRange(date, clockMinutes(row.startTime), clockMinutes(row.endTime)));
      const dayStart = salonMidnight(date);
      const dayEnd = dayStart + DAY_MS;
      const busy: Range[] = [
        ...schedule.breaks
          .filter((row) => row.barberId === barber.id && row.weekday === weekday)
          .map((row) => clockRange(date, clockMinutes(row.startTime), clockMinutes(row.endTime))),
        ...schedule.timeOff
          .filter((row) => row.barberId === null || row.barberId === barber.id)
          .map((row) => ({
            start: Math.max(row.startsAt.getTime(), dayStart),
            end: Math.min(row.endsAt.getTime(), dayEnd),
          })),
        ...(skipBookings
          ? []
          : schedule.bookings
              .filter((row) => row.barberId === barber.id && row.id !== ignoreBookingId)
              .map((row) => ({
                start: Math.max(row.startsAt.getTime(), dayStart),
                end: Math.min(row.endsAt.getTime(), dayEnd),
              }))),
      ].filter((range) => range.end > range.start);
      return slotsForDay({
        date,
        durationMin: durationForRequest(focused, serviceIds),
        stepMin: settings.slotStepMin,
        noticeMin: settings.minNoticeMin,
        now,
        work,
        busy,
      });
    }),
  );
}

export async function availability(db: Db, input: { serviceIds: string[]; barberId: string; date: string; now?: number; ignoreBookingId?: string; staff?: boolean }) {
  const now = input.now ?? Date.now();
  const settings = rulesFor(await loadSettings(db), input.staff === true);
  const today = salonDate(now);
  if (!dateInHorizon(input.date, today, settings.horizonDays)) {
    return { date: input.date, durationMin: 0, slots: [] as string[] };
  }
  const barbers = await eligibleBarbers(db, input.serviceIds, input.barberId);
  if (barbers.length === 0) return { date: input.date, durationMin: 0, slots: [] as string[] };
  const schedule = await loadSchedule(db, barbers.map((barber) => barber.id), salonMidnight(input.date), salonMidnight(input.date) + DAY_MS);
  const slots = slotsOnDate(barbers, input.serviceIds, input.date, schedule, settings, now, input.ignoreBookingId);
  const durationMin = Math.max(...barbers.map((barber) => durationForRequest(barber, input.serviceIds)));
  return { date: input.date, durationMin, slots };
}

export async function availabilityDays(db: Db, input: { serviceIds: string[]; barberId: string; now?: number }) {
  const now = input.now ?? Date.now();
  const settings = await loadSettings(db);
  const today = salonDate(now);
  const last = addSalonDays(today, settings.horizonDays);
  const barbers = await eligibleBarbers(db, input.serviceIds, input.barberId);
  const dates = Array.from({ length: settings.horizonDays + 1 }, (_, index) => addSalonDays(today, index));
  if (barbers.length === 0) {
    return { days: dates.map((date) => ({ date, available: false })) };
  }
  const schedule = await loadSchedule(db, barbers.map((barber) => barber.id), salonMidnight(today), salonMidnight(last) + DAY_MS);
  return {
    days: dates.map((date) => ({
      date,
      available: slotsOnDate(barbers, input.serviceIds, date, schedule, settings, now).length > 0,
    })),
  };
}

function rulesFor(settings: Settings, staff: boolean): Settings {
  if (!staff) return settings;
  return { ...settings, minNoticeMin: 0, horizonDays: 366 };
}

function classifyMiss(startsAtMs: number, now: number, settings: Settings, staff = false) {
  const date = salonDate(startsAtMs);
  const today = salonDate(now);
  if (staff && startsAtMs < now) {
    throw new ApiError(422, "TOO_SOON", "Это время уже прошло");
  }
  if (date > addSalonDays(today, settings.horizonDays)) {
    throw new ApiError(422, "TOO_FAR", "Эта дата дальше горизонта записи");
  }
  if (startsAtMs < now + settings.minNoticeMin * 60_000) {
    throw new ApiError(422, "TOO_SOON", "До этого времени уже слишком мало минут");
  }
  throw new ApiError(422, "OUTSIDE_WORKING_HOURS", "В это время услуга не помещается в график");
}

async function assertSlotOpen(db: Db, barber: BarberRow, serviceIds: string[], startsAtMs: number, now: number, ignoreBookingId?: string, staff = false) {
  const settings = rulesFor(await loadSettings(db), staff);
  const date = salonDate(startsAtMs);
  const schedule = await loadSchedule(db, [barber.id], salonMidnight(date), salonMidnight(date) + DAY_MS);
  const slots = slotsOnDate([barber], serviceIds, date, schedule, settings, now, ignoreBookingId);
  const clock = formatClock(startsAtMs);
  if (!slots.includes(clock)) {
    const withoutBookings = slotsOnDate([barber], serviceIds, date, schedule, settings, now, ignoreBookingId, true);
    if (withoutBookings.includes(clock)) {
      throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    }
    classifyMiss(startsAtMs, now, settings, staff);
  }
  return { settings, durationMin: durationForRequest(barber, serviceIds), price: priceOf(barber, serviceIds) };
}

async function linkTelegram(
  db: Pick<Db, "client">,
  client: { id: string; telegramId: string | null; telegramChatId?: string | null },
  telegramId: string,
  chatId = telegramId,
) {
  if (client.telegramId && client.telegramId !== telegramId) {
    throw new ApiError(422, "PHONE_TAKEN", "Этот телефон уже привязан к другому Telegram");
  }
  const owner = await db.client.findUnique({ where: { telegramId } });
  if (owner && owner.id !== client.id) {
    throw new ApiError(422, "TELEGRAM_TAKEN", "Этот Telegram уже привязан к другому телефону");
  }
  if (client.telegramId === telegramId && client.telegramChatId === chatId) return client;
  return db.client.update({ where: { id: client.id }, data: { telegramId, telegramChatId: chatId } });
}

export async function linkClientTelegram(db: Db, clientId: string, telegramId: string, chatId: string) {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ApiError(404, "NOT_FOUND", "Клиент не найден");
  await linkTelegram(db, client, telegramId, chatId);
}

async function findOrCreateClient(db: Pick<Db, "client">, name: string, phone: string) {
  const existing = await db.client.findFirst({ where: { phone } });
  if (!existing) return db.client.create({ data: { name, phone } });
  if (existing.name !== name) {
    return db.client.update({ where: { id: existing.id }, data: { name } });
  }
  return existing;
}

export function toView(
  booking: {
    id: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    totalPrice: number;
    totalDurationMin: number;
    manageToken: string;
    barber: { id: string; name: string };
    client: { name: string; phone: string };
    services: { serviceId: string; name: string; durationMin: number; price: number }[];
  },
  cutoffMin: number,
  now = Date.now(),
): BookingView {
  return {
    id: booking.id,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPrice: booking.totalPrice,
    totalDurationMin: booking.totalDurationMin,
    manageToken: booking.manageToken,
    telegramLink: telegramBookingLink(booking.manageToken),
    canChange: booking.status === "confirmed" && canChangeBooking(booking.startsAt.getTime(), now, cutoffMin),
    barber: booking.barber,
    client: booking.client,
    services: booking.services.map((service) => ({
      id: service.serviceId,
      name: service.name,
      durationMin: service.durationMin,
      price: service.price,
    })),
  };
}

const bookingInclude = {
  barber: { select: { id: true, name: true } },
  client: { select: { name: true, phone: true } },
  services: true,
} as const;

export async function createBooking(
  db: Db,
  input: {
    serviceIds: string[];
    barberId: string;
    startsAt: string;
    client: { name: string; phone: string };
    source?: "web" | "telegram" | "admin";
    telegramId?: string;
    staff?: boolean;
    now?: number;
  },
) {
  const now = input.now ?? Date.now();
  const startsAtMs = Date.parse(input.startsAt);
  if (Number.isNaN(startsAtMs)) throw new ApiError(400, "VALIDATION", "Некорректное время");
  const serviceIds = [...new Set(input.serviceIds)];
  const barbers = await eligibleBarbers(db, serviceIds, input.barberId);
  const candidates = [];
  let rejected: unknown;
  let taken = false;
  for (const barber of barbers) {
    try {
      const quote = await assertSlotOpen(db, barber, serviceIds, startsAtMs, now, undefined, input.staff === true);
      candidates.push({ barber, ...quote });
    } catch (error) {
      rejected = error;
      if (error instanceof ApiError && error.code === "SLOT_TAKEN") taken = true;
      if (input.barberId !== "any") throw error;
    }
  }
  if (candidates.length === 0) {
    if (taken) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    if (rejected instanceof ApiError) throw rejected;
    throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
  }

  let lastTaken: unknown;
  for (const candidate of candidates) {
    try {
      const booking = await db.$transaction(async (tx) => {
        const client = await findOrCreateClient(tx, input.client.name, input.client.phone);
        if (input.telegramId) await linkTelegram(tx, client, input.telegramId);
        const created = await tx.booking.create({
          data: {
            clientId: client.id,
            barberId: candidate.barber.id,
            startsAt: new Date(startsAtMs),
            endsAt: new Date(startsAtMs + candidate.durationMin * 60_000),
            totalPrice: candidate.price,
            totalDurationMin: candidate.durationMin,
            status: "confirmed",
            source: input.source ?? "web",
          },
        });
        await tx.bookingService.createMany({
          data: linesOf(candidate.barber, serviceIds).map((line) => ({ ...line, bookingId: created.id })),
        });
        return tx.booking.findUniqueOrThrow({ where: { id: created.id }, include: bookingInclude });
      });
      const settings = await loadSettings(db);
      const view = toView(booking, settings.cancelCutoffMin, now);
      await notifyBooking(db, booking.id, "created");
      return view;
    } catch (error) {
      if (!isSlotTaken(error)) throw error;
      lastTaken = error;
    }
  }
  if (lastTaken) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
  throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
}

export function isSlotTaken(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return code === "P2004" || code === "P2034" || message.includes("23P01") || message.includes("bookings_no_overlap");
}

export async function listClientBookings(db: Db, telegramId: string) {
  const client = await db.client.findUnique({
    where: { telegramId },
    include: {
      bookings: {
        orderBy: { startsAt: "desc" },
        include: bookingInclude,
      },
    },
  });
  const settings = await loadSettings(db);
  if (!client) return { client: null, bookings: [] as BookingView[] };
  return {
    client: { name: client.name, phone: client.phone },
    bookings: client.bookings.map((booking) => toView(booking, settings.cancelCutoffMin)),
  };
}

export async function getBookingByToken(db: Db, token: string) {
  const booking = await db.booking.findUnique({ where: { manageToken: token }, include: bookingInclude });
  if (!booking) return null;
  const settings = await loadSettings(db);
  return toView(booking, settings.cancelCutoffMin);
}

async function requireChangeable(db: Db, token: string) {
  const booking = await db.booking.findUnique({ where: { manageToken: token }, include: { ...bookingInclude, services: true } });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  if (booking.status !== "confirmed") throw new ApiError(422, "NOT_CONFIRMED", "Эту запись уже нельзя менять");
  const settings = await loadSettings(db);
  if (!canChangeBooking(booking.startsAt.getTime(), Date.now(), settings.cancelCutoffMin)) {
    throw new ApiError(422, "TOO_LATE", `Отмена и перенос доступны не позже чем за ${settings.cancelCutoffMin} минут`);
  }
  return booking;
}

export async function cancelBooking(db: Db, token: string) {
  const booking = await requireChangeable(db, token);
  const updated = await db.booking.update({
    where: { id: booking.id },
    data: { status: "cancelled" },
    include: bookingInclude,
  });
  const settings = await loadSettings(db);
  const view = toView(updated, settings.cancelCutoffMin);
  await notifyBooking(db, updated.id, "cancelled");
  return view;
}

export async function rescheduleBooking(db: Db, token: string, startsAt: string) {
  const booking = await requireChangeable(db, token);
  const startsAtMs = Date.parse(startsAt);
  if (Number.isNaN(startsAtMs)) throw new ApiError(400, "VALIDATION", "Некорректное время");
  const serviceIds = booking.services.map((service) => service.serviceId);
  const barbers = await eligibleBarbers(db, serviceIds, booking.barberId);
  const barber = barbers[0];
  if (!barber) throw new ApiError(422, "VALIDATION", "Барбер больше не выполняет эти услуги");
  const quote = await assertSlotOpen(db, barber, serviceIds, startsAtMs, Date.now(), booking.id);
  try {
    const updated = await db.booking.update({
      where: { id: booking.id },
      data: {
        startsAt: new Date(startsAtMs),
        endsAt: new Date(startsAtMs + quote.durationMin * 60_000),
        totalDurationMin: quote.durationMin,
        totalPrice: quote.price,
      },
      include: bookingInclude,
    });
    const view = toView(updated, quote.settings.cancelCutoffMin);
    await notifyBooking(db, updated.id, "rescheduled");
    return view;
  } catch (error) {
    if (isSlotTaken(error)) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    throw error;
  }
}

export async function rescheduleBookingById(db: Db, id: string, startsAt: string) {
  const booking = await db.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  if (booking.status !== "confirmed") throw new ApiError(422, "NOT_CONFIRMED", "Переносить можно только подтверждённую запись");
  const startsAtMs = Date.parse(startsAt);
  if (Number.isNaN(startsAtMs)) throw new ApiError(400, "VALIDATION", "Некорректное время");
  const serviceIds = booking.services.map((service) => service.serviceId);
  const barbers = await eligibleBarbers(db, serviceIds, booking.barberId);
  const barber = barbers[0];
  if (!barber) throw new ApiError(422, "VALIDATION", "Барбер больше не выполняет эти услуги");
  const quote = await assertSlotOpen(db, barber, serviceIds, startsAtMs, Date.now(), booking.id, true);
  try {
    const updated = await db.booking.update({
      where: { id: booking.id },
      data: {
        startsAt: new Date(startsAtMs),
        endsAt: new Date(startsAtMs + quote.durationMin * 60_000),
        totalDurationMin: quote.durationMin,
        totalPrice: quote.price,
      },
      include: bookingInclude,
    });
    const view = toView(updated, quote.settings.cancelCutoffMin);
    await notifyBooking(db, updated.id, "rescheduled");
    return view;
  } catch (error) {
    if (isSlotTaken(error)) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    throw error;
  }
}

export async function setBookingStatus(db: Db, id: string, status: "confirmed" | "completed" | "cancelled" | "no_show") {
  const booking = await db.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  const settings = await loadSettings(db);
  if (booking.status === status) return toView(booking, settings.cancelCutoffMin);
  try {
    const updated = await db.booking.update({
      where: { id },
      data: { status },
      include: bookingInclude,
    });
    const view = toView(updated, settings.cancelCutoffMin);
    if (status === "cancelled") await notifyBooking(db, updated.id, "cancelled");
    return view;
  } catch (error) {
    if (isSlotTaken(error)) throw new ApiError(409, "SLOT_TAKEN", "Это время уже занято");
    throw error;
  }
}
