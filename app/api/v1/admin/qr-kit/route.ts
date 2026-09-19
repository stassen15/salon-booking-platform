import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hexColor(value: string): ReturnType<typeof rgb> {
  const clean = value.replace("#", "");
  return rgb(parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { data: salon, error } = await supabase.from("salons").select("name, slug, brand_color, booking_title, address, district").eq("owner_id", user.id).eq("is_active", true).maybeSingle();
  if (error) return jsonError("Failed to load salon", 500, error.message);
  if (!salon) return jsonError("Salon not found", 404);
  const origin = new URL(request.url).origin;
  const bookingUrl = `${origin}/${salon.slug}`;
  const qrDataUrl = await QRCode.toDataURL(bookingUrl, { width: 900, margin: 2, errorCorrectionLevel: "H" });
  const qrBytes = Uint8Array.from(Buffer.from(qrDataUrl.split(",")[1], "base64"));
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = hexColor(salon.brand_color);
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.97, 0.97, 0.96) });
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color });
  page.drawText(salon.name, { x: 42, y: 802, size: 24, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Scan to book your next appointment", { x: 42, y: 716, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1), maxWidth: 510 });
  page.drawText(salon.booking_title ?? "Fast, easy booking - choose your service and time", { x: 42, y: 684, size: 12, font, color: rgb(0.35, 0.35, 0.35), maxWidth: 500 });
  const qr = await pdf.embedPng(qrBytes);
  page.drawImage(qr, { x: 122, y: 285, width: 350, height: 350 });
  page.drawText("Point your phone camera here", { x: 175, y: 250, size: 14, font: bold, color });
  page.drawText(bookingUrl, { x: 80, y: 220, size: 10, font, color: rgb(0.35, 0.35, 0.35), maxWidth: 435 });
  page.drawText("Book in under 45 seconds", { x: 180, y: 145, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`${salon.address}, ${salon.district}`, { x: 150, y: 112, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText("Keep this stand visible at the counter", { x: 169, y: 72, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
  const pdfBytes = await pdf.save();
  return new Response(pdfBytes as unknown as BodyInit, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${salon.slug}-booking-qr-kit.pdf"`, "Cache-Control": "no-store" } });
}
