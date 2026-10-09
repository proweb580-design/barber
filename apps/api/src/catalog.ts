import type { PrismaClient } from "db";

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  sortOrder: number;
};

type LinkRow = {
  durationMin: number | null;
  price: number | null;
  isEnabled: boolean;
  service: ServiceRow;
};

export type PublicService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

export type PublicBarber = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  specialties: string[];
  rating: number | null;
};

export type BarberDetail = PublicBarber & {
  services: PublicService[];
};

const barberInclude = {
  services: {
    where: { isEnabled: true },
    include: { service: true },
  },
  reviews: {
    where: { isPublic: true },
    select: { rating: true },
  },
} as const;

type BarberRecord = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  services: LinkRow[];
  reviews: { rating: number }[];
};

function toService(link: LinkRow): PublicService {
  return {
    id: link.service.id,
    name: link.service.name,
    description: link.service.description,
    durationMin: link.durationMin ?? link.service.durationMin,
    price: link.price ?? link.service.price,
  };
}

function averageRating(reviews: { rating: number }[]): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function toBarber(row: BarberRecord): PublicBarber {
  const services = [...row.services].sort((a, b) => a.service.sortOrder - b.service.sortOrder);
  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
    bio: row.bio,
    experienceYears: row.experienceYears,
    specialties: services.map((link) => link.service.name),
    rating: averageRating(row.reviews),
  };
}

export async function listServices(db: PrismaClient): Promise<PublicService[]> {
  return db.service.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, description: true, durationMin: true, price: true },
  });
}

export async function listBarbers(db: PrismaClient): Promise<PublicBarber[]> {
  const rows = await db.barber.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: barberInclude,
  });
  return rows.map((row) => toBarber(row));
}

export async function getBarber(db: PrismaClient, id: string): Promise<BarberDetail | null> {
  const row = await db.barber.findFirst({
    where: { id, isActive: true },
    include: barberInclude,
  });
  if (!row) return null;
  const services = [...row.services]
    .sort((a, b) => a.service.sortOrder - b.service.sortOrder)
    .map((link) => toService(link));
  return { ...toBarber(row), services };
}
