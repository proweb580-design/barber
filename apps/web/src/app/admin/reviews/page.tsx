"use client";

import { useEffect, useState } from "react";
import { Notice, Panel, quietButtonClass } from "@/components/admin/admin-ui";
import { errorText, reviews, setReviewPublic } from "@/lib/admin-api";
import { formatSalonDateTime } from "@/lib/datetime";

type Review = {
  id: string;
  rating: number;
  comment: string;
  isPublic: boolean;
  createdAt: string;
  clientName: string;
  barberName: string;
};

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const result = await reviews();
    setRows(result.reviews);
  }

  useEffect(() => {
    let cancelled = false;
    reviews()
      .then((result) => {
        if (!cancelled) setRows(result.reviews);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(review: Review) {
    setMessage("");
    try {
      await setReviewPublic(review.id, !review.isPublic);
      await load();
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-5xl leading-none">Отзывы</h1>
      {message ? <Notice>{message}</Notice> : null}
      {rows.length === 0 ? <Panel><p>Отзывов пока нет.</p></Panel> : null}
      <ul className="grid gap-3">
        {rows.map((review) => (
          <li key={review.id}>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-3xl leading-none">{review.rating} из 5</p>
                  <p className="mt-2">{review.clientName}</p>
                  <p className="text-sm text-muted">{review.barberName}</p>
                  <p className="text-sm text-muted">{formatSalonDateTime(review.createdAt)}</p>
                  {review.comment ? <p className="mt-3 max-w-xl">{review.comment}</p> : null}
                </div>
                <button type="button" className={quietButtonClass} onClick={() => void toggle(review)}>
                  {review.isPublic ? "Скрыть с сайта" : "Показать на сайте"}
                </button>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
