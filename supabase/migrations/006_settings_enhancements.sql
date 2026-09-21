-- Settings enhancements: staff role and chair number, service category support
-- Backwards compatible with existing data

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'Stylist',
  ADD COLUMN IF NOT EXISTS chair_number text;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(salon_id, category);
