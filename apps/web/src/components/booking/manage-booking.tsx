"use client";

import Link from "next/link";
import { useState } from "react";
import { fetchDays, fetchSlots, tashkentStartIso, type DayOption, type SavedBooking } from "@/lib/booking-api";
import { formatDuration, formatPrice } from "@/lib/format";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ManageBooking({ initial }: { initial: SavedBooking }) {
  const [booking, setBooking] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [moving, setMoving] = useState(false);
  const [days, setDays] = useState<DayOption[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/bookings/${booking.manageToken}/cancel`, { method: "POST" });
      const body = (await response.json()) as { booking?: SavedBooking; error?: { message?: string } };
      if (!response.ok || !body.booking) {
        setMessage(body.error?.message ?? "Не удалось отменить");
        return;
      }
      setBooking(body.booking);
      setConfirmCancel(false);
      setMoving(false);
    } catch {
      setMessage("Не удалось отменить");
    } finally {
      setBusy(false);
    }
  }

  async function openMove() {
    setMoving(true);
    setMessage("");
    setDate(null);
    setTime(null);
    setSlots([]);
    try {
      setDays(await fetchDays(booking.services.map((service) => service.id), booking.barber.id));
    } catch {
      setMessage("Не удалось загрузить свободные дни");
    }
  }

  async function pickDate(next: string) {
    setDate(next);
    setTime(null);
    try {
      setSlots(await fetchSlots(booking.services.map((service) => service.id), booking.barber.id, next));
    } catch {
      setSlots([]);
      setMessage("Не удалось загрузить время");
    }
  }

  async function reschedule() {
    if (!date || !time) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/bookings/${booking.manageToken}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startsAt: tashkentStartIso(date, time) }),
      });
      const body = (await response.json()) as { booking?: SavedBooking; error?: { message?: string } };
      if (!response.ok || !body.booking) {
        setMessage(body.error?.message ?? "Не удалось перенести");
        return;
      }
      setBooking(body.booking);
      setMoving(false);
    } catch {
      setMessage("Не удалось перенести");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-[1.4rem] border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Запись</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">{formatWhen(booking.startsAt)}</h1>
      <p className="mt-3 text-sm text-muted">
        {booking.status === "confirmed" ? "Подтверждена" : booking.status === "cancelled" ? "Отменена" : booking.status}
      </p>
      <dl className="mt-6 space-y-3 text-sm">
        <Row label="Клиент" value={`${booking.client.name}, ${booking.client.phone}`} />
        <Row label="Услуги" value={booking.services.map((service) => service.name).join(", ")} />
        <Row label="Барбер" value={booking.barber.name} />
        <Row label="Длительность" value={formatDuration(booking.totalDurationMin)} />
        <Row label="Сумма" value={formatPrice(booking.totalPrice)} />
      </dl>
      {message ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {message}
        </p>
      ) : null}
      {booking.canChange ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {confirmCancel ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancel()}
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink"
            >
              Подтвердить отмену
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold"
            >
              Отменить
            </button>
          )}
          <button
            type="button"
            onClick={() => void openMove()}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold"
          >
            Перенести
          </button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Изменить эту запись уже нельзя.</p>
      )}
      {moving ? (
        <div className="mt-6">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {days.filter((day) => day.available).map((day) => (
              <button
                key={day.date}
                type="button"
                className="choice-card date-slot min-h-11 px-2 py-2 text-sm"
                aria-pressed={date === day.date}
                onClick={() => void pickDate(day.date)}
              >
                {day.date.slice(8)}.{day.date.slice(5, 7)}
              </button>
            ))}
          </div>
          {date ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="choice-card time-slot min-h-11 px-3 py-3 font-semibold"
                  aria-pressed={time === slot}
                  onClick={() => setTime(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!time || busy}
            onClick={() => void reschedule()}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            Сохранить новое время
          </button>
        </div>
      ) : null}
      {booking.telegramLink ? (
        <a href={booking.telegramLink} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold">
          Уведомления в Telegram
        </a>
      ) : null}
      <Link href="/" className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold">
        На главную
      </Link>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
