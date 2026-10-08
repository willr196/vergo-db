/**
 * The handful of vitest matchers the desktop tool's tests use, on node:test
 * and node:assert, so those tests run here word for word (scheduling*.test.ts).
 */

import assert from 'node:assert/strict';

type Thrown = RegExp | string | (new (...args: any[]) => Error);

function matchers(actual: unknown, negate: boolean) {
  const check = (pass: boolean, message: string) => assert.ok(negate ? !pass : pass, negate ? `not: ${message}` : message);
  return {
    toBe: (expected: unknown) => check(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: (expected: unknown) => {
      let pass = true;
      try { assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected))); } catch { pass = false; }
      check(pass, `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    },
    toContain: (item: unknown) => check((actual as any[] | string).includes(item as never), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`),
    toHaveLength: (n: number) => check((actual as { length: number }).length === n, `expected length ${(actual as { length: number }).length} to be ${n}`),
    toBeInstanceOf: (cls: new (...args: any[]) => unknown) => check(actual instanceof cls, `expected an instance of ${cls.name}`),
    toThrow: (expected?: Thrown) => {
      let error: unknown;
      try { (actual as () => unknown)(); } catch (e) { error = e; }
      let pass = error !== undefined;
      if (pass && expected instanceof RegExp) pass = expected.test(String((error as Error)?.message ?? error));
      else if (pass && typeof expected === 'string') pass = String((error as Error)?.message ?? error).includes(expected);
      else if (pass && typeof expected === 'function') pass = error instanceof expected;
      check(pass, `expected to throw ${String(expected ?? 'an error')}, got ${String(error)}`);
    },
  };
}

export function expect(actual: unknown) {
  return { ...matchers(actual, false), not: matchers(actual, true) };
}
