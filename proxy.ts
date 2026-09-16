import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/env";

const PROTECTED_PREFIXES = [
  "/account",
  "/admin",
  "/cart",
  "/checkout",
  "/orders",
  "/wishlist",
];

const GUEST_ONLY_PREFIXES = ["/login", "/signup"];

const matchesPrefix = (path: string, prefixes: string[]) =>
  prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Keeps a refreshed session out of any CDN or reverse-proxy cache,
        // which would otherwise hand one user's tokens to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Must run before the response is returned: it both refreshes an expiring
  // token and triggers the setAll above that writes the new cookies.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;

  if (!isAuthenticated && matchesPrefix(path, PROTECTED_PREFIXES)) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && matchesPrefix(path, GUEST_ONLY_PREFIXES)) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
