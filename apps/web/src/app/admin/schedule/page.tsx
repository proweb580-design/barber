"use client";

import { useEffect, useState } from "react";
import { Field, Notice, Panel, Status, buttonClass, inputClass } from "@/components/admin/admin-ui";
import { barbers, errorText, saveSchedule, type AdminBarber } from "@/lib/admin-api";

const DAYS = [
  { weekday: 1, label: "Понедельник" },
  { weekday: 2, label: "Вторник" },
  { weekday: 3, label: "Среда" },
  { weekday: 4, label: "Четверг" },
  { weekday: 5, label: "Пятница" },
  { weekday: 6, label: "Суббота" },
  { weekday: 0, label: "Воскресенье" },
];

type DayDraft = {
  weekday: number;
  label: string;
  open: boolean;
  start: string;
  end: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
};

function draftsFrom(barber: AdminBarber | undefined): DayDraft[] {
  return DAYS.map((day) => {
    const hour = barber?.hours.find((item) => item.weekday === day.weekday);
    const pause = barber?.breaks.find((item) => item.weekday === day.weekday);
    return {
      weekday: day.weekday,
      label: day.label,
      open: Boolean(hour),
      start: hour?.start ?? "10:00",
      end: hour?.end ?? "21:00",
      hasBreak: Boolean(pause),
      breakStart: pause?.start ?? "13:00",
      breakEnd: pause?.end ?? "14:00",
    };
  });
}

export default function AdminSchedulePage() {
  const [rows, setRows] = useState<AdminBarber[]>([]);
  const [barberId, setBarberId] = useState("");
  const [days, setDays] = useState<DayDraft[]>(draftsFrom(undefined));
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    barbers()
      .then((result) => {
        if (cancelled) return;
        setRows(result.barbers);
        const first = result.barbers[0];
        if (first) {
          setBarberId(first.id);
          setDays(draftsFrom(first));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(id: string) {
    setBarberId(id);
    setDays(draftsFrom(rows.find((row) => row.id === id)));
  }

  function update(weekday: number, patch: Partial<DayDraft>) {
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!barberId) return;
    setPending(true);
    setMessage("");
    setSaved("");
    try {
      await saveSchedule(
        barberId,
        days.filter((day) => day.open).map((day) => ({ weekday: day.weekday, start: day.start, end: day.end })),
        days.filter((day) => day.open && day.hasBreak).map((day) => ({ weekday: day.weekday, start: day.breakStart, end: day.breakEnd })),
      );
      const fresh = await barbers();
      setRows(fresh.barbers);
      setSaved("График сохранён");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-5xl leading-none">График</h1>
      <Field label="Барбер">
        <select className={inputClass} value={barberId} onChange={(event) => choose(event.target.value)}>
          {rows.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
        </select>
      </Field>
      {message ? <Notice>{message}</Notice> : null}
      {saved ? <Status>{saved}</Status> : null}
      <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
        {days.map((day) => (
          <Panel key={day.weekday}>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={day.open} onChange={(event) => update(day.weekday, { open: event.target.checked })} />
              {day.label}
            </label>
            {day.open ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Смена с">
                  <input className={inputClass} type="time" value={day.start} onChange={(event) => update(day.weekday, { start: event.target.value })} />
                </Field>
                <Field label="Смена до">
                  <input className={inputClass} type="time" value={day.end} onChange={(event) => update(day.weekday, { end: event.target.value })} />
                </Field>
                <Field label="Обед с">
                  <input className={inputClass} type="time" value={day.breakStart} disabled={!day.hasBreak} onChange={(event) => update(day.weekday, { breakStart: event.target.value })} />
                </Field>
                <Field label="Обед до">
                  <input className={inputClass} type="time" value={day.breakEnd} disabled={!day.hasBreak} onChange={(event) => update(day.weekday, { breakEnd: event.target.value })} />
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={day.hasBreak} onChange={(event) => update(day.weekday, { hasBreak: event.target.checked })} />
                  Есть обед
                </label>
              </div>
            ) : <p className="mt-2 text-sm text-muted">Выходной</p>}
          </Panel>
        ))}
        <button className={buttonClass} type="submit" disabled={pending || !barberId}>Сохранить график</button>
      </form>
    </div>
  );
}
