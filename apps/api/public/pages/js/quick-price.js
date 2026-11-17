/**
 * Quick price on /hire/quote: how many staff, how many Premium, how many
 * other, and for how long. Nothing else to fill in.
 *
 * Same rules as the full calculator (pages/js/quote-calc.js): each person is
 * billed for at least the minimum hours, longer shifts round up to the next
 * overrun block. "Other" roles are priced on the brief, so they are counted
 * but never put into the total. No rate lives here: they come from
 * window.VERGO_CONFIG.rates, which the server builds from pricing.ts.
 */
(function () {
  'use strict';

  var rates = window.VERGO_CONFIG && window.VERGO_CONFIG.rates;
  var form = document.getElementById('quickPriceForm');
  if (!rates || !form) return;

  var totalEl = document.getElementById('qpTotal');
  var noteEl = document.getElementById('qpNote');
  var field = function (id) { return document.getElementById(id); };

  function count(id) {
    var el = field(id);
    if (!el) return 0;
    var n = Math.floor(Number(el.value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 0;
  }

  function money(value) {
    return '£' + value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function billedHours(hours) {
    var block = rates.overrunBlockMinutes;
    var minutes = Math.ceil((hours * 60) / block) * block;
    return Math.max(rates.minimumHours, minutes / 60);
  }

  function update() {
    var standard = count('qpStandard');
    var premium = rates.premiumEnabled ? count('qpPremium') : 0;
    var other = count('qpOther');
    var hours = Number(field('qpHours').value);
    var notes = [];

    if (!(hours > 0) || hours > 24 || (standard + premium + other) === 0) {
      totalEl.textContent = '—';
      noteEl.textContent = 'Add how many staff you need and for how long.';
      return;
    }

    var billed = billedHours(hours);
    var total = standard * billed * rates.standardRate + premium * billed * (rates.premiumRate || 0);
    totalEl.textContent = standard + premium > 0 ? money(Math.round(total * 100) / 100) : '—';

    if (standard + premium > 0) {
      notes.push((standard + premium) + (standard + premium === 1 ? ' person' : ' people') + ' for ' + billed + ' hours each.');
      if (billed > hours) notes.push(rates.minimumHours + '-hour minimum per person.');
      notes.push('Hours after midnight are ' + Math.round((rates.afterMidnightMultiplier - 1) * 100) + '% more.');
    }
    if (other > 0) notes.push('We price the other ' + (other === 1 ? 'role' : other + ' roles') + ' for you. Chefs from ' + money(rates.chefFromRate) + '/hr.');
    noteEl.textContent = notes.join(' ');
  }

  form.addEventListener('input', update);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  update();
})();
