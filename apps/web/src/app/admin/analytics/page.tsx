"use client";

import { useEffect, useState } from "react";
import { Field, Notice, Panel, inputClass } from "@/components/admin/admin-ui";
import { analytics, errorText, type AnalyticsReport } from "@/lib/admin-api";
import { addDaysIso, todayIso } from "@/lib/datetime";
import { formatPrice } from "@/lib/format";

const DAYS = [
  { weekday: 1, label: "Пн" },
  { weekday: 2, label: "Вт" },
  { weekday: 3, label: "Ср" },
  { weekday: 4, label: "Чт" },
  { weekday: 5, label: "Пт" },
  { weekday: 6, label: "Сб" },
  { weekday: 0, label: "Вс" },
];

function formatPercent(value: number | null) {
  if (value === null) return "нет базы";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function heatClass(count: number, max: number) {
  if (count === 0 || max === 0) return "bg-bg text-transparent";
  const level = Math.ceil((count / max) * 4);
  if (level >= 4) return "bg-accent text-accent-ink";
  if (level === 3) return "bg-accent/70 text-ink";
  if (level === 2) return "bg-accent/40 text-ink";
  return "bg-accent/20 text-ink";
}

export default function AdminAnalyticsPage() {
  const [from, setFrom] = useState(() => addDaysIso(todayIso(), -29));
  const [to, setTo] = useState(() => todayIso());
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    analytics(from, to)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const hours = [...new Set(report?.heatmap.map((cell) => cell.hour) ?? [])].sort((a, b) => a - b);
  const maxHeat = Math.max(0, ...(report?.heatmap.map((cell) => cell.count) ?? []));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-5xl leading-none">Аналитика</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Выручка и услуги считаются по завершённым визитам. Загрузка и карта часов берут подтверждённые и завершённые. Отмены и неявки входят в общее число записей.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="С">
          <input className={inputClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="По">
          <input className={inputClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
      {message ? <Notice>{message}</Notice> : null}
      {!report && !message ? <p className="text-sm text-muted">Считаем период</p> : null}
      {report ? (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">Выручка</dt>
              <dd className="font-display text-4xl leading-none">{formatPrice(report.revenue)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Записей</dt>
              <dd className="font-display text-4xl leading-none">{report.bookings.total}</dd>
              <dd className="mt-1 text-sm text-muted">завершено {report.bookings.completed}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Отмены</dt>
              <dd className="font-display text-4xl leading-none">{report.cancellations.count}</dd>
              <dd className="mt-1 text-sm text-muted">{formatPercent(report.cancellations.rate)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Неявки</dt>
              <dd className="font-display text-4xl leading-none">{report.noShows.count}</dd>
              <dd className="mt-1 text-sm text-muted">{formatPercent(report.noShows.rate)}</dd>
            </div>
          </dl>

          <Panel>
            <h2 className="font-display text-3xl leading-none">Услуги</h2>
            {report.services.length === 0 ? <p className="mt-3 text-sm text-muted">Завершённых услуг в периоде нет.</p> : null}
            <ul className="mt-4 grid gap-3">
              {report.services.map((service) => (
                <li key={service.serviceId} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{service.name}</span>
                  <span className="text-sm text-muted">{service.count} раз, {formatPrice(service.revenue)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <h2 className="font-display text-3xl leading-none">Загрузка</h2>
            <p className="mt-2 text-sm text-muted">Минуты визитов к минутам смены без обеда и исключений.</p>
            <ul className="mt-4 grid gap-4">
              {report.load.map((row) => (
                <li key={row.barberId}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>{row.name}</span>
                    <span className="text-sm text-muted">{row.bookedMin} из {row.availableMin} мин, {formatPercent(row.loadPercent)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-line">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(row.loadPercent ?? 0, 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <h2 className="font-display text-3xl leading-none">Возвращаемость</h2>
            <p className="mt-3 max-w-xl">
              Клиентов с завершённым визитом: {report.retention.clients}. Из них уже были раньше: {report.retention.returning}. Это {formatPercent(report.retention.rate)}.
            </p>
          </Panel>

          <Panel>
            <h2 className="font-display text-3xl leading-none">Часы</h2>
            <p className="mt-2 text-sm text-muted">Сколько визитов началось в этот час по ташкентскому времени.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-center text-xs">
                <thead>
                  <tr>
                    <th className="w-8" />
                    {hours.map((hour) => (
                      <th key={hour} className="min-w-9 px-1 font-normal text-muted">{hour}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <tr key={day.weekday}>
                      <th className="pr-1 text-left font-normal text-muted">{day.label}</th>
                      {hours.map((hour) => {
                        const count = report.heatmap.find((cell) => cell.weekday === day.weekday && cell.hour === hour)?.count ?? 0;
                        return (
                          <td key={hour} aria-label={`${day.label} ${hour}:00, записей ${count}`} className={`min-w-9 rounded-md py-2 ${heatClass(count, maxHeat)}`}>
                            {count || ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
