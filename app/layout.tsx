import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salon Booking Platform",
  description:
    "Multi-tenant salon and barbershop booking for Mauritius with Juice payments and WhatsApp reminders.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-w-0 overflow-x-hidden antialiased">{children}</body>
    </html>
  );
}
