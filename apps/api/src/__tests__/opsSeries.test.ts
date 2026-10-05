import test from 'node:test';
import assert from 'node:assert/strict';

import { planSeriesDays, isoWeekday, type SeriesPlanInput } from '../ops/seriesPlan';

const MON_FRI = [1, 2, 3, 4, 5];
const base: SeriesPlanInput = { weekdays: MON_FRI, startsOn: '2026-08-31', endsOn: null, generatedThrough: '2026-10-30', aheadWeeks: 2, today: '2026-10-05' };

test('isoWeekday: Monday is 1 and Sunday is 7, not 0', () => {
  assert.equal(isoWeekday('2026-10-05'), 1);
  assert.equal(isoWeekday('2026-10-11'), 7);
});

test('carries on after the last day already made, never before it', () => {
  const plan = planSeriesDays(base); // horizon 19 Oct is before 30 Oct: nothing due
  assert.deepEqual(plan.dates, []);
  assert.equal(plan.through, '2026-10-30');

  const later = planSeriesDays({ ...base, today: '2026-10-26' }); // horizon 9 Nov
  assert.deepEqual(later.dates, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']);
  assert.equal(later.through, '2026-11-09');
});

test('a re-run with the new generatedThrough adds nothing twice', () => {
  const first = planSeriesDays({ ...base, today: '2026-10-26' });
  const again = planSeriesDays({ ...base, today: '2026-10-26', generatedThrough: first.through });
  assert.deepEqual(again.dates, []);
});

test('never back-fills the past after a long gap', () => {
  const plan = planSeriesDays({ ...base, generatedThrough: '2026-09-01', aheadWeeks: 1 });
  assert.equal(plan.dates[0], '2026-10-05');
  assert.ok(plan.dates.every((d) => d >= '2026-10-05' && d <= '2026-10-12'));
});

test('stops at the last day', () => {
  const plan = planSeriesDays({ ...base, today: '2026-10-26', endsOn: '2026-11-03' });
  assert.deepEqual(plan.dates, ['2026-11-02', '2026-11-03']);
  assert.equal(plan.through, '2026-11-03');
  assert.deepEqual(planSeriesDays({ ...base, today: '2026-11-10', endsOn: '2026-11-03', generatedThrough: plan.through }).dates, []);
});

test('only the chosen weekdays', () => {
  const plan = planSeriesDays({ weekdays: [6, 7], startsOn: '2026-10-05', endsOn: null, generatedThrough: '2026-10-05', aheadWeeks: 1, today: '2026-10-05' });
  assert.deepEqual(plan.dates, ['2026-10-10', '2026-10-11']);
});
