/**
 * /staff/availability: the "taking work" status and usual availability (saved
 * through /api/v1/user/profile), and dated windows they are free (the app's
 * /api/v1/web/worker/availability, on the website session).
 */
(function () {
  'use strict';
  var S = window.VergoStaff;
  var WINDOWS = '/api/v1/web/worker/availability';
  var statusForm = document.getElementById('statusForm');
  var windowForm = document.getElementById('windowForm');

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  S.profile.then(function (p) {
    if (!p) return;
    var picked = statusForm.querySelector('input[value="' + (p.availabilityStatus || 'UNAVAILABLE') + '"]');
    if (picked) picked.checked = true;
    statusForm.elements.availability.value = p.availability || '';
  }).catch(function () {});

  statusForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var picked = statusForm.querySelector('input[name="status"]:checked');
    if (!picked) return S.show('statusStatus', 'Choose whether you are taking work.', 'error');
    var button = statusForm.querySelector('button[type="submit"]');
    button.disabled = true;
    document.getElementById('statusStatus').hidden = true;
    S.request('PUT', '/api/v1/user/profile', { availabilityStatus: picked.value, availability: statusForm.elements.availability.value.trim() })
      .then(function (r) {
        S.show('statusStatus', r.status === 200 ? 'Saved.' : (r.body.error || 'That did not save. Try again.'), r.status === 200 ? 'success' : 'error');
      })
      .catch(function (err) {
        if (err && err.message !== 'signed-out') S.show('statusStatus', 'Could not reach VERGO. Try again.', 'error');
      })
      .finally(function () { button.disabled = false; });
  });

  function renderWindows(windows) {
    var today = todayIso();
    var upcoming = windows.filter(function (w) { return String(w.dateTo).slice(0, 10) >= today; });
    document.getElementById('windowList').innerHTML = upcoming.map(function (w) {
      var from = String(w.dateFrom).slice(0, 10);
      var to = String(w.dateTo).slice(0, 10);
      return '<li class="staff-item"><h3>' + S.esc(S.day(from)) + (to !== from ? ' to ' + S.esc(S.day(to)) : '') + '</h3>' +
        (w.notes ? '<p>' + S.esc(w.notes) + '</p>' : '') +
        '<div class="btn-row"><button type="button" class="btn btn-secondary" data-remove="' + S.esc(w.id) + '">Remove</button></div></li>';
    }).join('');
    document.getElementById('windowsEmpty').hidden = upcoming.length > 0;
  }

  function loadWindows() {
    return S.request('GET', WINDOWS).then(function (r) {
      renderWindows(r.body.availability || r.body.data || []);
    }).catch(function (err) {
      if (err && err.message !== 'signed-out') S.show('windowStatus', 'Could not load your dates. Refresh to try again.', 'error');
    });
  }

  windowForm.elements.dateFrom.min = todayIso();
  windowForm.elements.dateTo.min = todayIso();
  windowForm.elements.dateFrom.addEventListener('change', function () {
    windowForm.elements.dateTo.min = windowForm.elements.dateFrom.value || todayIso();
    if (!windowForm.elements.dateTo.value) windowForm.elements.dateTo.value = windowForm.elements.dateFrom.value;
  });

  windowForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var from = windowForm.elements.dateFrom.value;
    var to = windowForm.elements.dateTo.value || from;
    if (!from) return S.show('windowStatus', 'Pick the first day.', 'error');
    if (from < todayIso()) return S.show('windowStatus', 'Pick a day from today onwards.', 'error');
    if (to < from) return S.show('windowStatus', 'The last day is before the first.', 'error');
    var button = windowForm.querySelector('button[type="submit"]');
    button.disabled = true;
    document.getElementById('windowStatus').hidden = true;
    S.request('POST', WINDOWS, { dateFrom: from, dateTo: to, notes: windowForm.elements.notes.value.trim() || undefined })
      .then(function (r) {
        if (r.status === 201) {
          windowForm.reset();
          S.show('windowStatus', 'Dates added.', 'success');
          return loadWindows();
        }
        S.show('windowStatus', r.body.error || 'Those dates did not save. Try again.', 'error');
      })
      .catch(function (err) {
        if (err && err.message !== 'signed-out') S.show('windowStatus', 'Could not reach VERGO. Try again.', 'error');
      })
      .finally(function () { button.disabled = false; });
  });

  document.getElementById('windowList').addEventListener('click', function (event) {
    var b = event.target.closest('[data-remove]');
    if (!b) return;
    b.disabled = true;
    S.request('DELETE', WINDOWS + '/' + encodeURIComponent(b.getAttribute('data-remove')))
      .then(function () { return loadWindows(); })
      .catch(function () { b.disabled = false; });
  });

  loadWindows();
})();
