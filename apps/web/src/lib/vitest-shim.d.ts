/**
 * Minimal ambient declaration for the `vitest` test API.
 *
 * The web workspace has no test runner wired up (and `vitest` is not installed
 * in its node_modules), but co-located *.spec.ts files are still type-checked by
 * `tsc -p apps/web/tsconfig.json` because the project globs `**\/*.ts`. Without
 * this shim those specs fail with "Cannot find module 'vitest'". The shim only
 * declares the surface our specs use; when the package is actually installed its
 * real types take precedence.
 */
declare module "vitest" {
  type TestFn = () => void | Promise<void>;

  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: TestFn): void;
  export function test(name: string, fn: TestFn): void;

  interface Assertion {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
  }
  export function expect(actual: unknown): Assertion;
}
