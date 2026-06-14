import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API routes (incl. the BFF proxy), Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
