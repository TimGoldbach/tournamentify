import { cookies } from "next/headers";

// Server-only: relies on next/headers cookies(), which is unavailable in the
// browser bundle. Import only from route handlers / server actions.

const ANON_COOKIE = "tfy_anon";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Returns the opaque guest token for the current browser, creating (and
 * persisting) one on first use. Lets anonymous visitors own tournaments before
 * they sign in; on login those are claimed via the /api/claim route.
 *
 * Must run in a context where cookies can be written (route handler, server
 * action). The BFF proxy forwards this value as the `x-anon-token` header.
 */
export async function getOrCreateAnonToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANON_COOKIE)?.value;
  if (existing) return existing;

  const token = crypto.randomUUID();
  cookieStore.set(ANON_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return token;
}
