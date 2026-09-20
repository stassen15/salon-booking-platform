import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "@/app/admin/_components/AdminNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/admin/login");
  }

  const { data: salon } = await supabase
    .from("salons")
    .select("id, name, slug")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  // Onboarding fallback — no salon yet
  if (!salon) redirect("/admin/setup");

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <AdminNav salonName={salon.name} />
      <main className="min-h-screen pb-32 touch-pan-y overscroll-y-auto">{children}</main>
    </div>
  );
}
