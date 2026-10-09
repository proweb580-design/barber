import { useEffect, useState } from "react";
import {
  ApiFailure,
  cancelBooking,
  createBooking,
  fetchBarbers,
  fetchDays,
  fetchServices,
  fetchSlots,
  openSession,
  rescheduleBooking,
  tashkentStartIso,
  type Barber,
  type DayOption,
  type SavedBooking,
  type Service,
  type Session,
} from "./api";
import {
  formatDuration,
  formatMonth,
  formatPrice,
  formatWeekday,
  formatWhen,
  isValidName,
  isValidPhone,
  normalizePhone,
  statusLabel,
} from "./format";
import { bootTelegram } from "./telegram";

const anyBarberId = "any";
const steps = ["service", "barber", "date", "time", "contacts"] as const;
type Step = (typeof steps)[number] | "done";

const titles: Record<(typeof steps)[number], string> = {
  service: "Какая услуга нужна?",
  barber: "К кому записаться?",
  date: "Какой день удобен?",
  time: "Во сколько прийти?",
  contacts: "Как с вами связаться?",
};

export function App() {
  const [tab, setTab] = useState<"book" | "mine">("book");
  const [initData, setInitData] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [catalog, setCatalog] = useState<"loading" | "ready" | "error">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [step, setStep] = useState<Step>("service");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [days, setDays] = useState<DayOption[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedBooking | null>(null);

  useEffect(() => {
    const telegram = bootTelegram();
    setInitData(telegram.initData);
    if (telegram.name) setName(telegram.name);
    let cancelled = false;

    Promise.all([fetchServices(), fetchBarbers()])
      .then(async ([nextServices, nextBarbers]) => {
        if (cancelled) return;
        setServices(nextServices);
        setBarbers(nextBarbers);
        if (telegram.initData) {
          const nextSession = await openSession(telegram.initData);
          if (cancelled) return;
          setSession(nextSession);
          if (nextSession.client?.name) setName(nextSession.client.name);
          if (nextSession.client?.phone) setPhone(nextSession.client.phone);
        }
        setCatalog("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCatalog("error");
        setSessionError(error instanceof Error ? error.message : "Не удалось открыть приложение");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = services.filter((service) => serviceIds.includes(service.id));
  const totalPrice = selected.reduce((sum, service) => sum + service.price, 0);
  const totalDuration = selected.reduce((sum, service) => sum + service.durationMin, 0);
  const barberName = barberId === anyBarberId ? "Любой свободный" : barbers.find((barber) => barber.id === barberId)?.name;
  const stepIndex = steps.indexOf(step as (typeof steps)[number]);
  const canContinue =
    (step === "service" && serviceIds.length > 0) ||
    (step === "barber" && Boolean(barberId)) ||
    (step === "date" && Boolean(date)) ||
    (step === "time" && Boolean(time)) ||
    step === "contacts";

  function toggleService(id: string) {
    setServiceIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function loadDays() {
    if (!barberId || serviceIds.length === 0) return;
    setLoadingDays(true);
    setMessage("");
    try {
      setDays(await fetchDays(serviceIds, barberId));
    } catch (error) {
      setDays([]);
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить дни");
    } finally {
      setLoadingDays(false);
    }
  }

  async function pickDate(nextDate: string) {
    if (!barberId) return;
    setDate(nextDate);
    setTime(null);
    setLoadingSlots(true);
    setMessage("");
    try {
      setSlots(await fetchSlots(serviceIds, barberId, nextDate));
    } catch (error) {
      setSlots([]);
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить время");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function goNext() {
    setMessage("");
    if (step === "contacts") {
      if (!isValidName(name)) {
        setMessage("Введите имя, минимум 2 буквы");
        return;
      }
      if (!isValidPhone(phone) || !barberId || !date || !time) {
        setMessage("Нужен номер Узбекистана: +998 и 9 цифр");
        return;
      }
      setSaving(true);
      try {
        const booking = await createBooking({
          serviceIds,
          barberId,
          startsAt: tashkentStartIso(date, time),
          client: { name: name.trim(), phone: normalizePhone(phone) },
          initData,
        });
        setSaved(booking);
        setStep("done");
        if (initData) {
          setSession(await openSession(initData));
        }
      } catch (error) {
        if (error instanceof ApiFailure && error.code === "SLOT_TAKEN") {
          setMessage("Это время уже заняли. Выберите другое.");
          setStep("time");
          if (date && barberId) setSlots(await fetchSlots(serviceIds, barberId, date).catch(() => []));
          return;
        }
        setMessage(error instanceof Error ? error.message : "Не удалось сохранить запись");
      } finally {
        setSaving(false);
      }
      return;
    }

    const next = steps[stepIndex + 1];
    if (!next) return;
    if (next === "date") void loadDays();
    setStep(next);
  }

  function replaceBooking(booking: SavedBooking) {
    setSaved((current) => (current?.id === booking.id ? booking : current));
    setSession((current) =>
      current
        ? { ...current, bookings: current.bookings.map((item) => (item.id === booking.id ? booking : item)) }
        : current,
    );
  }

  return (
    <div className="app">
      <header className="top">
        <p className="brand">Кромка</p>
        <div className="tabs" role="tablist" aria-label="Разделы">
          <button type="button" className="tab" role="tab" aria-selected={tab === "book"} onClick={() => setTab("book")}>
            Запись
          </button>
          <button type="button" className="tab" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>
            Мои
          </button>
        </div>
      </header>

      {tab === "mine" ? (
        <Mine
          initData={initData}
          session={session}
          error={sessionError}
          onChange={replaceBooking}
          onFail={setSessionError}
        />
      ) : catalog === "loading" ? (
        <p className="note">Загружаем услуги…</p>
      ) : catalog === "error" ? (
        <p className="alert" role="alert">
          {sessionError || "Не удалось загрузить услуги. Проверьте, что API запущен."}
        </p>
      ) : step === "done" && saved ? (
        <Done
          booking={saved}
          inTelegram={Boolean(initData)}
          onAgain={() => {
            setStep("service");
            setServiceIds([]);
            setBarberId(null);
            setDate(null);
            setTime(null);
            setSaved(null);
            setMessage("");
          }}
          onCancel={async () => {
            replaceBooking(await cancelBooking(saved.manageToken));
          }}
        />
      ) : (
        <>
          <h1>{titles[step as (typeof steps)[number]]}</h1>
          {step === "service" ? (
            <div className="stack">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className="choice"
                  aria-pressed={serviceIds.includes(service.id)}
                  onClick={() => toggleService(service.id)}
                >
                  <span className="choice-title">
                    <span>{service.name}</span>
                    <span className="price">{formatPrice(service.price)}</span>
                  </span>
                  <span className="muted">{formatDuration(service.durationMin)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {step === "barber" ? (
            <div className="stack">
              <button type="button" className="choice" aria-pressed={barberId === anyBarberId} onClick={() => setBarberId(anyBarberId)}>
                <span className="choice-title">Любой свободный</span>
                <span className="muted">Время, которое свободно хотя бы у одного мастера</span>
              </button>
              {barbers.map((barber) => (
                <button
                  key={barber.id}
                  type="button"
                  className="choice"
                  aria-pressed={barberId === barber.id}
                  onClick={() => setBarberId(barber.id)}
                >
                  <span className="choice-title">
                    <span>{barber.name}</span>
                    {barber.rating != null ? <span>{barber.rating.toFixed(1)}</span> : null}
                  </span>
                  <span className="muted">{barber.experienceYears} лет в кресле</span>
                </button>
              ))}
            </div>
          ) : null}
          {step === "date" ? (
            loadingDays ? (
              <p className="note">Смотрим свободные дни…</p>
            ) : (
              <div className="days">
                {days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className="slot"
                    disabled={!day.available}
                    aria-pressed={date === day.date}
                    onClick={() => void pickDate(day.date)}
                  >
                    <span className="muted">{formatWeekday(day.date)}</span>
                    <strong>{Number(day.date.slice(8))}</strong>
                    <span className="muted">{day.available ? formatMonth(day.date) : "нет времени"}</span>
                  </button>
                ))}
              </div>
            )
          ) : null}
          {step === "time" ? (
            loadingSlots ? (
              <p className="note">Смотрим свободное время…</p>
            ) : slots.length === 0 ? (
              <p className="note">В этот день нет свободного времени. Выберите другую дату.</p>
            ) : (
              <div className="times">
                {slots.map((slot) => (
                  <button key={slot} type="button" className="slot" aria-pressed={time === slot} onClick={() => setTime(slot)}>
                    {slot}
                  </button>
                ))}
              </div>
            )
          ) : null}
          {step === "contacts" ? (
            <div className="stack">
              <Ticket
                time={time ?? ""}
                when={date ? `${formatWeekday(date)} ${Number(date.slice(8))} ${formatMonth(date)}` : ""}
                barber={barberName ?? ""}
                services={selected.map((service) => service.name).join(", ")}
                price={formatPrice(totalPrice)}
                duration={formatDuration(totalDuration)}
              />
              <label htmlFor="client-name">
                Имя
                <input id="client-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label htmlFor="client-phone">
                Телефон
                <input
                  id="client-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          {message ? (
            <p className="alert" role="alert">
              {message}
            </p>
          ) : null}
        </>
      )}

      {tab === "book" && step !== "done" && catalog === "ready" ? (
        <div className="dock">
          <div className="dock-inner">
            {stepIndex > 0 ? (
              <button type="button" className="text-button" onClick={() => setStep(steps[stepIndex - 1] ?? "service")}>
                Назад
              </button>
            ) : null}
            <button type="button" disabled={!canContinue || saving} onClick={() => void goNext()}>
              {saving ? "Сохраняем…" : step === "contacts" ? "Записать" : "Дальше"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Ticket({ time, when, barber, services, price, duration }: { time: string; when: string; barber: string; services: string; price: string; duration: string }) {
  return (
    <article className="ticket">
      <p className="ticket-time">{time}</p>
      {when ? <p>{when}</p> : null}
      <p>{barber}</p>
      <p className="muted">{services}</p>
      <p>
        {duration}, {price}
      </p>
    </article>
  );
}

function Done({
  booking,
  inTelegram,
  onAgain,
  onCancel,
}: {
  booking: SavedBooking;
  inTelegram: boolean;
  onAgain: () => void;
  onCancel: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clock = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(
    new Date(booking.startsAt),
  );
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "numeric", month: "long" }).format(
    new Date(booking.startsAt),
  );

  return (
    <section>
      <h1>{booking.status === "cancelled" ? "Запись отменена" : "Вы записаны"}</h1>
      <article className="ticket">
        <p className="ticket-time">{clock}</p>
        <p>{when}</p>
        <p>{booking.barber.name}</p>
        <p className="muted">{booking.services.map((service) => service.name).join(", ")}</p>
        <p>
          {formatDuration(booking.totalDurationMin)}, {formatPrice(booking.totalPrice)}
        </p>
      </article>
      <p className="note">
        {inTelegram ? "Запись есть во вкладке «Мои»." : "В Telegram эта запись появится в «Мои», если открыть приложение оттуда."}
      </p>
      {error ? <p className="alert">{error}</p> : null}
      <div className="actions">
        {booking.canChange ? (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void onCancel()
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось отменить"))
                .finally(() => setBusy(false));
            }}
          >
            Отменить
          </button>
        ) : null}
        <button type="button" className="primary" onClick={onAgain}>
          Новая запись
        </button>
        {booking.telegramLink ? (
          <a className="text-button" href={booking.telegramLink}>
            Уведомления в Telegram
          </a>
        ) : null}
      </div>
    </section>
  );
}

function Mine({
  initData,
  session,
  error,
  onChange,
  onFail,
}: {
  initData: string;
  session: Session | null;
  error: string;
  onChange: (booking: SavedBooking) => void;
  onFail: (message: string) => void;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const [days, setDays] = useState<DayOption[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  if (!initData) {
    return <p className="note">Список записей открывается внутри Telegram. Здесь можно записаться по телефону.</p>;
  }
  if (!session && !error) return <p className="note">Открываем ваши записи…</p>;
  if (error && !session) return <p className="alert">{error}</p>;
  if (!session || session.bookings.length === 0) return <p className="note">Записей пока нет.</p>;

  async function openMove(booking: SavedBooking) {
    setMoving(booking.id);
    setDate(null);
    setTime(null);
    setSlots([]);
    try {
      setDays(await fetchDays(booking.services.map((service) => service.id), booking.barber.id));
    } catch (reason) {
      onFail(reason instanceof Error ? reason.message : "Не удалось загрузить дни");
    }
  }

  return (
    <section>
      <h1>Мои записи</h1>
      {error ? <p className="alert">{error}</p> : null}
      {session.bookings.map((booking) => (
        <article key={booking.id} className="visit">
          <div className="row">
            <strong>{formatWhen(booking.startsAt)}</strong>
            <span className="muted">{statusLabel(booking.status)}</span>
          </div>
          <p>{booking.barber.name}</p>
          <p className="muted">{booking.services.map((service) => service.name).join(", ")}</p>
          {booking.canChange ? (
            <div className="actions">
              {confirmCancel === booking.id ? (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void cancelBooking(booking.manageToken)
                      .then(onChange)
                      .catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "Не удалось отменить"))
                      .finally(() => {
                        setBusy(false);
                        setConfirmCancel(null);
                      });
                  }}
                >
                  Подтвердить отмену
                </button>
              ) : (
                <button type="button" className="text-button" onClick={() => setConfirmCancel(booking.id)}>
                  Отменить
                </button>
              )}
              <button type="button" className="text-button" onClick={() => void openMove(booking)}>
                Перенести
              </button>
            </div>
          ) : null}
          {moving === booking.id ? (
            <div className="stack" style={{ marginTop: "0.75rem" }}>
              <div className="days">
                {days
                  .filter((day) => day.available)
                  .map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      className="slot"
                      aria-pressed={date === day.date}
                      onClick={() => {
                        setDate(day.date);
                        setTime(null);
                        void fetchSlots(
                          booking.services.map((service) => service.id),
                          booking.barber.id,
                          day.date,
                        )
                          .then(setSlots)
                          .catch((reason: unknown) => onFail(reason instanceof Error ? reason.message : "Не удалось загрузить время"));
                      }}
                    >
                      {Number(day.date.slice(8))} {formatMonth(day.date)}
                    </button>
                  ))}
              </div>
              {date ? (
                <div className="times">
                  {slots.map((slot) => (
                    <button key={slot} type="button" className="slot" aria-pressed={time === slot} onClick={() => setTime(slot)}>
                      {slot}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="primary"
                disabled={!date || !time || busy}
                onClick={() => {
                  if (!date || !time) return;
                  setBusy(true);
                  void rescheduleBooking(booking.manageToken, tashkentStartIso(date, time))
                    .then((next) => {
                      onChange(next);
                      setMoving(null);
                    })
                    .catch((reason: unknown) => {
                      const text = reason instanceof ApiFailure && reason.code === "SLOT_TAKEN"
                        ? "Это время уже заняли. Выберите другое."
                        : reason instanceof Error
                          ? reason.message
                          : "Не удалось перенести";
                      onFail(text);
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Сохранить новое время
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
