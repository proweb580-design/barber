"use client";

import { useEffect, useState } from "react";
import { Field, Notice, Panel, buttonClass, inputClass, quietButtonClass } from "@/components/admin/admin-ui";
import { barbers, createTimeOff, deleteTimeOff, errorText, timeOff, type AdminBarber, type TimeOffItem } from "@/lib/admin-api";
import { addDaysIso, formatSalonDateTime, todayIso } from "@/lib/datetime";
import { tashkentStartIso } from "@/lib/booking-api";

const TYPES: { id: TimeOffItem["type"]; label: string }[] = [
  { id: "day_off", label: "Выходной" },
  { id: "vacation", label: "Отпуск" },
  { id: "sick", label: "Больничный" },
  { id: "closure", label: "Салон закрыт" },
];

export default function AdminTimeOffPage() {
  const [rows, setRows] = useState<TimeOffItem[]>([]);
  const [people, setPeople] = useState<AdminBarber[]>([]);
  const [type, setType] = useState<TimeOffItem["type"]>("day_off");
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("21:00");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const from = addDaysIso(todayIso(), -7);
    const to = addDaysIso(todayIso(), 90);
    const [items, barberList] = await Promise.all([timeOff(from, to), barbers()]);
    setRows(items.items);
    setPeople(barberList.barbers);
    if (!barberId && barberList.barbers[0]) setBarberId(barberList.barbers[0].id);
  }

  useEffect(() => {
    let cancelled = false;
    const from = addDaysIso(todayIso(), -7);
    const to = addDaysIso(todayIso(), 90);
    Promise.all([timeOff(from, to), barbers()])
      .then(([items, barberList]) => {
        if (cancelled) return;
        setRows(items.items);
        setPeople(barberList.barbers);
        const first = barberList.barbers[0];
        if (first) setBarberId((current) => current || first.id);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      await createTimeOff({
        barberId: type === "closure" ? null : barberId,
        type,
        note,
        startsAt: tashkentStartIso(date, start),
        endsAt: tashkentStartIso(date, end),
      });
      setNote("");
      await load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-5xl leading-none">Исключения</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Выходной, отпуск, больничный или закрытие салона убирают слоты из записи.</p>
      </div>
      {message ? <Notice>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Field label="Тип">
            <select className={inputClass} value={type} onChange={(event) => setType(event.target.value as TimeOffItem["type"])}>
              {TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          {type === "closure" ? null : (
            <Field label="Барбер">
              <select className={inputClass} value={barberId} onChange={(event) => setBarberId(event.target.value)}>
                {people.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Дата">
              <input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="С">
              <input className={inputClass} type="time" value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field label="До">
              <input className={inputClass} type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
            </Field>
          </div>
          <Field label="Заметка">
            <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <button className={buttonClass} type="submit" disabled={pending}>Добавить исключение</button>
        </form>
      </Panel>
      {rows.length === 0 ? <Panel><p>Ближайших исключений нет.</p></Panel> : null}
      <ul className="grid gap-3">
        {rows.map((item) => (
          <li key={item.id}>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p>{TYPES.find((typeItem) => typeItem.id === item.type)?.label}</p>
                  <p className="text-sm text-muted">{item.barberName ?? "Весь салон"}</p>
                  <p className="text-sm text-muted">{formatSalonDateTime(item.startsAt)} до {formatSalonDateTime(item.endsAt)}</p>
                  {item.note ? <p className="mt-1 text-sm">{item.note}</p> : null}
                </div>
                <button type="button" className={quietButtonClass} onClick={() => void deleteTimeOff(item.id).then(() => load()).catch((error: unknown) => setMessage(errorText(error)))}>
                  Удалить
                </button>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
