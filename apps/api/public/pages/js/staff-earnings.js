/**
 * /staff/earnings: estimated pay from the worker's shifts, by month, for this
 * tax year, and booked ahead. Amounts arrive in pence from
 * /api/v1/user/shifts/earnings, already split into basic and holiday pay.
 */
(function () {
  'use strict';
  var S = window.VergoStaff;

  function pounds(pence) {
    return '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function hrs(n) { return (Math.round(n * 10) / 10) + (n === 1 ? ' hour' : ' hours'); }
  function shifts(n) { return n + (n === 1 ? ' shift' : ' shifts'); }
  function monthName(ym) {
    var d = new Date(ym + '-15T12:00:00');
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  S.request('GET', '/api/v1/user/shifts/earnings').then(function (r) {
    var d = r.status === 200 && r.body.data;
    if (!d) return S.show('earningsStatus', 'Could not load your earnings. Refresh to try again.', 'error');

    document.getElementById('holidayNote').textContent =
      'Your hourly rate includes ' + d.holidayPercent + '% holiday pay, so we show the basic and holiday parts separately. ' +
      'Each shift is paid for at least ' + d.minimumHours + ' hours. These are estimates: your payslip shows what is actually paid.';

    // Pay day, and what has been earned since the last one (for early pay).
    var payLine = document.getElementById('payLine');
    var since = d.sinceLastPay;
    if (d.nextPayDay) {
      payLine.innerHTML = '<strong>Next pay day: ' + S.esc(S.day(d.nextPayDay)) + '.</strong> ' +
        (since && since.shifts ? 'Since the last one you have worked ' + shifts(since.shifts) + ', about ' + pounds(since.payPence) + '.' : 'Nothing worked since the last pay day yet.');
    } else {
      payLine.textContent = d.payFrequency === 'monthly' ? 'You are paid monthly.' : 'You are paid ' + String(d.payFrequency || '').replace('_', '-') + '.';
    }
    if (since && !since.shifts) document.getElementById('earlyPay').hidden = true;
    document.getElementById('payCard').hidden = false;

    document.getElementById('taxPay').textContent = pounds(d.taxYear.payPence);
    document.getElementById('taxSub').textContent = shifts(d.taxYear.shifts) + ', ' + hrs(d.taxYear.hours) + ' since ' + S.day(d.taxYearFrom);
    document.getElementById('aheadPay').textContent = pounds(d.upcoming.payPence);
    document.getElementById('aheadSub').textContent = d.upcoming.shifts ? shifts(d.upcoming.shifts) + ' confirmed' : 'Nothing confirmed yet';
    document.getElementById('earningsTotals').hidden = false;

    var table = document.getElementById('monthTable');
    if (d.months.length) {
      table.querySelector('tbody').innerHTML = d.months.map(function (m) {
        return '<tr><td>' + S.esc(monthName(m.month)) + '</td><td class="num">' + m.shifts + '</td><td class="num">' + (Math.round(m.hours * 10) / 10) +
          '</td><td class="num">' + pounds(m.basicPence) + '</td><td class="num">' + pounds(m.holidayPence) + '</td><td class="num"><strong>' + pounds(m.payPence) + '</strong></td></tr>';
      }).join('');
      table.hidden = false;
    } else {
      document.getElementById('monthEmpty').hidden = false;
    }

    document.getElementById('earnShifts').innerHTML = d.shifts.map(function (s) {
      return '<li class="staff-item"><h3>' + S.esc(s.title) + '</h3>' +
        '<p>' + S.esc(S.day(s.eventDate)) + (s.where ? ' · ' + S.esc(s.where) : '') + '</p>' +
        '<p>' + hrs(s.hours) + (s.hoursAreActual ? '' : ' (booked)') + ' at ' + S.esc(S.money(s.rate)) + '/hr · <strong>' + pounds(s.payPence) + '</strong>' +
        ' <span class="staff-split">(' + pounds(s.basicPence) + ' basic + ' + pounds(s.holidayPence) + ' holiday)</span></p></li>';
    }).join('');

    if (d.shiftsWithoutRate) {
      var note = document.getElementById('noRateNote');
      note.textContent = shifts(d.shiftsWithoutRate) + ' not counted because the rate or hours are not on record yet. Ask us if that looks wrong.';
      note.hidden = false;
    }
  }).catch(function (err) {
    if (err && err.message === 'signed-out') return;
    S.show('earningsStatus', 'Could not load your earnings. Refresh to try again.', 'error');
  });

  document.getElementById('earlyPaySend').addEventListener('click', function () {
    var button = this;
    var note = document.getElementById('earlyPayNote').value.trim();
    button.disabled = true;
    S.request('POST', '/api/v1/user/shifts/early-pay', note ? { note: note } : {}).then(function (r) {
      if (r.status === 200) {
        S.show('earningsStatus', r.body.data.emailed
          ? 'Sent. The office will look at it and come back to you.'
          : 'Saved, but the office email did not go. Please call us about it too.', 'success');
        document.getElementById('earlyPay').open = false;
        return;
      }
      S.show('earningsStatus', r.body.error || 'That did not go through. Try again.', 'error');
      button.disabled = false;
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('earningsStatus', 'Could not reach VERGO. Try again.', 'error');
      button.disabled = false;
    });
  });
})();
