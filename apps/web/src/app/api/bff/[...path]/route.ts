import { NextRequest } from "next/server";

/**
 * BFF proxy. The browser only ever talks to Next; this route forwards to the
 * private Nest API with a service token (and, from M1, the authenticated user
 * context). Response bodies are streamed through untouched, so Server-Sent
 * Events (live score updates) pass straight back to the client.
 */

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
const SERVICE_TOKEN = process.env.BFF_SERVICE_TOKEN ?? "";

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.set("x-bff-service-token", SERVICE_TOKEN);
  headers.delete("host");
  // TODO (M1): resolve the Auth.js session here and forward a signed user id
  // header so Nest can authorize on behalf of the logged-in user.

  const hasBody = !(req.method === "GET" || req.method === "HEAD");
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error - duplex is required when streaming a request body
    duplex: "half",
    redirect: "manual",
  });

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

export const dynamic = "force-dynamic";
