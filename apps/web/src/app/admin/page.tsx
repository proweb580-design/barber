"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/admin/admin-ui";
import { bookings, errorText, type AdminBooking } from "@/lib/admin-api";
import { formatSalonTime, todayIso } from "@/lib/datetime";
import { formatPrice } from "@/lib/format";

const STATUS: Record<string, string> = {
  confirmed: "подтверждена",
  completed: "завершена",
  cancelled: "отменена",
  no_show: "неявка",
};

export default function AdminTodayPage() {
  const [rows, setRows] = useState<AdminBooking[] | null>(null);
  const [message, setMessage] = useState("");
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    bookings(today, today)
      .then((result) => {
        if (!cancelled) setRows(result.bookings);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const active = rows?.filter((row) => row.status !== "cancelled") ?? [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl leading-none">Сегодня</h1>
          <p className="mt-2 text-sm text-muted">{active.length ? `${active.length} визитов без отмен` : "Живая лента смены"}</p>
        </div>
        <Link href="/admin/bookings" className="text-sm font-semibold underline decoration-accent underline-offset-4">
          Все записи
        </Link>
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {rows && rows.length === 0 ? <Panel><p>На сегодня записей нет.</p></Panel> : null}
      <ol className="grid gap-3">
        {rows?.map((row) => (
          <li key={row.id}>
            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-4xl leading-none">{formatSalonTime(row.startsAt)}</p>
                <p className="text-sm text-muted">{STATUS[row.status] ?? row.status}</p>
              </div>
              <p className="mt-3 text-lg">{row.client.name}</p>
              <p className="text-sm text-muted">{row.barber.name}</p>
              <p className="text-sm text-muted">{row.services.map((service) => service.name).join(", ")}</p>
              <p className="mt-2 text-sm">{formatPrice(row.totalPrice)}</p>
            </Panel>
          </li>
        ))}
      </ol>
    </div>
  );
}
