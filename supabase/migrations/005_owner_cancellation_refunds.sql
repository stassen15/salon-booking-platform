-- Owner cancellation workflow with manual MCB Juice refund tracking.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'cancellation';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS refund_reference text,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_refund_status_valid') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_refund_status_valid
      CHECK (refund_status IN ('not_required', 'pending', 'refunded', 'not_possible'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_refund_status
  ON public.bookings(salon_id, refund_status)
  WHERE refund_status IN ('pending', 'refunded');
