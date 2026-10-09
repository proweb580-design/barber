"use client";

import { useEffect, useState } from "react";
import { Field, Notice, Status, buttonClass, inputClass } from "@/components/admin/admin-ui";
import { errorText, saveSettings, settings } from "@/lib/admin-api";

const FIELDS = [
  { key: "cancel_cutoff_min", label: "За сколько минут до визита ещё можно отменить", numeric: true },
  { key: "min_notice_min", label: "Минимальный запас до записи, минут", numeric: true },
  { key: "slot_step_min", label: "Шаг слотов, минут", numeric: true },
  { key: "booking_horizon_days", label: "На сколько дней вперёд открыта запись", numeric: true },
  { key: "reminder_day_minutes", label: "Напоминание за день, минут", numeric: true },
  { key: "reminder_short_minutes", label: "Короткое напоминание, минут", numeric: true },
  { key: "review_delay_min", label: "Через сколько минут после визита просить отзыв", numeric: true },
  { key: "review_public_min_rating", label: "С какой оценки отзыв сразу публичный", numeric: true },
  { key: "timezone", label: "Часовой пояс", numeric: false },
];

export default function AdminSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settings()
      .then((result) => {
        if (!cancelled) setValues(result.settings);
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
    setSaved("");
    try {
      const saved = await saveSettings(values);
      setValues(saved.settings);
      setSaved("Настройки сохранены");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-5xl leading-none">Настройки</h1>
      {message ? <Notice>{message}</Notice> : null}
      {saved ? <Status>{saved}</Status> : null}
      <form className="grid max-w-xl gap-4" onSubmit={(event) => void submit(event)}>
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              className={inputClass}
              inputMode={field.numeric ? "numeric" : "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </Field>
        ))}
        <button className={buttonClass} type="submit" disabled={pending || Object.keys(values).length === 0}>Сохранить настройки</button>
      </form>
    </div>
  );
}
