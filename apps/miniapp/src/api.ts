export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

export type Barber = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  specialties: string[];
  rating: number | null;
};

export type DayOption = { date: string; available: boolean };

export type SavedBooking = {
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

export type Session = {
  user: { id: string; name: string };
  client: { name: string; phone: string } | null;
  bookings: SavedBooking[];
};

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function errorOf(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;
  return body.error as { code?: string; message?: string } | undefined;
}

const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorOf(body);
    throw new ApiFailure(error?.message ?? "Запрос не выполнился", error?.code ?? "INTERNAL", response.status);
  }
  return body as T;
}

export function fetchServices() {
  return request<{ services: Service[] }>("/api/v1/services").then((body) => body.services);
}

export function fetchBarbers() {
  return request<{ barbers: Barber[] }>("/api/v1/barbers").then((body) => body.barbers);
}

export function fetchDays(serviceIds: string[], barberId: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId });
  return request<{ days: DayOption[] }>(`/api/v1/availability/days?${params}`).then((body) => body.days);
}

export function fetchSlots(serviceIds: string[], barberId: string, date: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId, date });
  return request<{ slots: string[] }>(`/api/v1/availability?${params}`).then((body) => body.slots);
}

export function openSession(initData: string) {
  return request<Session>("/api/v1/telegram/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
  });
}

export function createBooking(input: {
  serviceIds: string[];
  barberId: string;
  startsAt: string;
  client: { name: string; phone: string };
  initData: string;
}) {
  return request<{ booking: SavedBooking }>("/api/v1/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.initData ? { "x-telegram-init-data": input.initData } : {}),
    },
    body: JSON.stringify({
      serviceIds: input.serviceIds,
      barberId: input.barberId,
      startsAt: input.startsAt,
      client: input.client,
    }),
  }).then((body) => body.booking);
}

export function cancelBooking(token: string) {
  return request<{ booking: SavedBooking }>(`/api/v1/bookings/${token}/cancel`, { method: "POST" }).then((body) => body.booking);
}

export function rescheduleBooking(token: string, startsAt: string) {
  return request<{ booking: SavedBooking }>(`/api/v1/bookings/${token}/reschedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ startsAt }),
  }).then((body) => body.booking);
}

export function tashkentStartIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:00`).toISOString();
}
