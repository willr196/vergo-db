import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftPay, taxYearStart, shiftCalendar } from '../routes/mobileShifts';

test('shift pay: the all-in rate splits into basic and holiday, and they add back up', () => {
  const p = shiftPay(6, 15);
  assert.equal(p.payPence, 9000);
  assert.equal(p.basicPence + p.holidayPence, 9000);
  assert.equal(p.basicPence, 8031); // 90 / 1.1207
});

test('shift pay: a short shift is paid for the minimum hours', () => {
  const p = shiftPay(2.5, 14.24);
  assert.equal(p.hours, 4);
  assert.equal(p.payPence, 5696);
});

test('tax year starts on 6 April', () => {
  assert.equal(taxYearStart(new Date('2026-11-18T10:00:00Z')), '2026-04-06');
  assert.equal(taxYearStart(new Date('2027-04-05T10:00:00Z')), '2026-04-06');
  assert.equal(taxYearStart(new Date('2027-04-06T10:00:00Z')), '2027-04-06');
});

test('calendar file: London times, overnight shifts end the next day, text escaped', () => {
  const ics = shiftCalendar({
    id: 'abc', eventDate: new Date('2026-12-12T00:00:00Z'), shiftStart: '18:00', shiftEnd: '01:30',
    title: 'Bar staff', where: 'The Venue, 1 High St; London', details: 'Dress code: all black',
  }, new Date('2026-11-18T09:00:00Z'));
  assert.match(ics, /DTSTART;TZID=Europe\/London:20261212T180000\r\n/);
  assert.match(ics, /DTEND;TZID=Europe\/London:20261213T013000\r\n/);
  assert.match(ics, /LOCATION:The Venue\\, 1 High St\\; London\r\n/);
  assert.match(ics, /SUMMARY:VERGO: Bar staff\r\n/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('calendar file: no times gives an all-day entry', () => {
  const ics = shiftCalendar({ id: 'x', eventDate: new Date('2026-12-31T00:00:00Z'), shiftStart: null, shiftEnd: 'tbc', title: 'Shift', where: '', details: '' });
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
});

import { payDaysAround } from '../ops/settings';

test('pay days: the last on or before today and the next, clamped to short months', () => {
  assert.deepEqual(payDaysAround('2026-11-18', 28), { last: '2026-10-28', next: '2026-11-28' });
  assert.deepEqual(payDaysAround('2026-11-28', 28), { last: '2026-11-28', next: '2026-12-28' });
  assert.deepEqual(payDaysAround('2027-02-10', 31), { last: '2027-01-31', next: '2027-02-28' });
  assert.deepEqual(payDaysAround('2026-12-31', 31), { last: '2026-12-31', next: '2027-01-31' });
  assert.deepEqual(payDaysAround('2027-01-05', 15), { last: '2026-12-15', next: '2027-01-15' });
});
