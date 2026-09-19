-- MCB Juice anti-no-show engine and walk-in operations.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trust_tier text NOT NULL DEFAULT 'new';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_trust_tier_valid') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_trust_tier_valid CHECK (trust_tier IN ('new', 'trusted', 'watchlist', 'blacklisted'));
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_required_mur numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

CREATE TABLE IF NOT EXISTS public.deposit_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  day_of_week smallint,
  starts_at time,
  ends_at time,
  amount_mur numeric(10, 2) NOT NULL,
  applies_to_first_visit boolean NOT NULL DEFAULT false,
  applies_to_blacklisted boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_rules_day_valid CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  CONSTRAINT deposit_rules_amount_valid CHECK (amount_mur >= 0),
  CONSTRAINT deposit_rules_window_valid CHECK ((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at))
);

CREATE INDEX IF NOT EXISTS idx_deposit_rules_lookup ON public.deposit_rules(salon_id, day_of_week, priority);

ALTER TABLE public.deposit_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY deposit_rules_owner_all ON public.deposit_rules FOR ALL TO authenticated
USING (public.is_salon_owner(salon_id)) WITH CHECK (public.is_salon_owner(salon_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_rules TO authenticated;

CREATE OR REPLACE FUNCTION public.update_customer_trust_after_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_no_shows integer;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'no_show' THEN
    UPDATE public.customers
      SET no_show_count = no_show_count + 1,
          trust_tier = CASE WHEN no_show_count + 1 >= 3 THEN 'blacklisted' WHEN no_show_count + 1 >= 2 THEN 'watchlist' ELSE trust_tier END
      WHERE id = NEW.customer_id
      RETURNING no_show_count INTO next_no_shows;
  ELSIF NEW.status = 'completed' THEN
    UPDATE public.customers
      SET trust_tier = CASE WHEN no_show_count = 0 THEN 'trusted' WHEN trust_tier = 'new' THEN 'watchlist' ELSE trust_tier END
      WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_update_customer_trust ON public.bookings;
CREATE TRIGGER trigger_update_customer_trust AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.update_customer_trust_after_booking();

REVOKE ALL ON FUNCTION public.update_customer_trust_after_booking() FROM PUBLIC, anon, authenticated;
