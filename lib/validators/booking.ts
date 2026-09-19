import { z } from "zod";
import { isIsoDate, MAURITIUS_TIMEZONE } from "@/lib/timezone";

const uuid = z.string().uuid();

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, "Phone must be 8–15 digits, optionally prefixed with +");

export const bookingCreateInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  serviceId: uuid,
  staffId: uuid,
  startTime: z.string().datetime({ offset: true }),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: phoneSchema,
  juiceReference: z.string().trim().min(3).max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type BookingCreateInput = z.infer<typeof bookingCreateInputSchema>;

export const juiceDepositVerificationInputSchema = z.object({
  juiceReference: z.string().trim().min(3).max(80),
  juiceProofUrl: z.string().url().optional(),
  paymentStatus: z.enum(["deposit_submitted", "paid_in_full"]),
});

export type JuiceDepositVerificationInput = z.infer<
  typeof juiceDepositVerificationInputSchema
>;

export const bookingAdminPatchSchema = z
  .object({
    status: z.enum(["confirmed", "cancelled", "no_show", "completed"]).optional(),
    paymentStatus: z
      .enum(["unpaid", "deposit_submitted", "paid_in_full"])
      .optional(),
    juiceReference: z.string().trim().min(3).max(80).optional(),
    juiceProofUrl: z.string().url().nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.paymentStatus !== undefined ||
      value.juiceReference !== undefined ||
      value.juiceProofUrl !== undefined ||
      value.notes !== undefined,
    { message: "At least one field is required" },
  );

export type BookingAdminPatchInput = z.infer<typeof bookingAdminPatchSchema>;

export const slotQueryInputSchema = z.object({
  serviceId: uuid,
  staffId: uuid.optional(),
  date: z.string().refine(isIsoDate, "date must be YYYY-MM-DD"),
  timezone: z.literal(MAURITIUS_TIMEZONE).default(MAURITIUS_TIMEZONE),
});

export type SlotQueryInput = z.infer<typeof slotQueryInputSchema>;

export const adminBookingListQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z
    .enum(["pending", "confirmed", "completed", "cancelled", "no_show"])
    .optional(),
  salonId: uuid.optional(),
});

export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>;

export const salonSetupSchema = z.object({
  salon: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    phone: phoneSchema,
    address: z.string().trim().min(3).max(240),
    district: z.string().trim().min(2).max(80),
    juicePhone: phoneSchema.optional().nullable(),
    juiceAccountName: z.string().trim().max(120).optional().nullable(),
    logoUrl: z.string().url().optional().nullable(),
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#18181b"),
    bookingTitle: z.string().trim().max(160).optional().nullable(),
    cancellationPolicy: z.string().trim().max(1000).optional().nullable(),
    depositDeadlineMinutes: z.number().int().min(5).max(1440).default(30),
  }),
  staff: z.array(z.object({ id: uuid.optional(), name: z.string().trim().min(2).max(100), phone: phoneSchema.optional().nullable(), isActive: z.boolean().default(true) })).max(50),
  services: z.array(z.object({ id: uuid.optional(), name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional().nullable(), durationMinutes: z.number().int().min(15).max(480), priceMur: z.number().nonnegative(), depositRequiredMur: z.number().nonnegative().default(0), isActive: z.boolean().default(true) })).max(100),
  workingHours: z.array(z.object({ staffId: uuid.optional().nullable(), dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), isClosed: z.boolean().default(false) })).max(100),
});

export type SalonSetupInput = z.infer<typeof salonSetupSchema>;

export const closureSchema = z.object({
  salonId: uuid.optional(),
  staffId: uuid.optional().nullable(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(240).optional().nullable(),
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { message: "endsAt must be after startsAt" });
