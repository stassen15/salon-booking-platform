-- MVP operations: onboarding, availability controls, customers, auditability,
-- branding, payment deadlines, and subscription foundations.

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_color text NOT NULL DEFAULT '#18181b',
  ADD COLUMN IF NOT EXISTS booking_title text,
  ADD COLUMN IF NOT EXISTS cancellation_policy text,
  ADD COLUMN IF NOT EXISTS deposit_deadline_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Indian/Mauritius';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salons_brand_color_format') THEN
    ALTER TABLE public.salons ADD CONSTRAINT salons_brand_color_format CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salons_deposit_deadline_positive') THEN
    ALTER TABLE public.salons ADD CONSTRAINT salons_deposit_deadline_positive CHECK (deposit_deadline_minutes BETWEEN 5 AND 1440);
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_token_hash text;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  notes text,
  marketing_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, phone_normalized)
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.staff_services (
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.salon_closures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salon_closures_window CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.booking_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status public.booking_status,
  to_status public.booking_status,
  from_payment_status public.payment_status,
  to_payment_status public.payment_status,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salon_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL UNIQUE REFERENCES public.salons(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro')),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_salon_phone ON public.customers(salon_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_closures_salon_time ON public.salon_closures(salon_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON public.booking_events(booking_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS customers_touch_updated_at ON public.customers;
CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_owner_all ON public.customers FOR ALL TO authenticated
USING (public.is_salon_owner(salon_id)) WITH CHECK (public.is_salon_owner(salon_id));
CREATE POLICY staff_services_owner_all ON public.staff_services FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND public.is_salon_owner(s.salon_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND public.is_salon_owner(s.salon_id)));
CREATE POLICY closures_owner_all ON public.salon_closures FOR ALL TO authenticated
USING (public.is_salon_owner(salon_id)) WITH CHECK (public.is_salon_owner(salon_id));
CREATE POLICY events_owner_select ON public.booking_events FOR SELECT TO authenticated
USING (public.is_salon_owner(salon_id));
CREATE POLICY subscriptions_owner_select ON public.salon_subscriptions FOR SELECT TO authenticated
USING (public.is_salon_owner(salon_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_closures TO authenticated;
GRANT SELECT ON public.booking_events, public.salon_subscriptions TO authenticated;

CREATE OR REPLACE FUNCTION public.record_booking_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_events (booking_id, salon_id, event_type, to_status, to_payment_status)
    VALUES (NEW.id, NEW.salon_id, 'created', NEW.status, NEW.payment_status);
  ELSIF OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    INSERT INTO public.booking_events (booking_id, salon_id, event_type, from_status, to_status, from_payment_status, to_payment_status)
    VALUES (NEW.id, NEW.salon_id, 'updated', OLD.status, NEW.status, OLD.payment_status, NEW.payment_status);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_record_booking_event ON public.bookings;
CREATE TRIGGER trigger_record_booking_event AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.record_booking_event();

CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.bookings SET status = 'cancelled'
  WHERE status = 'pending' AND payment_status = 'unpaid' AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END; $$;

REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_bookings() TO service_role;
