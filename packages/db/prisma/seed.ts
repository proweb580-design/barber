import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createPrismaClient } from "../src/client.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const services = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Стрижка",
    description: "Форма под лицо и укладка, которая держится без ежедневной укладки.",
    durationMin: 45,
    price: 120000,
    sortOrder: 1,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Стрижка и борода",
    description: "Стрижка вместе с контуром бороды, чтобы образ смотрелся цельно.",
    durationMin: 75,
    price: 180000,
    sortOrder: 2,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Оформление бороды",
    description: "Контур, длина и уход. Подходит, если стрижка ещё держит форму.",
    durationMin: 30,
    price: 80000,
    sortOrder: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Королевское бритьё",
    description: "Горячее полотенце, опасная бритва и спокойный темп.",
    durationMin: 40,
    price: 100000,
    sortOrder: 4,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    name: "Детская стрижка",
    description: "Для мальчиков до 12 лет. Мастер подстраивается под темп ребёнка.",
    durationMin: 30,
    price: 70000,
    sortOrder: 5,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    name: "Камуфляж седины",
    description: "Мягкий тон на волосы или бороду. Результат выглядит как свой цвет.",
    durationMin: 20,
    price: 50000,
    sortOrder: 6,
  },
] as const;

const barbers = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Рустам Юлдашев",
    bio: "Держит классические формы и короткие мужские стрижки. Спокойно объясняет, что отрастёт, а что нет.",
    experienceYears: 8,
    sortOrder: 1,
    serviceIds: [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000005",
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    name: "Сардор Назаров",
    bio: "Любит чёткие фейды и аккуратную бороду. Удобный мастер, если нужен точный повтор прошлой стрижки.",
    experienceYears: 5,
    sortOrder: 2,
    serviceIds: [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    name: "Ильхом Кадыров",
    bio: "Старший мастер. Берёт сложные седины, бритьё и тех, кто давно не был у барбера.",
    experienceYears: 12,
    sortOrder: 3,
    serviceIds: services.map((service) => service.id),
  },
] as const;

const settings = [
  ["cancel_cutoff_min", "30"],
  ["slot_step_min", "15"],
  ["booking_horizon_days", "30"],
  ["min_notice_min", "30"],
  ["reminder_day_minutes", "1440"],
  ["reminder_short_minutes", "30"],
  ["review_delay_min", "60"],
  ["timezone", "Asia/Tashkent"],
  ["review_public_min_rating", "4"],
] as const;

function clock(hours: number, minutes = 0) {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

const openDays = [0, 2, 3, 4, 5, 6];

async function main() {
  const prisma = createPrismaClient();

  try {
    for (const service of services) {
      await prisma.service.upsert({
        where: { id: service.id },
        update: service,
        create: service,
      });
    }

    for (const barber of barbers) {
      const { serviceIds, ...data } = barber;
      await prisma.barber.upsert({
        where: { id: barber.id },
        update: data,
        create: data,
      });

      await prisma.barberService.deleteMany({ where: { barberId: barber.id } });
      await prisma.barberService.createMany({
        data: serviceIds.map((serviceId) => ({
          barberId: barber.id,
          serviceId,
          isEnabled: true,
        })),
      });

      await prisma.workingHour.deleteMany({ where: { barberId: barber.id } });
      await prisma.break.deleteMany({ where: { barberId: barber.id } });
      await prisma.workingHour.createMany({
        data: openDays.map((weekday) => ({
          barberId: barber.id,
          weekday,
          startTime: clock(10),
          endTime: clock(21),
        })),
      });
      await prisma.break.createMany({
        data: openDays.map((weekday) => ({
          barberId: barber.id,
          weekday,
          startTime: clock(13),
          endTime: clock(14),
        })),
      });
    }

    for (const [key, value] of settings) {
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
