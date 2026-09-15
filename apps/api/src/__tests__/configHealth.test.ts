import test from 'node:test';
import assert from 'node:assert/strict';
import { reportConfigProblem, configProblems } from '../configHealth';

test('a reported problem shows up, and null clears it', () => {
  reportConfigProblem('EXAMPLE_SECRET', 'EXAMPLE_SECRET is missing or empty');
  assert.deepEqual(
    configProblems().filter((p) => p.setting === 'EXAMPLE_SECRET'),
    [{ setting: 'EXAMPLE_SECRET', message: 'EXAMPLE_SECRET is missing or empty' }]
  );

  reportConfigProblem('EXAMPLE_SECRET', null);
  assert.equal(configProblems().some((p) => p.setting === 'EXAMPLE_SECRET'), false);
});

test('re-reporting the same setting replaces rather than duplicates', () => {
  reportConfigProblem('EXAMPLE_SECRET', 'first');
  reportConfigProblem('EXAMPLE_SECRET', 'second');
  const found = configProblems().filter((p) => p.setting === 'EXAMPLE_SECRET');
  assert.equal(found.length, 1);
  assert.equal(found[0].message, 'second');
  reportConfigProblem('EXAMPLE_SECRET', null);
});

test('problems come back sorted by setting name', () => {
  reportConfigProblem('ZZZ_SECRET', 'z');
  reportConfigProblem('AAA_SECRET', 'a');
  const names = configProblems().map((p) => p.setting);
  assert.deepEqual(names, [...names].sort());
  reportConfigProblem('ZZZ_SECRET', null);
  reportConfigProblem('AAA_SECRET', null);
});
