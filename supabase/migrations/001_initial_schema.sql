-- Multi-tenant salon / barbershop booking platform (Mauritius)
-- Extensions, enums, tables, exclusion constraint, triggers, and RLS.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.booking_status AS ENUM (
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show'
);

CREATE TYPE public.payment_status AS ENUM (
  'unpaid',
  'deposit_submitted',
  'paid_in_full'
);

CREATE TYPE public.notification_status AS ENUM (
  'queued',
  'sent',
  'failed'
);

CREATE TYPE public.notification_type AS ENUM (
  'confirmation',
  'reminder_24h',
  'reminder_2h'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.salons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  district text NOT NULL,
  juice_phone text,
  juice_account_name text,
  currency text NOT NULL DEFAULT 'MUR',
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT salons_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT salons_currency_mur CHECK (currency = 'MUR')
);

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes integer NOT NULL,
  price_mur numeric(10, 2) NOT NULL,
  deposit_required_mur numeric(10, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT services_price_non_negative CHECK (price_mur >= 0),
  CONSTRAINT services_deposit_non_negative CHECK (deposit_required_mur >= 0),
  CONSTRAINT services_deposit_not_above_price CHECK (deposit_required_mur <= price_mur)
);

CREATE TABLE public.working_hours (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  CONSTRAINT working_hours_day_range CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT working_hours_window CHECK (is_closed OR end_time > start_time)
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  booking_range tstzrange GENERATED ALWAYS AS (tstzrange(start_time, end_time, '[)')) STORED,
  status public.booking_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  juice_reference text,
  juice_proof_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_time_window CHECK (end_time > start_time)
);

ALTER TABLE public.bookings
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    staff_id WITH =,
    booking_range WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  notification_type public.notification_type NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status public.notification_status NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  meta_message_id text,
  error_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_salons_owner_id ON public.salons (owner_id);
CREATE INDEX idx_staff_salon_id ON public.staff (salon_id);
CREATE INDEX idx_services_salon_id ON public.services (salon_id);
CREATE INDEX idx_working_hours_salon_day ON public.working_hours (salon_id, day_of_week);
CREATE INDEX idx_working_hours_staff_day ON public.working_hours (staff_id, day_of_week);
CREATE INDEX idx_bookings_salon_start ON public.bookings (salon_id, start_time);
CREATE INDEX idx_bookings_staff_start ON public.bookings (staff_id, start_time);
CREATE INDEX idx_notification_queue_dispatch
  ON public.notification_queue (status, scheduled_for)
  WHERE status = 'queued';
CREATE INDEX idx_notification_queue_meta_id
  ON public.notification_queue (meta_message_id)
  WHERE meta_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Notification enqueue trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_queue (
    booking_id,
    salon_id,
    recipient_phone,
    notification_type,
    scheduled_for,
    status
  )
  VALUES (
    NEW.id,
    NEW.salon_id,
    NEW.customer_phone,
    'confirmation',
    now(),
    'queued'
  );

  IF NEW.start_time > now() + interval '24 hours' THEN
    INSERT INTO public.notification_queue (
      booking_id,
      salon_id,
      recipient_phone,
      notification_type,
      scheduled_for,
      status
    )
    VALUES (
      NEW.id,
      NEW.salon_id,
      NEW.customer_phone,
      'reminder_24h',
      NEW.start_time - interval '24 hours',
      'queued'
    );
  END IF;

  IF NEW.start_time > now() + interval '2 hours' THEN
    INSERT INTO public.notification_queue (
      booking_id,
      salon_id,
      recipient_phone,
      notification_type,
      scheduled_for,
      status
    )
    VALUES (
      NEW.id,
      NEW.salon_id,
      NEW.customer_phone,
      'reminder_2h',
      NEW.start_time - interval '2 hours',
      'queued'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_enqueue_notifications
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_booking_notifications();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_salon_owner(p_salon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salons s
    WHERE s.id = p_salon_id
      AND s.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.salon_is_publicly_active(p_salon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salons s
    WHERE s.id = p_salon_id
      AND s.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_salon_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salon_is_publicly_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_salon_owner(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.salon_is_publicly_active(uuid) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Salons
CREATE POLICY salons_public_read_active
  ON public.salons
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY salons_owner_select
  ON public.salons
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY salons_owner_insert
  ON public.salons
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY salons_owner_update
  ON public.salons
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY salons_owner_delete
  ON public.salons
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- Staff
CREATE POLICY staff_public_read_active
  ON public.staff
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND public.salon_is_publicly_active(salon_id));

CREATE POLICY staff_owner_select
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (public.is_salon_owner(salon_id));

CREATE POLICY staff_owner_insert
  ON public.staff
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY staff_owner_update
  ON public.staff
  FOR UPDATE
  TO authenticated
  USING (public.is_salon_owner(salon_id))
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY staff_owner_delete
  ON public.staff
  FOR DELETE
  TO authenticated
  USING (public.is_salon_owner(salon_id));

-- Services
CREATE POLICY services_public_read_active
  ON public.services
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND public.salon_is_publicly_active(salon_id));

CREATE POLICY services_owner_select
  ON public.services
  FOR SELECT
  TO authenticated
  USING (public.is_salon_owner(salon_id));

CREATE POLICY services_owner_insert
  ON public.services
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY services_owner_update
  ON public.services
  FOR UPDATE
  TO authenticated
  USING (public.is_salon_owner(salon_id))
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY services_owner_delete
  ON public.services
  FOR DELETE
  TO authenticated
  USING (public.is_salon_owner(salon_id));

-- Working hours
CREATE POLICY working_hours_public_read
  ON public.working_hours
  FOR SELECT
  TO anon, authenticated
  USING (public.salon_is_publicly_active(salon_id));

CREATE POLICY working_hours_owner_select
  ON public.working_hours
  FOR SELECT
  TO authenticated
  USING (public.is_salon_owner(salon_id));

CREATE POLICY working_hours_owner_insert
  ON public.working_hours
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY working_hours_owner_update
  ON public.working_hours
  FOR UPDATE
  TO authenticated
  USING (public.is_salon_owner(salon_id))
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY working_hours_owner_delete
  ON public.working_hours
  FOR DELETE
  TO authenticated
  USING (public.is_salon_owner(salon_id));

-- Bookings: public insert with per-phone rate limit (max 5 in 15 minutes)
CREATE POLICY bookings_public_insert
  ON public.bookings
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'pending'
    AND payment_status = 'unpaid'
    AND public.salon_is_publicly_active(salon_id)
    AND (
      SELECT COUNT(*)::integer
      FROM public.bookings existing
      WHERE existing.customer_phone = bookings.customer_phone
        AND existing.created_at > now() - interval '15 minutes'
    ) < 5
  );

CREATE POLICY bookings_public_select_recent
  ON public.bookings
  FOR SELECT
  TO anon
  USING (created_at >= now() - interval '30 seconds');

CREATE POLICY bookings_owner_select
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (public.is_salon_owner(salon_id));

CREATE POLICY bookings_authenticated_customer_insert
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND payment_status = 'unpaid'
    AND public.salon_is_publicly_active(salon_id)
    AND (
      SELECT COUNT(*)::integer
      FROM public.bookings existing
      WHERE existing.customer_phone = bookings.customer_phone
        AND existing.created_at > now() - interval '15 minutes'
    ) < 5
  );

CREATE POLICY bookings_owner_insert
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY bookings_authenticated_select_recent
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (created_at >= now() - interval '30 seconds');

CREATE POLICY bookings_owner_update
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.is_salon_owner(salon_id))
  WITH CHECK (public.is_salon_owner(salon_id));

-- Notification queue: owners can read; writes happen via SECURITY DEFINER trigger / service role
CREATE POLICY notification_queue_owner_select
  ON public.notification_queue
  FOR SELECT
  TO authenticated
  USING (public.is_salon_owner(salon_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE public.salons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.salons TO authenticated;

GRANT SELECT ON TABLE public.staff TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.staff TO authenticated;

GRANT SELECT ON TABLE public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.services TO authenticated;

GRANT SELECT ON TABLE public.working_hours TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.working_hours TO authenticated;

GRANT SELECT, INSERT ON TABLE public.bookings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookings TO authenticated;

GRANT SELECT ON TABLE public.notification_queue TO authenticated;
