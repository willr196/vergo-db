/**
 * /staff/shifts: what is coming up (offers to accept or decline, confirmed
 * shifts) and the jobs already worked. The same shifts API as the app, on the
 * website session: /api/v1/user/shifts.
 */
(function () {
  'use strict';
  var S = window.VergoStaff;
  var API = '/api/v1/user/shifts';
  var upcoming = document.getElementById('upcomingList');

  /** Accepting is a commitment, so it asks for the terms tick first. */
  function offerActions(s) {
    return '<div class="form-field staff-terms">' +
      '<label class="checkbox-line"><input type="checkbox" data-terms="' + S.esc(s.id) + '"><span>I can work this shift and accept the shift terms</span></label></div>' +
      '<div class="btn-row"><button type="button" class="btn btn-primary" data-accept="' + S.esc(s.id) + '">Accept</button>' +
      '<button type="button" class="btn btn-secondary" data-decline="' + S.esc(s.id) + '">Decline</button></div>';
  }

  function load() {
    return Promise.all([
      S.request('GET', API + '?view=upcoming&limit=50'),
      S.request('GET', API + '?view=history&limit=50')
    ]).then(function (out) {
      var next = (out[0].body.data && out[0].body.data.shifts) || [];
      var past = (out[1].body.data && out[1].body.data.shifts) || [];
      upcoming.innerHTML = next.map(function (s) { return S.shiftItem(s, s.status === 'PENDING' ? offerActions(s) : ''); }).join('');
      document.getElementById('upcomingEmpty').hidden = next.length > 0;
      document.getElementById('historyList').innerHTML = past.map(function (s) { return S.shiftItem(s); }).join('');
      document.getElementById('historyEmpty').hidden = past.length > 0;
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('shiftsStatus', 'Could not load your shifts. Refresh to try again.', 'error');
    });
  }

  upcoming.addEventListener('click', function (event) {
    var accept = event.target.closest('[data-accept]');
    var decline = event.target.closest('[data-decline]');
    if (!accept && !decline) return;
    var id = (accept || decline).getAttribute(accept ? 'data-accept' : 'data-decline');
    var call;
    if (accept) {
      var terms = upcoming.querySelector('[data-terms="' + id + '"]');
      if (!terms || !terms.checked) {
        S.show('shiftsStatus', 'Tick the box to say you can work it and accept the shift terms.', 'error');
        return;
      }
      call = S.request('POST', API + '/' + encodeURIComponent(id) + '/confirm', { acceptedTerms: true });
    } else {
      if (!window.confirm('Decline this shift? We will offer it to someone else.')) return;
      call = S.request('POST', API + '/' + encodeURIComponent(id) + '/decline', {});
    }
    (accept || decline).disabled = true;
    call.then(function (r) {
      if (r.status === 200) {
        S.show('shiftsStatus', accept ? 'Shift accepted. See you there.' : 'Shift declined.', 'success');
        return load();
      }
      S.show('shiftsStatus', r.body.error || 'That did not work. Try again.', 'error');
      (accept || decline).disabled = false;
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('shiftsStatus', 'Could not reach VERGO. Try again.', 'error');
      (accept || decline).disabled = false;
    });
  });

  // The running order is only in the shift's own record: fetched the first
  // time its briefing is opened. 'toggle' does not bubble, so listen on capture.
  document.addEventListener('toggle', function (event) {
    var box = event.target;
    if (!box.matches || !box.matches('details[data-brief]') || !box.open || box.dataset.loaded) return;
    box.dataset.loaded = '1';
    S.request('GET', API + '/' + encodeURIComponent(box.getAttribute('data-brief'))).then(function (r) {
      var items = r.status === 200 && r.body.data && r.body.data.ops && r.body.data.ops.runningOrder;
      if (!items || !items.length) return;
      box.querySelector('.staff-brief-order').innerHTML = '<p><strong>Running order</strong></p><dl>' + items.map(function (i) {
        return '<dt>' + S.esc(i.time || 'Note') + '</dt><dd>' + S.esc(i.title) + (i.notes ? ' · ' + S.esc(i.notes) : '') + '</dd>';
      }).join('') + '</dl>';
    }).catch(function () {});
  }, true);

  load();
})();
