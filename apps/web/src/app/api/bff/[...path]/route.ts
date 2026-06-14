import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getOrCreateAnonToken } from "@/lib/anon";

/**
 * BFF proxy. The browser only ever talks to Next; this route forwards to the
 * private Nest API with a service token plus the resolved actor context
 * (logged-in user id and/or guest token). Response bodies are streamed through
 * untouched, so Server-Sent Events (live score updates) pass straight back to
 * the client.
 */

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
const SERVICE_TOKEN = process.env.BFF_SERVICE_TOKEN ?? "";

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.set("x-bff-service-token", SERVICE_TOKEN);
  headers.delete("host");

  // Forward the resolved actor so Nest can authorize on behalf of the caller.
  // Never trust client-supplied values for these — the BFF is the sole source.
  headers.delete("x-user-id");
  headers.delete("x-anon-token");

  const session = await auth();
  if (session?.user?.id) {
    // Logged in: act purely as the user. The guest->user bridge happens once
    // via /api/claim, so we deliberately do NOT also carry a guest identity.
    headers.set("x-user-id", session.user.id);
  } else {
    headers.set("x-anon-token", await getOrCreateAnonToken());
  }

  const hasBody = !(req.method === "GET" || req.method === "HEAD");
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error - duplex is required when streaming a request body
    duplex: "half",
    redirect: "manual",
  });

  // undici's fetch transparently decompresses the body, so the upstream
  // content-encoding/length no longer match res.body — forwarding them would
  // make the browser try to gunzip already-decoded bytes (and can break SSE).
  // Strip those plus hop-by-hop headers; keep the rest (e.g. content-type).
  const responseHeaders = new Headers(res.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

export const dynamic = "force-dynamic";
