-- Allow a customer to submit a Juice reference at booking time while keeping
-- all other booking mutations owner-only.
DROP POLICY IF EXISTS bookings_public_insert ON public.bookings;
CREATE POLICY bookings_public_insert
  ON public.bookings
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'pending'
    AND payment_status IN ('unpaid', 'deposit_submitted')
    AND public.salon_is_publicly_active(salon_id)
    AND (payment_status = 'unpaid' OR juice_reference IS NOT NULL)
    AND (
      SELECT COUNT(*)::integer
      FROM public.bookings existing
      WHERE existing.customer_phone = bookings.customer_phone
        AND existing.created_at > now() - interval '15 minutes'
    ) < 5
  );

DROP POLICY IF EXISTS bookings_authenticated_customer_insert ON public.bookings;
CREATE POLICY bookings_authenticated_customer_insert
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND payment_status IN ('unpaid', 'deposit_submitted')
    AND public.salon_is_publicly_active(salon_id)
    AND (payment_status = 'unpaid' OR juice_reference IS NOT NULL)
  );
