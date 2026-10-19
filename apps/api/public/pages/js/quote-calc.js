/**
 * Prices one shift for the quote form. The browser copy of quoteShift() in
 * apps/api/src/config/pricing.ts; src/__tests__/pricing.test.ts runs both over
 * the same cases, so a change to one that is not made to the other fails CI.
 *
 * Per person: billed for at least the minimum, otherwise rounded up to the
 * next overrun block. Hours worked after midnight carry the uplift, or on New
 * Year's Eve the hours from 7pm carry the surcharge instead; the minimum's
 * padding carries neither. Senior roles are left out of the figure.
 *
 * No rate lives here. The rate card is passed in from window.VERGO_CONFIG.rates,
 * which the server builds from pricing.ts.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VergoQuoteCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 24 * 60;

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function isNewYearsEve(date) {
    return /^\d{4}-12-31$/.test(String(date || '').trim());
  }

  function clockMinutes(value) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    var minutes = Number(m[1]) * 60 + Number(m[2]);
    return minutes >= 0 && minutes < DAY ? minutes : null;
  }

  /**
   * input: { start, end, finishesNextDay, date, level, staff: [{ role, count, senior }] }
   * rates: { standardRate, premiumEnabled, premiumRate, minimumHours,
   *          overrunBlockMinutes, afterMidnightMultiplier,
   *          newYearsEveMultiplier, newYearsEveFromHour }
   */
  function quoteShift(input, rates) {
    var start = clockMinutes(input.start);
    var endClock = clockMinutes(input.end);
    if (start === null || endClock === null) return null;
    var end = endClock + (input.finishesNextDay ? DAY : 0);
    var workedMinutes = end - start;
    if (workedMinutes <= 0) return null;

    var block = rates.overrunBlockMinutes;
    var roundUp = function (minutes) { return Math.ceil(minutes / block) * block; };
    var billedMinutes = Math.max(rates.minimumHours * 60, roundUp(workedMinutes));
    var nyeFrom = isNewYearsEve(input.date) ? Math.max(start, rates.newYearsEveFromHour * 60) : null;
    var newYearsEveMinutes = nyeFrom === null ? 0 : Math.min(billedMinutes, roundUp(Math.max(0, end - nyeFrom)));
    var afterMidnightMinutes = newYearsEveMinutes ? 0 : Math.min(billedMinutes, roundUp(Math.max(0, end - DAY)));

    var premium = rates.premiumEnabled && input.level === 'premium';
    var rate = premium ? rates.premiumRate : rates.standardRate;
    var pricedPeople = 0;
    var seniorPeople = 0;
    (input.staff || []).forEach(function (s) {
      var n = Math.max(0, s.count || 0);
      if (s.senior) seniorPeople += n; else pricedPeople += n;
    });

    var base = round2(pricedPeople * (billedMinutes / 60) * rate);
    var uplift = round2(pricedPeople * rate * (
      (afterMidnightMinutes / 60) * (rates.afterMidnightMultiplier - 1) +
      (newYearsEveMinutes / 60) * (rates.newYearsEveMultiplier - 1)));
    return {
      rate: rate,
      workedMinutes: workedMinutes,
      billedMinutes: billedMinutes,
      afterMidnightMinutes: afterMidnightMinutes,
      newYearsEveMinutes: newYearsEveMinutes,
      pricedPeople: pricedPeople,
      seniorPeople: seniorPeople,
      base: base,
      uplift: uplift,
      total: round2(base + uplift)
    };
  }

  return { quoteShift: quoteShift };
});
