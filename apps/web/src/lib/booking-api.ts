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

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  throw new Error(body?.error?.message ?? "Запрос не выполнился");
}

export async function fetchDays(serviceIds: string[], barberId: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId });
  const response = await fetch(`/api/v1/availability/days?${params}`);
  if (!response.ok) await readError(response);
  const body = (await response.json()) as { days: DayOption[] };
  return body.days;
}

export async function fetchSlots(serviceIds: string[], barberId: string, date: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId, date });
  const response = await fetch(`/api/v1/availability?${params}`);
  if (!response.ok) await readError(response);
  const body = (await response.json()) as { slots: string[] };
  return body.slots;
}

export function tashkentStartIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:00`).toISOString();
}

export async function getBooking(token: string): Promise<SavedBooking | null> {
  const base = process.env.API_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(`${base}/api/v1/bookings/${token}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) await readError(response);
  const body = (await response.json()) as { booking: SavedBooking };
  return body.booking;
}
