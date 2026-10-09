"use client";

import { useEffect, useState } from "react";
import { Field, Notice, Panel, Status, buttonClass, inputClass, quietButtonClass } from "@/components/admin/admin-ui";
import { deleteService, errorText, saveService, services, type AdminService } from "@/lib/admin-api";
import { formatDuration, formatPrice } from "@/lib/format";

const empty = { name: "", description: "", durationMin: 30, price: 80000, isActive: true, sortOrder: 10 };

export default function AdminServicesPage() {
  const [rows, setRows] = useState<AdminService[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const result = await services();
    setRows(result.services);
  }

  useEffect(() => {
    let cancelled = false;
    services()
      .then((result) => {
        if (!cancelled) setRows(result.services);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(service: AdminService) {
    setEditing(service.id);
    setDraft({
      name: service.name,
      description: service.description,
      durationMin: service.durationMin,
      price: service.price,
      isActive: service.isActive,
      sortOrder: service.sortOrder,
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setSaved("");
    try {
      await saveService(draft, editing ?? undefined);
      setDraft(empty);
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setMessage("");
    setSaved("");
    try {
      const result = await deleteService(id);
      setSaved(result.removed ? "Услуга удалена" : "Услуга скрыта: она уже есть в записях");
      if (editing === id) {
        setEditing(null);
        setDraft(empty);
      }
      await load();
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-5xl leading-none">Услуги</h1>
      {message ? <Notice>{message}</Notice> : null}
      {saved ? <Status>{saved}</Status> : null}
      <Panel>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Field label="Название">
            <input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </Field>
          <Field label="Описание">
            <textarea className={`${inputClass} min-h-24 py-2`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Минуты">
              <input className={inputClass} type="number" min={5} max={240} value={draft.durationMin} onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })} />
            </Field>
            <Field label="Цена, сум">
              <input className={inputClass} type="number" min={0} value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} />
            </Field>
            <Field label="Порядок">
              <input className={inputClass} type="number" min={0} value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            Показывать клиентам
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} type="submit" disabled={pending}>{editing ? "Сохранить услугу" : "Добавить услугу"}</button>
            {editing ? <button type="button" className={quietButtonClass} onClick={() => { setEditing(null); setDraft(empty); }}>Новая услуга</button> : null}
          </div>
        </form>
      </Panel>
      <ul className="grid gap-3">
        {rows.map((service) => (
          <li key={service.id}>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg">{service.name}</p>
                  <p className="text-sm text-muted">{formatDuration(service.durationMin)}, {formatPrice(service.price)}</p>
                  <p className="mt-1 text-sm text-muted">{service.isActive ? "На сайте" : "Скрыта"}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={quietButtonClass} onClick={() => edit(service)}>Изменить</button>
                  <button type="button" className={quietButtonClass} onClick={() => void remove(service.id)}>Удалить</button>
                </div>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
