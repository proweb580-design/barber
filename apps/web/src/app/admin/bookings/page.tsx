"use client";

import { useEffect, useState } from "react";
import { Field, Notice, Panel, buttonClass, inputClass, quietButtonClass } from "@/components/admin/admin-ui";
import {
  barbers,
  bookings,
  createAdminBooking,
  errorText,
  patchBooking,
  services,
  staffSlots,
  type AdminBarber,
  type AdminBooking,
  type AdminService,
} from "@/lib/admin-api";
import { addDaysIso, formatSalonDateTime, todayIso } from "@/lib/datetime";
import { formatPrice, isValidName, isValidPhone, normalizePhone } from "@/lib/format";
import { tashkentStartIso } from "@/lib/booking-api";

const STATUS = [
  { id: "confirmed", label: "Подтверждена" },
  { id: "completed", label: "Завершена" },
  { id: "cancelled", label: "Отменена" },
  { id: "no_show", label: "Неявка" },
] as const;

const SOURCE: Record<string, string> = { web: "сайт", telegram: "Telegram", admin: "админка" };

export default function AdminBookingsPage() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDaysIso(todayIso(), 14));
  const [rows, setRows] = useState<AdminBooking[]>([]);
  const [serviceRows, setServiceRows] = useState<AdminService[]>([]);
  const [barberRows, setBarberRows] = useState<AdminBarber[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState(todayIso());
  const [moveTime, setMoveTime] = useState("");
  const [moveSlots, setMoveSlots] = useState<string[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);

  async function load(nextFrom = from, nextTo = to) {
    const result = await bookings(nextFrom, nextTo);
    setRows(result.bookings);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([bookings(from, to), services(), barbers()])
      .then(([list, serviceList, barberList]) => {
        if (cancelled) return;
        setRows(list.bookings);
        setServiceRows(serviceList.services);
        setBarberRows(barberList.barbers.filter((item) => item.isActive));
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  useEffect(() => {
    if (!open || !barberId || serviceIds.length === 0) return;
    let cancelled = false;
    staffSlots(serviceIds, barberId, date)
      .then((result) => {
        if (!cancelled) setSlots(result.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, barberId, serviceIds, date]);

  useEffect(() => {
    const row = rows.find((item) => item.id === moving);
    if (!row) return;
    let cancelled = false;
    staffSlots(row.services.map((service) => service.id), row.barber.id, moveDate)
      .then((result) => {
        if (!cancelled) setMoveSlots(result.slots);
      })
      .catch(() => {
        if (!cancelled) setMoveSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [moving, moveDate, rows]);

  function toggleService(id: string) {
    setServiceIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setTime("");
    setSlots([]);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!isValidName(name) || !isValidPhone(phone) || !barberId || !time || serviceIds.length === 0) {
      setMessage("Проверьте имя, телефон +998, услуги и время");
      return;
    }
    setPending(true);
    try {
      await createAdminBooking({
        serviceIds,
        barberId,
        startsAt: tashkentStartIso(date, time),
        client: { name: name.trim(), phone: normalizePhone(phone) },
      });
      setOpen(false);
      setName("");
      setPhone("");
      setTime("");
      await load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(id: string, status: string) {
    setMessage("");
    try {
      await patchBooking(id, { status });
      await load();
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function move(id: string) {
    if (!moveTime) return;
    setPending(true);
    setMessage("");
    try {
      await patchBooking(id, { startsAt: tashkentStartIso(moveDate, moveTime) });
      setMoving(null);
      await load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  const activeServices = serviceRows.filter((service) => service.isActive);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-5xl leading-none">Записи</h1>
        <button type="button" className={buttonClass} onClick={() => setOpen((value) => !value)}>
          {open ? "Закрыть форму" : "Новая запись"}
        </button>
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
      {open ? (
        <Panel>
          <form className="grid gap-4" onSubmit={(event) => void create(event)}>
            <Field label="Имя">
              <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Телефон">
              <input className={inputClass} inputMode="tel" placeholder="+998" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-sm text-muted">Услуги</legend>
              {activeServices.map((service) => (
                <label key={service.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                  {service.name}
                </label>
              ))}
            </fieldset>
            <Field label="Барбер">
              <select className={inputClass} value={barberId} onChange={(event) => { setBarberId(event.target.value); setTime(""); setSlots([]); }}>
                <option value="">Выберите</option>
                {barberRows.map((barber) => (
                  <option key={barber.id} value={barber.id}>{barber.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата">
                <input className={inputClass} type="date" value={date} onChange={(event) => { setDate(event.target.value); setTime(""); setSlots([]); }} />
              </Field>
              <Field label="Время">
                <select className={inputClass} value={time} onChange={(event) => setTime(event.target.value)}>
                  <option value="">{slots.length ? "Выберите" : "Нет свободных слотов"}</option>
                  {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                </select>
              </Field>
            </div>
            <button className={buttonClass} type="submit" disabled={pending}>Записать</button>
          </form>
        </Panel>
      ) : null}
      {rows.length === 0 ? <Panel><p>В этом периоде записей нет.</p></Panel> : null}
      <ol className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-3xl leading-none">{formatSalonDateTime(row.startsAt)}</p>
                <p className="text-sm text-muted">{SOURCE[row.source ?? ""] ?? row.source}</p>
              </div>
              <p className="mt-3">{row.client.name}, {row.client.phone}</p>
              <p className="text-sm text-muted">{row.barber.name}</p>
              <p className="text-sm text-muted">{row.services.map((service) => service.name).join(", ")}</p>
              <p className="mt-1 text-sm">{formatPrice(row.totalPrice)}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Статус">
                  <select className={inputClass} value={row.status} onChange={(event) => void changeStatus(row.id, event.target.value)}>
                    {STATUS.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                </Field>
                {row.status === "confirmed" ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={quietButtonClass} onClick={() => { setMoving(moving === row.id ? null : row.id); setMoveDate(todayIso()); setMoveTime(""); setMoveSlots([]); }}>
                      Перенести
                    </button>
                    {cancelId === row.id ? (
                      <button type="button" className={buttonClass} onClick={() => void changeStatus(row.id, "cancelled").then(() => setCancelId(null))}>
                        Подтвердить отмену
                      </button>
                    ) : (
                      <button type="button" className={quietButtonClass} onClick={() => setCancelId(row.id)}>Отменить</button>
                    )}
                  </div>
                ) : null}
              </div>
              {moving === row.id ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Новая дата">
                    <input className={inputClass} type="date" value={moveDate} onChange={(event) => { setMoveDate(event.target.value); setMoveTime(""); setMoveSlots([]); }} />
                  </Field>
                  <Field label="Новое время">
                    <select className={inputClass} value={moveTime} onChange={(event) => setMoveTime(event.target.value)}>
                      <option value="">{moveSlots.length ? "Выберите" : "Нет свободных слотов"}</option>
                      {moveSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                    </select>
                  </Field>
                  <button type="button" className={buttonClass} disabled={pending || !moveTime} onClick={() => void move(row.id)}>Сохранить перенос</button>
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ol>
    </div>
  );
}
