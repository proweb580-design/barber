import type { PrismaClient } from "db";
import { ApiError } from "./errors.js";
import {
  addSalonDays,
  clockMinutes,
  clockRange,
  formatClock,
  salonDate,
  salonMidnight,
  subtractRanges,
  weekdaySalon,
  type Range,
} from "./slots.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HEAT_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

type Status = "confirmed" | "completed" | "cancelled" | "no_show";

type Visit = {
  clientId: string;
  barberId: string;
  startsAt: number;
  totalPrice: number;
  totalDurationMin: number;
  status: Status;
  services: { serviceId: string; name: string; price: number }[];
};

type ShiftBarber = {
  id: string;
  name: string;
  hours: { weekday: number; startTime: Date; endTime: Date }[];
  breaks: { weekday: number; startTime: Date; endTime: Date }[];
};

type Closed = { barberId: string | null; startsAt: number; endsAt: number };

export type AnalyticsReport = {
  from: string;
  to: string;
  bookings: { total: number; confirmed: number; completed: number; cancelled: number; noShow: number };
  revenue: number;
  services: { serviceId: string; name: string; count: number; revenue: number }[];
  load: { barberId: string; name: string; availableMin: number; bookedMin: number; loadPercent: number | null }[];
  cancellations: { count: number; rate: number | null };
  noShows: { count: number; rate: number | null };
  retention: { clients: number; returning: number; rate: number | null };
  heatmap: { weekday: number; hour: number; count: number }[];
};

function percent(part: number, whole: number) {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function periodBounds(from: string, to: string) {
  if (to < from) throw new ApiError(400, "VALIDATION", "Конец периода раньше начала");
  const start = salonMidnight(from);
  const end = salonMidnight(addSalonDays(to, 1));
  if (end - start > 367 * DAY_MS) throw new ApiError(400, "VALIDATION", "Период длиннее года");
  return { start, end };
}

function datesOf(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addSalonDays(date, 1)) dates.push(date);
  return dates;
}

function openMinutes(barber: ShiftBarber, date: string, closed: Closed[]) {
  const weekday = weekdaySalon(date);
  const work = barber.hours
    .filter((row) => row.weekday === weekday)
    .map((row) => clockRange(date, clockMinutes(row.startTime), clockMinutes(row.endTime)));
  const dayStart = salonMidnight(date);
  const dayEnd = dayStart + DAY_MS;
  const busy: Range[] = [
    ...barber.breaks
      .filter((row) => row.weekday === weekday)
      .map((row) => clockRange(date, clockMinutes(row.startTime), clockMinutes(row.endTime))),
    ...closed
      .filter((row) => row.barberId === null || row.barberId === barber.id)
      .map((row) => ({ start: Math.max(row.startsAt, dayStart), end: Math.min(row.endsAt, dayEnd) }))
      .filter((row) => row.end > row.start),
  ];
  return subtractRanges(work, busy).reduce((sum, range) => sum + (range.end - range.start) / 60_000, 0);
}

export function summarize(input: {
  from: string;
  to: string;
  visits: Visit[];
  priorClientIds: string[];
  barbers: ShiftBarber[];
  closed: Closed[];
}): AnalyticsReport {
  const counts = { total: input.visits.length, confirmed: 0, completed: 0, cancelled: 0, noShow: 0 };
  let revenue = 0;
  const services = new Map<string, { serviceId: string; name: string; count: number; revenue: number }>();
  const booked = new Map<string, number>();
  const heat = new Map<string, number>();
  const completedClients = new Set<string>();
  const hours = new Set(HEAT_HOURS);

  for (const visit of input.visits) {
    if (visit.status === "confirmed") counts.confirmed += 1;
    if (visit.status === "completed") counts.completed += 1;
    if (visit.status === "cancelled") counts.cancelled += 1;
    if (visit.status === "no_show") counts.noShow += 1;
    if (visit.status === "completed") {
      revenue += visit.totalPrice;
      completedClients.add(visit.clientId);
      for (const service of visit.services) {
        const row = services.get(service.serviceId) ?? { serviceId: service.serviceId, name: service.name, count: 0, revenue: 0 };
        row.count += 1;
        row.revenue += service.price;
        services.set(service.serviceId, row);
      }
    }
    if (visit.status === "confirmed" || visit.status === "completed") {
      booked.set(visit.barberId, (booked.get(visit.barberId) ?? 0) + visit.totalDurationMin);
      const hour = Number(formatClock(visit.startsAt).slice(0, 2));
      const weekday = weekdaySalon(salonDate(visit.startsAt));
      const key = `${weekday}:${hour}`;
      heat.set(key, (heat.get(key) ?? 0) + 1);
      hours.add(hour);
    }
  }

  const prior = new Set(input.priorClientIds);
  let returning = 0;
  for (const clientId of completedClients) {
    if (prior.has(clientId)) returning += 1;
  }

  const dates = datesOf(input.from, input.to);
  const load = input.barbers
    .map((barber) => {
      const availableMin = Math.round(dates.reduce((sum, date) => sum + openMinutes(barber, date, input.closed), 0));
      const bookedMin = booked.get(barber.id) ?? 0;
      return {
        barberId: barber.id,
        name: barber.name,
        availableMin,
        bookedMin,
        loadPercent: percent(bookedMin, availableMin),
      };
    })
    .filter((row) => row.availableMin > 0 || row.bookedMin > 0)
    .sort((a, b) => b.bookedMin - a.bookedMin || a.name.localeCompare(b.name, "ru"));

  const hourList = [...hours].sort((a, b) => a - b);
  const heatmap = [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    hourList.map((hour) => ({ weekday, hour, count: heat.get(`${weekday}:${hour}`) ?? 0 })),
  );

  return {
    from: input.from,
    to: input.to,
    bookings: counts,
    revenue,
    services: [...services.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.name.localeCompare(b.name, "ru")),
    load,
    cancellations: { count: counts.cancelled, rate: percent(counts.cancelled, counts.total) },
    noShows: { count: counts.noShow, rate: percent(counts.noShow, counts.total) },
    retention: { clients: completedClients.size, returning, rate: percent(returning, completedClients.size) },
    heatmap,
  };
}

export async function analyticsReport(db: PrismaClient, from: string, to: string) {
  const bounds = periodBounds(from, to);
  const [visits, barbers, closed] = await Promise.all([
    db.booking.findMany({
      where: { startsAt: { gte: new Date(bounds.start), lt: new Date(bounds.end) } },
      select: {
        clientId: true,
        barberId: true,
        startsAt: true,
        totalPrice: true,
        totalDurationMin: true,
        status: true,
        services: { select: { serviceId: true, name: true, price: true } },
      },
    }),
    db.barber.findMany({ select: { id: true, name: true, workingHours: true, breaks: true } }),
    db.timeOff.findMany({
      where: { startsAt: { lt: new Date(bounds.end) }, endsAt: { gt: new Date(bounds.start) } },
      select: { barberId: true, startsAt: true, endsAt: true },
    }),
  ]);
  const completedClientIds = [...new Set(visits.filter((visit) => visit.status === "completed").map((visit) => visit.clientId))];
  const prior = completedClientIds.length
    ? await db.booking.findMany({
        where: { status: "completed", clientId: { in: completedClientIds }, startsAt: { lt: new Date(bounds.start) } },
        select: { clientId: true },
        distinct: ["clientId"],
      })
    : [];
  return summarize({
    from,
    to,
    visits: visits.map((visit) => ({ ...visit, startsAt: visit.startsAt.getTime() })),
    priorClientIds: prior.map((row) => row.clientId),
    barbers: barbers.map((barber) => ({ id: barber.id, name: barber.name, hours: barber.workingHours, breaks: barber.breaks })),
    closed: closed.map((row) => ({ barberId: row.barberId, startsAt: row.startsAt.getTime(), endsAt: row.endsAt.getTime() })),
  });
}
