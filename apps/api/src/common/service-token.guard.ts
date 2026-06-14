import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";

/**
 * Nest is private behind the Next BFF. Every request must carry the shared
 * x-bff-service-token. Routes marked @Public() (e.g. health) are exempt.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const expected = process.env.BFF_SERVICE_TOKEN;
    if (!expected) {
      // Fail closed. main.ts validates this at boot, so we should never get here.
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers["x-bff-service-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;

    if (typeof token !== "string" || !this.safeEqual(token, expected)) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    return timingSafeEqual(bufferA, bufferB);
  }
}
