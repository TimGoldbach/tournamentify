import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

// Auth.js (NextAuth v5). Login/provider UX lives here in the frontend; Nest
// remains the data/identity store, reached privately through the BFF proxy
// (src/app/api/bff/[...path]/route.ts). On first sign-in we sync/claim the
// matching Nest user record and stash its id + tier on the JWT so every
// proxied call can forward the user context.

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
];

// Local-dev only: a passwordless email login so contributors can sign in
// without configuring an OAuth client. Never registered in production.
if (process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      name: "Local Dev",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : undefined;
        if (!email) return null;
        return { id: email, email };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, account }) {
      // `user` is only present on first sign-in. Sync the Nest identity record
      // then and cache its id/tier on the token for subsequent requests.
      if (user) {
        try {
          const res = await fetch(`${API_INTERNAL_URL}/users/sync`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-bff-service-token": process.env.BFF_SERVICE_TOKEN ?? "",
            },
            body: JSON.stringify({
              provider: account?.provider ?? "credentials",
              providerId: user.id ?? user.email,
              email: user.email,
            }),
          });
          if (res.ok) {
            const synced = (await res.json()) as { id?: string; tier?: string };
            if (synced.id) token.userId = synced.id;
            if (synced.tier) token.tier = synced.tier;
          }
        } catch {
          // Swallow sync failures so a transient Nest outage never blocks login.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.userId === "string") {
          session.user.id = token.userId;
        }
        if (typeof token.tier === "string") {
          session.user.tier = token.tier;
        }
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      tier?: string;
    } & DefaultSession["user"];
  }
}
