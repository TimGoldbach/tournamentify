import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Exempt a route from the global ServiceTokenGuard (e.g. health checks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
