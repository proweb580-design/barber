import type { Metadata } from "next";
import { ManageBooking } from "@/components/booking/manage-booking";
import { PageSlide } from "@/components/page-slide";
import { getBooking } from "@/lib/booking-api";

export const metadata: Metadata = {
  title: "Запись",
};

export default async function BookingTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBooking(token);

  return (
    <PageSlide>
      <main className="page-wrap pt-24 pb-16 sm:pt-28">
        {booking ? (
          <ManageBooking initial={booking} />
        ) : (
          <section className="rounded-[1.1rem] border border-line bg-surface p-5" role="alert">
            <p className="font-semibold">Запись не найдена</p>
            <p className="mt-2 text-sm text-muted">Проверьте ссылку из подтверждения.</p>
          </section>
        )}
      </main>
    </PageSlide>
  );
}
