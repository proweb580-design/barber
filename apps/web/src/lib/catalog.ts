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
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  specialties: string[];
  rating: number | null;
};

const TONES = ["#8d4e24", "#3f5c4b", "#3d4f6f"] as const;

export function barberInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function barberTone(index: number) {
  return TONES[index % TONES.length];
}

function apiUrl(path: string) {
  const base = process.env.API_URL ?? "http://127.0.0.1:4000";
  return `${base}${path}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`API ${path} ответил ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getServices() {
  const body = await getJson<{ services: Service[] }>("/api/v1/services");
  return body.services;
}

export async function getBarbers() {
  const body = await getJson<{ barbers: Barber[] }>("/api/v1/barbers");
  return body.barbers;
}

export async function loadCatalog() {
  try {
    const [services, barbers] = await Promise.all([getServices(), getBarbers()]);
    return { ok: true as const, services, barbers };
  } catch {
    return { ok: false as const };
  }
}
