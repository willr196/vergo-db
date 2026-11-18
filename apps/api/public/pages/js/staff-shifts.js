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

  function load() {
    return Promise.all([
      S.request('GET', API + '?view=upcoming&limit=50'),
      S.request('GET', API + '?view=history&limit=50')
    ]).then(function (out) {
      var next = (out[0].body.data && out[0].body.data.shifts) || [];
      var past = (out[1].body.data && out[1].body.data.shifts) || [];
      upcoming.innerHTML = next.map(function (s) { return S.shiftItem(s, S.shiftActions(s)); }).join('');
      document.getElementById('upcomingEmpty').hidden = next.length > 0;
      document.getElementById('historyList').innerHTML = past.map(function (s) { return S.shiftItem(s, S.timesheetActions(s)); }).join('');
      document.getElementById('historyEmpty').hidden = past.length > 0;
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('shiftsStatus', 'Could not load your shifts. Refresh to try again.', 'error');
    });
  }

  S.onShiftChange = load;

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
