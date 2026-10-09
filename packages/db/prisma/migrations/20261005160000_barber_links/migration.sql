CREATE TABLE "barber_links" (
    "code" TEXT NOT NULL,
    "barber_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barber_links_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "barber_links_barber_id_idx" ON "barber_links"("barber_id");

ALTER TABLE "barber_links" ADD CONSTRAINT "barber_links_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "barber_links" ENABLE ROW LEVEL SECURITY;
