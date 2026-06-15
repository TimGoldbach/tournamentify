import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface Actor {
  userId?: string;
  anonToken?: string;
}

/** Minimal request shape we read — avoids a direct dependency on express types. */
interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
}

function readHeader(request: HttpRequest, name: string): string | undefined {
  const value = request.headers[name];
  const header = Array.isArray(value) ? value[0] : value;
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest<HttpRequest>();
  return {
    userId: readHeader(request, "x-user-id"),
    anonToken: readHeader(request, "x-anon-token"),
  };
});
