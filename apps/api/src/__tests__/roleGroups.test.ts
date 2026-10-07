import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRoleCounts, roleGroupLabel, roleNamesForLabel } from '../services/roleGroups';

const stored = [
  'Bar staff', 'Bartender', 'Bartenders', 'Waiting staff', 'Waiter', 'Kitchen porters',
  'Kitchen Porter', 'Runners', 'Hosts and front of house', 'Front of House', 'Chefs and cooks',
  'Chef', 'Barista'
];

test('old and new wording land in the apply form group', () => {
  assert.equal(roleGroupLabel('Bartender'), 'Bar staff');
  assert.equal(roleGroupLabel('waiter'), 'Waiting staff');
  assert.equal(roleGroupLabel('Front of House'), 'Hosts and front of house');
  assert.equal(roleGroupLabel('Chef'), 'Chefs and cooks');
  assert.equal(roleGroupLabel('Kitchen Porter'), 'Kitchen porters');
  assert.equal(roleGroupLabel('Barista'), 'Barista');
});

test('a filter label matches every stored name in its group', () => {
  assert.deepEqual(roleNamesForLabel('Bar staff', stored), ['Bar staff', 'Bartender', 'Bartenders']);
  assert.deepEqual(roleNamesForLabel('Waiting staff', stored), ['Waiting staff', 'Waiter']);
  // An old label still works, for a bookmarked or half-loaded filter.
  assert.deepEqual(roleNamesForLabel('Chef', stored), ['Chefs and cooks', 'Chef']);
  assert.deepEqual(roleNamesForLabel('Barista', stored), ['Barista']);
});

test('options merge counts, apply form order first, empty roles dropped', () => {
  const options = groupRoleCounts([
    { name: 'Barista', count: 1 },
    { name: 'Bartender', count: 3 },
    { name: 'Bar staff', count: 2 },
    { name: 'Waiting staff', count: 4 },
    { name: 'Runner', count: 0 }
  ]);
  assert.deepEqual(options, [
    { label: 'Waiting staff', count: 4 },
    { label: 'Bar staff', count: 5 },
    { label: 'Barista', count: 1 }
  ]);
});
