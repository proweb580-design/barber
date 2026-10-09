ALTER TABLE "bookings" ADD COLUMN "reminder_day_sent_at" TIMESTAMPTZ(3);
ALTER TABLE "bookings" ADD COLUMN "reminder_30m_sent_at" TIMESTAMPTZ(3);
ALTER TABLE "bookings" ADD COLUMN "review_requested_at" TIMESTAMPTZ(3);
ALTER TABLE "bookings" ADD COLUMN "auto_completed_at" TIMESTAMPTZ(3);

CREATE INDEX "bookings_reminder_day_idx" ON "bookings" ("starts_at") WHERE "status" = 'confirmed' AND "reminder_day_sent_at" IS NULL;
CREATE INDEX "bookings_reminder_30m_idx" ON "bookings" ("starts_at") WHERE "status" = 'confirmed' AND "reminder_30m_sent_at" IS NULL;
CREATE INDEX "bookings_review_request_idx" ON "bookings" ("ends_at") WHERE "review_requested_at" IS NULL;
