import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { CatalogFallback } from "@/components/catalog-fallback";
import { PageSlide } from "@/components/page-slide";
import { loadCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Запись",
  description: "Выберите услугу, барбера, дату и время.",
};

export default async function BookPage() {
  const catalog = await loadCatalog();

  return (
    <PageSlide>
      <main className="page-wrap pt-24 pb-28 sm:pt-28 lg:pb-12">
        {catalog.ok ? (
          <Suspense fallback={<p className="text-muted">Загрузка записи…</p>}>
            <BookingWizard services={catalog.services} barbers={catalog.barbers} />
          </Suspense>
        ) : (
          <CatalogFallback what="запись" />
        )}
      </main>
    </PageSlide>
  );
}
