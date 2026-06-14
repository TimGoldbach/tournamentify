import { cookies } from "next/headers";
import { auth } from "@/auth";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
const ANON_COOKIE = "tfy_anon";

/**
 * Reassigns tournaments created while anonymous to the now-logged-in user.
 * Called after sign-in; bridges the guest `x-anon-token` identity to the real
 * Nest user via POST /tournaments/claim.
 */
export async function POST(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const anonToken = cookieStore.get(ANON_COOKIE)?.value;
  if (!anonToken) {
    return Response.json({ claimed: 0 });
  }

  // Pass the guest token via the trusted server-side header (read from the
  // httpOnly cookie above), matching how Nest resolves the actor everywhere else.
  const res = await fetch(`${API_INTERNAL_URL}/tournaments/claim`, {
    method: "POST",
    headers: {
      "x-bff-service-token": process.env.BFF_SERVICE_TOKEN ?? "",
      "x-user-id": userId,
      "x-anon-token": anonToken,
    },
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
