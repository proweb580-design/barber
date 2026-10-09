export type AdminBooking = {
  id: string;
  status: string;
  source?: string;
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  barber: { id: string; name: string };
  client: { name: string; phone: string };
  services: { id: string; name: string; durationMin: number; price: number }[];
};

export type AdminService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

export type AdminBarber = {
  id: string;
  name: string;
  bio: string;
  photoUrl: string | null;
  experienceYears: number;
  isActive: boolean;
  sortOrder: number;
  serviceIds: string[];
  portfolio: { id: string; imageUrl: string; sortOrder: number }[];
  hours: { weekday: number; start: string; end: string }[];
  breaks: { weekday: number; start: string; end: string }[];
};

export type TimeOffItem = {
  id: string;
  barberId: string | null;
  barberName: string | null;
  startsAt: string;
  endsAt: string;
  type: "day_off" | "vacation" | "sick" | "closure";
  note: string;
};

export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new AdminRequestError(body?.error?.message ?? "Запрос не выполнен", response.status);
  }
  return body as T;
}

export function session() {
  return adminFetch<{ login: string }>("/api/v1/admin/session");
}

export function login(loginName: string, password: string) {
  return adminFetch<{ login: string }>("/api/v1/admin/login", {
    method: "POST",
    body: JSON.stringify({ login: loginName, password }),
  });
}

export function logout() {
  return adminFetch<{ ok: boolean }>("/api/v1/admin/logout", { method: "POST" });
}

export function bookings(from: string, to: string) {
  return adminFetch<{ bookings: AdminBooking[] }>(`/api/v1/admin/bookings?from=${from}&to=${to}`);
}

export function createAdminBooking(input: {
  serviceIds: string[];
  barberId: string;
  startsAt: string;
  client: { name: string; phone: string };
}) {
  return adminFetch<{ booking: AdminBooking }>("/api/v1/admin/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchBooking(id: string, input: { status?: string; startsAt?: string }) {
  return adminFetch<{ booking: AdminBooking }>(`/api/v1/admin/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function staffSlots(serviceIds: string[], barberId: string, date: string) {
  const query = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId, date });
  return adminFetch<{ slots: string[] }>(`/api/v1/admin/availability?${query}`);
}

export function services() {
  return adminFetch<{ services: AdminService[] }>("/api/v1/admin/services");
}

export function saveService(input: Omit<AdminService, "id">, id?: string) {
  return adminFetch<{ service: AdminService }>(id ? `/api/v1/admin/services/${id}` : "/api/v1/admin/services", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteService(id: string) {
  return adminFetch<{ removed: boolean }>(`/api/v1/admin/services/${id}`, { method: "DELETE" });
}

export function barbers() {
  return adminFetch<{ barbers: AdminBarber[] }>("/api/v1/admin/barbers");
}

export function saveBarber(input: {
  name: string;
  bio: string;
  photoUrl: string | null;
  experienceYears: number;
  isActive: boolean;
  sortOrder: number;
  serviceIds: string[];
}, id?: string) {
  return adminFetch<{ barber: { id: string } }>(id ? `/api/v1/admin/barbers/${id}` : "/api/v1/admin/barbers", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteBarber(id: string) {
  return adminFetch<{ removed: boolean }>(`/api/v1/admin/barbers/${id}`, { method: "DELETE" });
}

export function saveSchedule(id: string, hours: { weekday: number; start: string; end: string }[], breaks: { weekday: number; start: string; end: string }[]) {
  return adminFetch<{ ok: boolean }>(`/api/v1/admin/barbers/${id}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ hours, breaks }),
  });
}

export function addPortfolio(id: string, imageUrl: string) {
  return adminFetch<{ item: { id: string } }>(`/api/v1/admin/barbers/${id}/portfolio`, {
    method: "POST",
    body: JSON.stringify({ imageUrl }),
  });
}

export function deletePortfolio(id: string) {
  return adminFetch<{ ok: boolean }>(`/api/v1/admin/portfolio/${id}`, { method: "DELETE" });
}

export async function uploadImage(file: File) {
  if (file.size > 1_500_000) throw new Error("Фото больше 1,5 МБ");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return adminFetch<{ url: string }>("/api/v1/admin/uploads", {
    method: "POST",
    body: JSON.stringify({ data: btoa(binary) }),
  });
}

export function timeOff(from: string, to: string) {
  return adminFetch<{ items: TimeOffItem[] }>(`/api/v1/admin/time-off?from=${from}&to=${to}`);
}

export function createTimeOff(input: { barberId: string | null; startsAt: string; endsAt: string; type: TimeOffItem["type"]; note: string }) {
  return adminFetch<{ item: { id: string } }>("/api/v1/admin/time-off", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTimeOff(id: string) {
  return adminFetch<{ ok: boolean }>(`/api/v1/admin/time-off/${id}`, { method: "DELETE" });
}

export function reviews() {
  return adminFetch<{ reviews: { id: string; rating: number; comment: string; isPublic: boolean; createdAt: string; clientName: string; barberName: string }[] }>("/api/v1/admin/reviews");
}

export function setReviewPublic(id: string, isPublic: boolean) {
  return adminFetch<{ review: { id: string; isPublic: boolean } }>(`/api/v1/admin/reviews/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isPublic }),
  });
}

export function settings() {
  return adminFetch<{ settings: Record<string, string> }>("/api/v1/admin/settings");
}

export function saveSettings(input: Record<string, string>) {
  return adminFetch<{ settings: Record<string, string> }>("/api/v1/admin/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

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

export function analytics(from: string, to: string) {
  return adminFetch<AnalyticsReport>(`/api/v1/admin/analytics?from=${from}&to=${to}`);
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Не получилось сохранить";
}
