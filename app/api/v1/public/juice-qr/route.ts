import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const phone = params.get("phone");
  const amount = params.get("amount");
  if (!phone || !amount) return new Response("Missing phone or amount", { status: 400 });
  const deepLink = `mcbjuice://pay?recipient=${encodeURIComponent(phone)}&amount=${encodeURIComponent(amount)}`;
  const png = await QRCode.toBuffer(deepLink, { type: "png", width: 480, margin: 2, errorCorrectionLevel: "M" });
  return new Response(png as unknown as BodyInit, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" } });
}
