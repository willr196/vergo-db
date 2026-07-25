import test from 'node:test';
import assert from 'node:assert/strict';

import { summariseChecks, isCheckCurrent } from '../services/rightToWork';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const future = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
const past = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const check = (overrides: Partial<{
  outcome: string;
  expiresAt: Date | null;
  checkedAt: Date;
  checkedBy: string;
}> = {}) => ({
  outcome: 'PASS',
  expiresAt: null,
  checkedAt: past(1),
  checkedBy: 'willr196',
  ...overrides,
});

test('an applicant with no checks is not cleared to work', () => {
  const summary = summariseChecks([], NOW);
  assert.equal(summary.status, 'NOT_CHECKED');
  assert.equal(summary.clearedToWork, false);
});

test('a passed check with no expiry clears the worker permanently (List A)', () => {
  const summary = summariseChecks([check({ expiresAt: null })], NOW);
  assert.equal(summary.status, 'PASSED');
  assert.equal(summary.clearedToWork, true);
  assert.equal(summary.expiresAt, null);
});

test('a passed check with a future expiry clears the worker (List B, in date)', () => {
  const summary = summariseChecks([check({ expiresAt: future(30) })], NOW);
  assert.equal(summary.status, 'PASSED');
  assert.equal(summary.clearedToWork, true);
});

test('a passed check that has expired does NOT clear the worker', () => {
  const summary = summariseChecks([check({ expiresAt: past(1) })], NOW);
  assert.equal(summary.status, 'EXPIRED');
  assert.equal(summary.clearedToWork, false);
});

test('a failed check does not clear the worker', () => {
  const summary = summariseChecks([check({ outcome: 'FAIL' })], NOW);
  assert.equal(summary.status, 'FAILED');
  assert.equal(summary.clearedToWork, false);
});

test('a pending check does not clear the worker', () => {
  const summary = summariseChecks([check({ outcome: 'PENDING' })], NOW);
  assert.equal(summary.status, 'PENDING');
  assert.equal(summary.clearedToWork, false);
});

test('a newer valid check overrides an older expired one', () => {
  const summary = summariseChecks([
    check({ expiresAt: past(10), checkedAt: past(400) }),
    check({ expiresAt: future(90), checkedAt: past(2) }),
  ], NOW);
  assert.equal(summary.status, 'PASSED');
  assert.equal(summary.clearedToWork, true);
  assert.deepEqual(summary.expiresAt, future(90));
});

test('an older valid check is not overridden by a newer failed one', () => {
  // A later FAIL against a different document must not silently revoke cover
  // that a still-valid earlier check legitimately provides.
  const summary = summariseChecks([
    check({ outcome: 'PASS', expiresAt: future(60), checkedAt: past(30) }),
    check({ outcome: 'FAIL', checkedAt: past(1) }),
  ], NOW);
  assert.equal(summary.clearedToWork, true);
});

test('expiry exactly at the current instant is treated as expired', () => {
  assert.equal(isCheckCurrent({ outcome: 'PASS', expiresAt: NOW }, NOW), false);
});

test('a non-passed outcome is never current regardless of expiry', () => {
  assert.equal(isCheckCurrent({ outcome: 'PENDING', expiresAt: future(365) }, NOW), false);
  assert.equal(isCheckCurrent({ outcome: 'FAIL', expiresAt: future(365) }, NOW), false);
});
