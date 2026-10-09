import { BarbersSection } from "@/components/barbers-section";
import { BookBand } from "@/components/book-band";
import { ContactsSection } from "@/components/contacts-section";
import { Hero } from "@/components/hero";
import { PageSlide } from "@/components/page-slide";
import { ReviewsSection } from "@/components/reviews-section";
import { StackedServices } from "@/components/services/StackedServices";
import { loadCatalog } from "@/lib/catalog";

export default async function HomePage() {
  const catalog = await loadCatalog();
  const services = catalog.ok ? catalog.services : [];
  const barbers = catalog.ok ? catalog.barbers : [];

  return (
    <PageSlide>
      <main>
        <Hero />
        <StackedServices services={services} failed={!catalog.ok} />
        <BarbersSection barbers={barbers} failed={!catalog.ok} />
        <ReviewsSection />
        <BookBand />
        <ContactsSection />
      </main>
    </PageSlide>
  );
}
