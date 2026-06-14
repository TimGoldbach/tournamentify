import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

export interface Actor {
  userId?: string;
  anonToken?: string;
}

function readHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  const header = Array.isArray(value) ? value[0] : value;
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return {
    userId: readHeader(request, "x-user-id"),
    anonToken: readHeader(request, "x-anon-token"),
  };
});
