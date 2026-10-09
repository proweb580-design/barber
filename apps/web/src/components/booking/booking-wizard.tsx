"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { anyBarberId } from "@/data/mock";
import { fetchDays, fetchSlots, tashkentStartIso, type DayOption, type SavedBooking } from "@/lib/booking-api";
import { barberInitials, barberTone, type Barber, type Service } from "@/lib/catalog";
import { formatDateLabel, formatMonthShort, formatWeekday } from "@/lib/datetime";
import { formatDuration, formatPrice, isValidName, isValidPhone, normalizePhone } from "@/lib/format";

const STEPS = [
  { id: "service", label: "Услуга" },
  { id: "barber", label: "Барбер" },
  { id: "date", label: "Дата" },
  { id: "time", label: "Время" },
  { id: "contacts", label: "Контакты" },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type SlotStatus = "loading" | "ready" | "empty" | "error";

const STEP_TITLES: Record<StepId, string> = {
  service: "Какая услуга нужна?",
  barber: "К кому записаться?",
  date: "Какой день удобен?",
  time: "Во сколько прийти?",
  contacts: "Как с вами связаться?",
};

export function BookingWizard({ services, barbers }: { services: Service[]; barbers: Barber[] }) {
  const params = useSearchParams();
  const preset = params.get("service");
  const presetId = preset && services.some((service) => service.id === preset) ? preset : null;
  const requestId = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipStepScroll = useRef(true);

  const [step, setStep] = useState<StepId | "done">("service");
  const [serviceIds, setServiceIds] = useState<string[] | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotStatus, setSlotStatus] = useState<SlotStatus>("loading");
  const [slotMessage, setSlotMessage] = useState("");
  const [days, setDays] = useState<DayOption[]>([]);
  const [dayStatus, setDayStatus] = useState<SlotStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedBooking | null>(null);

  const selectedIds = serviceIds ?? (presetId ? [presetId] : []);
  const selectedServices = services.filter((service) => selectedIds.includes(service.id));
  const totalPrice = selectedServices.reduce((sum, service) => sum + service.price, 0);
  const totalDuration = selectedServices.reduce((sum, service) => sum + service.durationMin, 0);
  const barber = barbers.find((item) => item.id === barberId);
  const stepIndex = step === "done" ? STEPS.length : STEPS.findIndex((item) => item.id === step);

  useEffect(() => {
    if (skipStepScroll.current) {
      skipStepScroll.current = false;
      return;
    }
    headingRef.current?.scrollIntoView({ block: "start" });
  }, [step]);

  function requestSlots(nextDate: string) {
    const id = requestId.current + 1;
    requestId.current = id;
    setSlotStatus("loading");
    setSlots([]);

    const barber = barberId;
    if (!barber) return;
    fetchSlots(selectedIds, barber, nextDate)
      .then((nextSlots) => {
        if (requestId.current !== id) {
          return;
        }
        setSlots(nextSlots);
        setSlotStatus(nextSlots.length ? "ready" : "empty");
      })
      .catch(() => {
        if (requestId.current !== id) {
          return;
        }
        setSlots([]);
        setSlotStatus("error");
      });
  }

  function toggleService(id: string) {
    setServiceIds((current) => {
      const base = current ?? (presetId ? [presetId] : []);
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    });
  }

  function loadDays() {
    if (!barberId || selectedIds.length === 0) return;
    setDayStatus("loading");
    fetchDays(selectedIds, barberId)
      .then((nextDays) => {
        setDays(nextDays);
        setDayStatus(nextDays.length ? "ready" : "empty");
      })
      .catch(() => {
        setDays([]);
        setDayStatus("error");
      });
  }

  function selectDate(nextDate: string) {
    setDate(nextDate);
    setTime(null);
    requestSlots(nextDate);
  }

  async function goNext() {
    if (step === "contacts") {
      const nextNameError = isValidName(name) ? "" : "Введите имя, минимум 2 буквы";
      const nextPhoneError = isValidPhone(phone) ? "" : "Нужен номер Узбекистана: +998 и 9 цифр";
      setNameError(nextNameError);
      setPhoneError(nextPhoneError);
      if (nextNameError || nextPhoneError || !barberId || !date || !time) {
        if (nextNameError || nextPhoneError) {
          document.getElementById(nextNameError ? "client-name" : "client-phone")?.focus();
        }
        return;
      }
      setSaving(true);
      setSlotMessage("");
      try {
        const response = await fetch("/api/v1/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            serviceIds: selectedIds,
            barberId,
            startsAt: tashkentStartIso(date, time),
            client: { name: name.trim(), phone: normalizePhone(phone) },
          }),
        });
        const body = (await response.json().catch(() => null)) as { booking?: SavedBooking; error?: { code?: string; message?: string } } | null;
        if (response.status === 409 || body?.error?.code === "SLOT_TAKEN") {
          setSlotMessage("Это время уже заняли. Выберите другое.");
          setStep("time");
          requestSlots(date);
          return;
        }
        if (!response.ok || !body?.booking) {
          setSlotMessage(body?.error?.message ?? "Не удалось сохранить запись");
          return;
        }
        setSaved(body.booking);
        setStep("done");
      } catch {
        setSlotMessage("Не удалось сохранить запись");
      } finally {
        setSaving(false);
      }
      return;
    }

    const next = STEPS[stepIndex + 1];
    if (next) {
      if (next.id === "date") loadDays();
      setStep(next.id);
    }
  }

  function goBack() {
    const previous = STEPS[stepIndex - 1];
    if (previous) {
      setStep(previous.id);
    }
  }

  function restart() {
    setStep("service");
    setServiceIds([]);
    setBarberId(null);
    setDate(null);
    setTime(null);
    setName("");
    setPhone("");
    setNameError("");
    setPhoneError("");
  }

  if (step === "done" && saved) {
    return <Confirmation booking={saved} onRestart={restart} />;
  }

  const canContinue =
    (step === "service" && selectedIds.length > 0) ||
    (step === "barber" && Boolean(barberId)) ||
    (step === "date" && Boolean(date)) ||
    (step === "time" && Boolean(time) && slotStatus === "ready") ||
    step === "contacts";

  return (
    <>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
      <section className="order-2 lg:order-1">
        <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Шаги записи">
          {STEPS.map((item, index) => {
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  className={`min-h-11 rounded-full px-3 text-sm ${active ? "bg-ink text-bg" : "text-muted"} ${done ? "underline decoration-accent underline-offset-4" : ""}`}
                  onClick={() => {
                    if (done) {
                      setStep(item.id);
                    }
                  }}
                  disabled={!done && !active}
                  aria-current={active ? "step" : undefined}
                >
                  {index + 1}. {item.label}
                </button>
              </li>
            );
          })}
        </ol>

        <h1 ref={headingRef} className="display mt-6 scroll-mt-24 text-4xl sm:text-5xl">
          {step === "done" ? "" : STEP_TITLES[step]}
        </h1>

        <div className="mt-6">
          {step === "service" ? (
            <ServiceStep services={services} serviceIds={selectedIds} onToggle={toggleService} />
          ) : null}
          {step === "barber" ? (
            <BarberStep barbers={barbers} barberId={barberId} onSelect={setBarberId} />
          ) : null}
          {step === "date" ? (
            <DateStep status={dayStatus} days={days} date={date} onSelect={selectDate} onRetry={loadDays} />
          ) : null}
          {step === "time" ? (
            <TimeStep
              status={slotStatus}
              slots={slots}
              time={time}
              notice={slotMessage}
              onSelect={(value) => {
                setSlotMessage("");
                setTime(value);
              }}
              onRetry={() => {
                if (date) {
                  requestSlots(date);
                }
              }}
            />
          ) : null}
          {step === "contacts" ? (
            <ContactsStep
              name={name}
              phone={phone}
              nameError={nameError}
              phoneError={phoneError}
              onName={(value) => {
                setName(value);
                setNameError("");
              }}
              onPhone={(value) => {
                setPhone(value);
                setPhoneError("");
              }}
            />
          ) : null}
        </div>
        {slotMessage && step === "contacts" ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {slotMessage}
          </p>
        ) : null}

        <div className="mt-8 hidden flex-wrap gap-3 lg:flex">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold"
            >
              Назад
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold"
            >
              На главную
            </Link>
          )}
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!canContinue || saving}
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Сохраняем…" : step === "contacts" ? "Подтвердить" : "Дальше"}
          </button>
        </div>
      </section>

      <Summary
        services={selectedServices}
        barberName={barberId === anyBarberId ? "Любой свободный" : barber?.name}
        date={date}
        time={time}
        totalDuration={totalDuration}
        totalPrice={totalPrice}
      />
    </div>
    <div className="booking-dock fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
      <div className="mx-auto flex w-full max-w-6xl gap-3">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold"
          >
            Назад
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void goNext()}
          disabled={!canContinue || saving}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Сохраняем…" : step === "contacts" ? "Подтвердить" : "Дальше"}
        </button>
      </div>
    </div>
    </>
  );
}

function ServiceStep({
  services,
  serviceIds,
  onToggle,
}: {
  services: Service[];
  serviceIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted">Можно выбрать несколько услуг. Длительность и цена сложатся.</p>
      <div className="grid gap-3">
        {services.map((service) => {
          const selected = serviceIds.includes(service.id);
          return (
            <button
              key={service.id}
              type="button"
              className="choice-card min-h-11 px-4 py-4"
              aria-pressed={selected}
              onClick={() => onToggle(service.id)}
            >
              <span className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <span>
                  <span className="block font-semibold">{service.name}</span>
                  <span className="mt-1 block text-sm text-muted">{service.description}</span>
                </span>
                <span className="shrink-0 text-sm">
                  <span className="price font-semibold">{formatPrice(service.price)}</span>
                  <span className="mt-1 block text-muted">{formatDuration(service.durationMin)}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BarberStep({
  barbers,
  barberId,
  onSelect,
}: {
  barbers: Barber[];
  barberId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="choice-card min-h-11 px-4 py-4"
        aria-pressed={barberId === anyBarberId}
        onClick={() => onSelect(anyBarberId)}
      >
        <span className="block font-semibold">Любой свободный</span>
        <span className="mt-1 block text-sm text-muted">
          Покажем время, которое свободно хотя бы у одного мастера.
        </span>
      </button>
      {barbers.map((barber, index) => (
        <button
          key={barber.id}
          type="button"
          className="choice-card min-h-11 overflow-hidden p-0"
          aria-pressed={barberId === barber.id}
          onClick={() => onSelect(barber.id)}
        >
          <span className="flex min-h-24">
            <span
              className="flex w-20 shrink-0 items-end p-3 text-white"
              style={{ background: `linear-gradient(160deg, ${barberTone(index)}, #1a1714 85%)` }}
            >
              <span className="display text-3xl">{barberInitials(barber.name)}</span>
            </span>
            <span className="px-4 py-3 text-left">
              <span className="flex items-start justify-between gap-3">
                <span className="font-semibold">{barber.name}</span>
                {barber.rating != null ? (
                  <span className="text-sm font-semibold text-accent">{barber.rating.toFixed(1)}</span>
                ) : null}
              </span>
              <span className="mt-1 block text-sm text-muted">{barber.experienceYears} лет в кресле</span>
              <span className="mt-2 block text-sm text-muted">{barber.bio}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function DateStep({
  status,
  days,
  date,
  onSelect,
  onRetry,
}: {
  status: SlotStatus;
  days: DayOption[];
  date: string | null;
  onSelect: (value: string) => void;
  onRetry: () => void;
}) {
  if (status === "loading") return <p className="text-sm text-muted">Смотрим свободные дни…</p>;
  if (status === "error") {
    return (
      <div className="rounded-[1.1rem] border border-line bg-surface p-5" role="alert">
        <p className="font-semibold">Не удалось загрузить дни</p>
        <button type="button" className="mt-4 min-h-11 text-sm font-semibold text-accent" onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }
  if (days.every((day) => !day.available)) {
    return <p className="text-sm text-muted">В ближайшие дни нет окна на выбранные услуги.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          className="choice-card date-slot min-h-16 px-2 py-3 disabled:opacity-40"
          aria-pressed={date === day.date}
          disabled={!day.available}
          onClick={() => onSelect(day.date)}
        >
          <span className="block text-xs text-muted uppercase">{formatWeekday(day.date)}</span>
          <span className="mt-1 block text-lg font-semibold leading-none">{Number(day.date.slice(8))}</span>
          <span className="mt-1 block text-xs text-muted">{formatMonthShort(day.date)}</span>
          {day.available ? null : <span className="mt-1 block text-xs text-muted">нет времени</span>}
        </button>
      ))}
    </div>
  );
}

function TimeStep({
  status,
  slots,
  time,
  notice,
  onSelect,
  onRetry,
}: {
  status: SlotStatus;
  slots: string[];
  time: string | null;
  notice: string;
  onSelect: (value: string) => void;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <div aria-live="polite">
        <p className="mb-3 text-sm text-muted">Смотрим свободное время…</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {MOCK_PLACEHOLDERS.map((item) => (
            <div key={item} className="h-11 animate-pulse rounded-xl bg-line" />
          ))}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-[1.1rem] border border-line bg-surface p-5" role="alert">
        <p className="font-semibold">Не удалось загрузить свободное время</p>
        <p className="mt-2 text-sm text-muted">Проверьте соединение и повторите запрос.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-[1.1rem] border border-dashed border-line bg-surface p-5" role="status">
        <p className="font-semibold">В этот день нет свободного времени</p>
        <p className="mt-2 text-sm text-muted">Выберите другую дату.</p>
      </div>
    );
  }

  return (
    <div>
      {notice ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {notice}
        </p>
      ) : null}
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-live="polite">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          className="choice-card time-slot min-h-11 px-3 py-3 font-semibold"
          aria-pressed={time === slot}
          onClick={() => onSelect(slot)}
        >
          {slot}
        </button>
      ))}
    </div>
    </div>
  );
}

const MOCK_PLACEHOLDERS = ["a", "b", "c", "d", "e"];

function ContactsStep({
  name,
  phone,
  nameError,
  phoneError,
  onName,
  onPhone,
}: {
  name: string;
  phone: string;
  nameError: string;
  phoneError: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:max-w-md">
      <label className="text-sm font-medium" htmlFor="client-name">
        Имя
        <input
          id="client-name"
          name="name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          autoComplete="name"
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? "client-name-error" : undefined}
        />
      </label>
      {nameError ? (
        <p id="client-name-error" className="text-sm text-danger" aria-live="polite">
          {nameError}
        </p>
      ) : null}
      <label className="text-sm font-medium" htmlFor="client-phone">
        Телефон
        <input
          id="client-phone"
          name="tel"
          type="tel"
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          autoComplete="tel"
          inputMode="tel"
          placeholder="+998 90 123 45 67"
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal"
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? "client-phone-error" : undefined}
        />
      </label>
      {phoneError ? (
        <p id="client-phone-error" className="text-sm text-danger" aria-live="polite">
          {phoneError}
        </p>
      ) : null}
    </div>
  );
}

function Summary({
  services: selected,
  barberName,
  date,
  time,
  totalDuration,
  totalPrice,
}: {
  services: { id: string; name: string }[];
  barberName?: string;
  date: string | null;
  time: string | null;
  totalDuration: number;
  totalPrice: number;
}) {
  const when = date && time ? `${formatDateLabel(date)}, ${time}` : date ? formatDateLabel(date) : null;

  return (
    <aside className="order-1 rounded-[1.2rem] border border-line bg-surface p-4 lg:sticky lg:top-24 lg:order-2 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-muted uppercase">Ваша запись</h2>
        <p className="price text-sm font-semibold lg:hidden">{totalPrice ? formatPrice(totalPrice) : "—"}</p>
      </div>
      <p className="mt-2 text-sm text-muted lg:hidden">
        {[
          selected.length ? selected.map((service) => service.name).join(", ") : null,
          barberName,
          when,
        ]
          .filter(Boolean)
          .join(" · ") || "Услуга, барбер и время появятся здесь"}
      </p>
      <dl className="mt-4 hidden space-y-3 text-sm lg:block">
        <div>
          <dt className="text-muted">Услуги</dt>
          <dd className="mt-1">
            {selected.length ? selected.map((service) => service.name).join(", ") : "Пока не выбраны"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Барбер</dt>
          <dd className="mt-1">{barberName ?? "Пока не выбран"}</dd>
        </div>
        <div>
          <dt className="text-muted">Когда</dt>
          <dd className="mt-1">
            {date && time ? `${formatDateLabel(date)}, ${time}` : date ? formatDateLabel(date) : "Пока не выбрано"}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3">
          <dt>Время</dt>
          <dd>{totalDuration ? formatDuration(totalDuration) : "—"}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Итого</dt>
          <dd className="price">{totalPrice ? formatPrice(totalPrice) : "—"}</dd>
        </div>
      </dl>
    </aside>
  );
}

function Confirmation({ booking, onRestart }: { booking: SavedBooking; onRestart: () => void }) {
  const when = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(booking.startsAt));

  return (
    <section className="mx-auto max-w-2xl rounded-[1.4rem] border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Подтверждение</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Запись сохранена</h1>
      <p className="mt-4 text-sm leading-6 text-muted">
        Слот занят. Ссылку можно открыть позже, чтобы отменить или перенести визит.
      </p>
      <dl className="mt-6 space-y-3 text-sm">
        <Row label="Клиент" value={`${booking.client.name}, ${booking.client.phone}`} />
        <Row label="Услуги" value={booking.services.map((service) => service.name).join(", ")} />
        <Row label="Барбер" value={booking.barber.name} />
        <Row label="Когда" value={when} />
        <Row label="Длительность" value={formatDuration(booking.totalDurationMin)} />
        <Row label="Сумма" value={formatPrice(booking.totalPrice)} />
      </dl>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/booking/${booking.manageToken}`}
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink"
        >
          Управление записью
        </Link>
        {booking.telegramLink ? (
          <a
            href={booking.telegramLink}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold"
          >
            Уведомления в Telegram
          </a>
        ) : null}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold"
        >
          На главную
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold"
        >
          Новая запись
        </button>
      </div>
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
