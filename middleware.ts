import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Refresh session cookies (one DB call; user is surfaced back to us)
  const { response, user } = await updateSession(request);

  // Only guard /admin routes
  if (!pathname.startsWith("/admin")) {
    return response;
  }

  const isAuthPage = pathname === "/admin/login" || pathname === "/admin/signup";

  // Not authenticated → send to login (except when already on login page)
  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // Already authenticated → skip the login page, go straight to dashboard
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
