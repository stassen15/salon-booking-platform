import { createHmac, timingSafeEqual } from "node:crypto";

function actionSecret(): string {
  // Prefer a dedicated action secret. The Supabase secret key is a server-only
  // high-entropy fallback for deployments where the dedicated variable has not
  // propagated yet; it is never sent to the browser.
  const secret =
    process.env.BOOKING_ACTION_SECRET ??
    process.env.CRON_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing BOOKING_ACTION_SECRET or CRON_SECRET");
  return secret;
}

export function createBookingActionToken(bookingId: string): string {
  return createHmac("sha256", actionSecret()).update(bookingId).digest("hex");
}

export function verifyBookingActionToken(bookingId: string, token: string): boolean {
  const expected = Buffer.from(createBookingActionToken(bookingId), "utf8");
  const received = Buffer.from(token, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
