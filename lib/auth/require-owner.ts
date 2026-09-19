import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";
import type { Salon } from "@/types/database.types";

export type OwnerContext = {
  userId: string;
  salons: Pick<Salon, "id" | "slug" | "name">[];
};

export async function requireSalonOwner(): Promise<
  { ok: true; context: OwnerContext } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, response: jsonError("Unauthorized", 401) };
  }

  const { data: salons, error: salonError } = await supabase
    .from("salons")
    .select("id, slug, name")
    .eq("owner_id", user.id);

  if (salonError) {
    return { ok: false, response: jsonError("Failed to load salons", 500) };
  }

  if (!salons || salons.length === 0) {
    return { ok: false, response: jsonError("No salon found for this account", 404) };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      salons,
    },
  };
}

export function resolveOwnedSalonId(
  context: OwnerContext,
  requestedSalonId?: string,
): string | null {
  if (!requestedSalonId) {
    return context.salons[0]?.id ?? null;
  }
  return context.salons.some((salon) => salon.id === requestedSalonId)
    ? requestedSalonId
    : null;
}
