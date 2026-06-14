// Auth.js (NextAuth v5) — full wiring lands in M1.
//
// Login/provider UX lives here in the frontend. Nest remains the data/identity
// store, reached privately through the BFF proxy
// (src/app/api/bff/[...path]/route.ts). On sign-in we will resolve/claim the
// matching Nest user record and forward the user context on each proxied call.
export {};
