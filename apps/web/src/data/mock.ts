export type Review = {
  id: string;
  author: string;
  rating: number;
  comment: string;
  service: string;
};

export const salon = {
  name: "Кромка",
  city: "Ташкент",
  address: "ул. Бабура, 16",
  phone: "+998 71 200 15 24",
  phoneHref: "tel:+998712001524",
  hours: "ежедневно 10:00–21:00",
  mapUrl:
    "https://yandex.uz/maps/?text=%D0%A2%D0%B0%D1%88%D0%BA%D0%B5%D0%BD%D1%82%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%91%D0%B0%D0%B1%D1%83%D1%80%D0%B0%2016",
  mapEmbed:
    "https://www.openstreetmap.org/export/embed.html?bbox=69.271%2C41.286%2C69.291%2C41.306&layer=mapnik&marker=41.296%2C69.281",
};

export const reviews: Review[] = [
  {
    id: "r1",
    author: "Марат",
    rating: 5,
    comment: "Записался с телефона за минуту. Стрижка села так, как обсудили, без сюрприза в зеркале.",
    service: "Стрижка",
  },
  {
    id: "r2",
    author: "Фаррух",
    rating: 5,
    comment: "Сардор повторил форму с фотографии. Борода стала аккуратнее, а не короче, чем просил.",
    service: "Стрижка и борода",
  },
  {
    id: "r3",
    author: "Алишер",
    rating: 4,
    comment: "Пришёл без записи в прошлый раз и ждал. Сейчас беру слот заранее — так спокойнее.",
    service: "Оформление бороды",
  },
  {
    id: "r4",
    author: "Нодир",
    rating: 5,
    comment: "Ильхом сделал бритьё без раздражения. Напомнили о визите, я не забыл.",
    service: "Королевское бритьё",
  },
];

export const anyBarberId = "any";
