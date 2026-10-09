"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Field, Notice, Panel, buttonClass, inputClass, quietButtonClass } from "@/components/admin/admin-ui";
import {
  addPortfolio,
  barbers,
  deleteBarber,
  deletePortfolio,
  errorText,
  saveBarber,
  services,
  uploadImage,
  type AdminBarber,
  type AdminService,
} from "@/lib/admin-api";

const empty = { name: "", bio: "", photoUrl: "", experienceYears: 1, isActive: true, sortOrder: 10, serviceIds: [] as string[] };

export default function AdminBarbersPage() {
  const [rows, setRows] = useState<AdminBarber[]>([]);
  const [serviceRows, setServiceRows] = useState<AdminService[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const [barberList, serviceList] = await Promise.all([barbers(), services()]);
    setRows(barberList.barbers);
    setServiceRows(serviceList.services);
    return barberList.barbers;
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([barbers(), services()])
      .then(([barberList, serviceList]) => {
        if (cancelled) return;
        setRows(barberList.barbers);
        setServiceRows(serviceList.services);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(barber: AdminBarber) {
    setEditing(barber.id);
    setDraft({
      name: barber.name,
      bio: barber.bio,
      photoUrl: barber.photoUrl ?? "",
      experienceYears: barber.experienceYears,
      isActive: barber.isActive,
      sortOrder: barber.sortOrder,
      serviceIds: barber.serviceIds,
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      await saveBarber({
        ...draft,
        photoUrl: draft.photoUrl.trim() || null,
      }, editing ?? undefined);
      setDraft(empty);
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  async function onPhoto(file: File | undefined, target: "portrait" | "portfolio") {
    if (!file) return;
    setPending(true);
    setMessage("");
    try {
      const uploaded = await uploadImage(file);
      if (target === "portrait") {
        setDraft((current) => ({ ...current, photoUrl: uploaded.url }));
      } else if (editing) {
        await addPortfolio(editing, uploaded.url);
        await load();
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setMessage("");
    try {
      const result = await deleteBarber(id);
      setMessage(result.removed ? "Барбер удалён" : "Барбер скрыт: у него уже есть записи");
      if (editing === id) {
        setEditing(null);
        setDraft(empty);
      }
      await load();
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  const current = rows.find((row) => row.id === editing);

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-5xl leading-none">Барберы</h1>
      <p className="max-w-xl text-sm text-muted">Новому барберу сразу ставится график салона: вторник–воскресенье, 10:00–21:00, обед 13:00–14:00. Поменять его можно в разделе «График».</p>
      {message ? <Notice>{message}</Notice> : null}
      <Panel>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Field label="Имя">
            <input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </Field>
          <Field label="О себе">
            <textarea className={`${inputClass} min-h-24 py-2`} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Стаж, лет">
              <input className={inputClass} type="number" min={0} max={60} value={draft.experienceYears} onChange={(event) => setDraft({ ...draft, experienceYears: Number(event.target.value) })} />
            </Field>
            <Field label="Порядок">
              <input className={inputClass} type="number" min={0} value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
            </Field>
          </div>
          <Field label="Фото">
            <input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onPhoto(event.target.files?.[0], "portrait")} />
          </Field>
          <Field label="Или ссылка на фото">
            <input className={inputClass} placeholder="https://" value={draft.photoUrl} onChange={(event) => setDraft({ ...draft, photoUrl: event.target.value })} />
          </Field>
          {draft.photoUrl ? <Image src={draft.photoUrl} alt="" width={96} height={112} className="h-28 w-24 rounded-xl object-cover" /> : null}
          <fieldset className="grid gap-2">
            <legend className="text-sm text-muted">Услуги</legend>
            {serviceRows.map((service) => (
              <label key={service.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.serviceIds.includes(service.id)}
                  onChange={() => setDraft((current) => ({
                    ...current,
                    serviceIds: current.serviceIds.includes(service.id)
                      ? current.serviceIds.filter((id) => id !== service.id)
                      : [...current.serviceIds, service.id],
                  }))}
                />
                {service.name}
              </label>
            ))}
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            Принимает записи
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} type="submit" disabled={pending}>{editing ? "Сохранить барбера" : "Добавить барбера"}</button>
            {editing ? <button type="button" className={quietButtonClass} onClick={() => { setEditing(null); setDraft(empty); }}>Новый барбер</button> : null}
          </div>
        </form>
      </Panel>
      {current ? (
        <Panel>
          <h2 className="font-display text-3xl leading-none">Портфолио</h2>
          <input className={`${inputClass} mt-4`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onPhoto(event.target.files?.[0], "portfolio")} />
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {current.portfolio.map((item) => (
              <li key={item.id} className="grid gap-2">
                <Image src={item.imageUrl} alt="" width={240} height={320} className="aspect-[3/4] h-auto w-full rounded-xl object-cover" />
                <button type="button" className={quietButtonClass} onClick={() => void deletePortfolio(item.id).then(() => load()).catch((error: unknown) => setMessage(errorText(error)))}>
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <ul className="grid gap-3">
        {rows.map((barber) => (
          <li key={barber.id}>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  {barber.photoUrl ? <Image src={barber.photoUrl} alt="" width={56} height={64} className="h-16 w-14 rounded-xl object-cover" /> : null}
                  <div>
                    <p className="text-lg">{barber.name}</p>
                    <p className="text-sm text-muted">{barber.isActive ? "На сайте" : "Скрыт"}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={quietButtonClass} onClick={() => edit(barber)}>Изменить</button>
                  <button type="button" className={quietButtonClass} onClick={() => void remove(barber.id)}>Удалить</button>
                </div>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
