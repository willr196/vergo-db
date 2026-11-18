/**
 * Shared by the signed-in staff pages (/staff, /staff/jobs, /staff/shifts,
 * /staff/applications, /staff/profile). Session auth: the browser sends the
 * vergo.sid cookie; a 401 sends them back to /staff/login.
 *
 * window.VergoStaff = { request, show, esc, day, money, statusTag, profile }
 */
(function () {
  'use strict';

  /** To the login page, which brings them back here once they are in. */
  function toLogin(expired) {
    var here = window.location.pathname + window.location.search;
    var q = [];
    if (expired) q.push('expired=1');
    if (here !== '/staff' && /^\/staff\//.test(here)) q.push('next=' + encodeURIComponent(here));
    window.location.replace('/staff/login' + (q.length ? '?' + q.join('&') : ''));
  }

  /** JSON in and out; resolves { status, body }. A 401 leaves the page. */
  function request(method, url, payload) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          // "You were logged out" only when a session actually timed out.
          toLogin(data.code === 'SESSION_EXPIRED' || data.code === 'SESSION_IDLE');
          throw new Error('signed-out');
        }
        return { status: res.status, body: data };
      });
    });
  }

  function show(id, message, state) {
    var box = document.getElementById(id);
    if (!box) return;
    box.textContent = message;
    box.dataset.state = state;
    box.hidden = !message;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** "Sat 12 Dec 2026" from an ISO date, read as a calendar day. */
  function day(iso) {
    if (!iso) return 'Date to be confirmed';
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return 'Date to be confirmed';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function money(value) {
    return typeof value === 'number' ? '£' + value.toFixed(2) : '';
  }

  /** A small status label. tone: 'good', 'bad' or nothing. */
  function statusTag(label, tone) {
    return '<span class="staff-status"' + (tone ? ' data-tone="' + tone + '"' : '') + '>' + esc(label) + '</span>';
  }

  // Every staff page needs the profile (photo, name) and proves the session.
  // Signed out, this rejects after request() has already sent them to the
  // login page; pages that never read it must not log an unhandled rejection.
  var profile = request('GET', '/api/v1/user/profile').then(function (r) {
    return r.status === 200 ? (r.body.user || r.body.data) : null;
  });
  profile.catch(function () {});

  // Profile setup comes first: until they have added a photo, every staff page
  // sends them to /staff/profile, which is in setup mode while there is none.
  profile.then(function (p) {
    if (p && !p.profileImage && window.location.pathname !== '/staff/profile') {
      window.location.replace('/staff/profile');
    }
  }, function () {});

  // ── The bell: what needs their attention, worked out by the server ──
  function loadBell() {
    var bell = document.getElementById('staffBell');
    if (!bell) return;
    request('GET', '/api/v1/user/shifts/attention').then(function (r) {
      var d = r.status === 200 && r.body.data;
      if (!d) return;
      var badge = bell.querySelector('.staff-bell-count');
      badge.textContent = d.count;
      badge.hidden = !d.count;
      bell.querySelector('summary').setAttribute('aria-label', d.count ? d.count + (d.count === 1 ? ' thing needs' : ' things need') + ' your attention' : 'Nothing needs your attention');
      bell.querySelector('.staff-bell-list').innerHTML = d.items.length
        ? d.items.map(function (i) { return '<li><a href="' + esc(i.href) + '" data-kind="' + esc(i.kind) + '">' + esc(i.text) + '</a></li>'; }).join('')
        : '<li class="staff-bell-empty">You are all caught up.</li>';
    }).catch(function () {});
  }
  profile.then(function (p) { if (p) loadBell(); }, function () {});
  // Close the bell when tapping elsewhere.
  document.addEventListener('click', function (event) {
    var bell = document.getElementById('staffBell');
    if (bell && bell.open && !bell.contains(event.target)) bell.open = false;
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-staff-logout]')) return;
    fetch('/api/v1/user/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .then(function () { window.location.replace('/staff/login'); });
  });

  var SHIFT_STATUS = {
    PENDING: ['Offered: needs your answer', ''],
    CONFIRMED: ['Confirmed', 'good'],
    COMPLETED: ['Worked', 'good'],
    CANCELLED: ['Cancelled', 'bad'],
    REJECTED: ['Declined', 'bad'],
    NO_SHOW: ['Marked as a no-show', 'bad']
  };

  /** What they need on the day, from the Ops booking: a collapsed briefing. */
  function briefing(s) {
    var o = s.ops;
    var rows = [];
    function row(label, value) { if (value != null && String(value).trim() !== '') rows.push('<dt>' + esc(label) + '</dt><dd>' + value + '</dd>'); }
    if (o) {
      if (o.address) row('Address', esc(o.address) + ' · <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address) + '" target="_blank" rel="noopener">Map</a>');
      if (o.dressCode) row('Dress code', esc(o.dressCode));
      if (o.duties) row('What you will do', esc(o.duties));
      if (o.equipment) row('Bring', esc(o.equipment));
      if (o.breakInfo || o.breakMins) row('Breaks', esc(o.breakInfo || (o.breakMins + ' minutes')));
      if (o.onSiteContact) row('On the day, ask for', esc([o.onSiteContact.name, o.onSiteContact.phone].filter(Boolean).join(', ')) +
        (o.onSiteContact.phone ? ' · <a href="tel:' + esc(String(o.onSiteContact.phone).replace(/\s+/g, '')) + '">Call</a>' : ''));
      if (o.vergoLead) row('VERGO lead', esc(o.vergoLead));
      if (o.travelContribution != null) row('Travel', esc(money(o.travelContribution)) + ' towards travel');
      if (o.healthSafetyRisks) row('Safety', esc(o.healthSafetyRisks) + (o.riskControls ? '. ' + esc(o.riskControls) : ''));
      if (o.reference) row('Booking', esc(o.reference));
    }
    if (s.clientNotes) row('Notes', esc(s.clientNotes));
    if (!rows.length) return '';
    return '<details class="staff-brief" data-brief="' + esc(s.id) + '"><summary>Briefing</summary><dl>' + rows.join('') + '</dl>' +
      '<div class="staff-brief-order"></div></details>';
  }

  /** One shift as a list item. Actions (accept/decline) are added by the page. */
  function shiftItem(s, actionsHtml) {
    var st = SHIFT_STATUS[s.status] || [s.status, ''];
    var where = [s.venue, s.location].filter(Boolean).join(', ');
    var pay = s.expectedPay != null
      ? money(s.expectedPay) + (s.status === 'COMPLETED' ? ' pay' : ' expected')
      : (s.staffPayRate != null ? money(s.staffPayRate) + '/hr' : '');
    return '<li class="staff-item" data-shift="' + esc(s.id) + '">' +
      '<h3>' + esc(s.role || s.eventName || 'Shift') + statusTag(st[0], st[1]) + '</h3>' +
      '<p>' + esc(day(s.eventDate)) + (s.shiftStart ? ', ' + esc(s.shiftStart) + (s.shiftEnd ? '–' + esc(s.shiftEnd) : '') : '') + '</p>' +
      (where ? '<p>' + esc(where) + '</p>' : '') +
      (s.client && s.client.companyName ? '<p>For ' + esc(s.client.companyName) + '</p>' : '') +
      (pay ? '<p>' + esc(pay) + (s.hoursWorked != null ? ' · ' + esc(s.hoursWorked) + ' hours worked' : '') + '</p>' : '') +
      (s.status === 'PENDING' || s.status === 'CONFIRMED' ? briefing(s) : '') +
      (actionsHtml || '') +
      '</li>';
  }

  /** A job from the board: what, when, where, pay. */
  function jobSummary(j) {
    var pay = j.payRate != null ? money(j.payRate) + (j.payType === 'DAILY' ? ' a day' : j.payType === 'FIXED' ? ' for the job' : '/hr') : '';
    var when = day(j.eventDate) + (j.eventEndDate && String(j.eventEndDate).slice(0, 10) !== String(j.eventDate).slice(0, 10) ? ' to ' + day(j.eventEndDate) : '') +
      (j.shiftStart ? ', ' + j.shiftStart + (j.shiftEnd ? '–' + j.shiftEnd : '') : '');
    return '<p>' + esc(when) + '</p>' +
      '<p>' + esc([j.venue, j.location].filter(Boolean).join(', ')) + '</p>' +
      (pay ? '<p>' + esc(pay) + '</p>' : '');
  }

  /** Where a job application stands: [label, tone]. JobApplicationStatus. */
  var APP_STATUS = {
    PENDING: ['Applied', ''],
    REVIEWED: ['Applied: being looked at', ''],
    SHORTLISTED: ['Shortlisted', 'good'],
    CONFIRMED: ['You are on this job', 'good'],
    REJECTED: ['Not this time', 'bad'],
    WITHDRAWN: ['You withdrew', 'bad']
  };


  // ── Shift actions, shared by the overview and My shifts ─────────────
  // Offers: accept (with the terms tick) or decline. Confirmed shifts: add to
  // calendar, running late (on the day), can't make it. Each page sets
  // VergoStaff.onShiftChange to reload its lists after one of these.
  var SHIFTS_API = '/api/v1/user/shifts';

  /** The shift's start as a Date on the browser's clock, or null without a date. */
  function shiftStartDate(s) {
    var d = String(s.eventDate || '').slice(0, 10);
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s.shiftStart || ''));
    if (!d) return null;
    return new Date(d + 'T' + (m ? (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2] : '12:00') + ':00');
  }

  /** "in 2 days, 4 hours", "in 3 hours 10 min", or "" once started. */
  function countdown(s) {
    var start = shiftStartDate(s);
    if (!start) return '';
    var mins = Math.round((start.getTime() - Date.now()) / 60000);
    if (mins <= 0) return '';
    var days = Math.floor(mins / 1440), hours = Math.floor((mins % 1440) / 60), m = mins % 60;
    if (days >= 1) return 'in ' + days + (days === 1 ? ' day' : ' days') + (hours ? ', ' + hours + (hours === 1 ? ' hour' : ' hours') : '');
    if (hours >= 1) return 'in ' + hours + (hours === 1 ? ' hour' : ' hours') + (m ? ' ' + m + ' min' : '');
    return 'in ' + m + ' min';
  }

  /** The day of the shift, or the morning after one that ran late: the server's window. */
  function isShiftDay(s) {
    var d = String(s.eventDate || '').slice(0, 10);
    if (!d) return false;
    var day = new Date(d + 'T00:00:00Z').getTime();
    var now = Date.now();
    return now >= day - 4 * 3600000 && now <= day + 36 * 3600000;
  }

  function ymdPlus(iso, days) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  function googleCalendarUrl(s) {
    var d = ymdPlus(s.eventDate, 0);
    var a = /^(\d{1,2}):(\d{2})/.exec(String(s.shiftStart || ''));
    var b = /^(\d{1,2}):(\d{2})/.exec(String(s.shiftEnd || ''));
    var pad = function (n) { return (Number(n) < 10 ? '0' : '') + Number(n); };
    var dates;
    if (a) {
      var start = d + 'T' + pad(a[1]) + a[2] + '00';
      var overnight = b && Number(b[1]) * 60 + Number(b[2]) <= Number(a[1]) * 60 + Number(a[2]);
      dates = start + '/' + (b ? (overnight ? ymdPlus(s.eventDate, 1) : d) + 'T' + pad(b[1]) + b[2] + '00' : start);
    } else {
      dates = d + '/' + ymdPlus(s.eventDate, 1);
    }
    var where = [s.venue, (s.ops && s.ops.address) || s.location].filter(Boolean).join(', ');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('VERGO: ' + (s.role || s.eventName || 'Shift')) +
      '&dates=' + dates + '&ctz=Europe/London' + (where ? '&location=' + encodeURIComponent(where) : '');
  }

  var LATE_CHOICES = [10, 15, 20, 30, 45, 60, 90, 120];

  /** The buttons under a shift, by status. */
  function shiftActions(s) {
    var id = esc(s.id);
    if (s.status === 'PENDING') {
      return '<div class="form-field staff-terms">' +
        '<label class="checkbox-line"><input type="checkbox" data-terms="' + id + '"><span>I can work this shift and accept the shift terms</span></label></div>' +
        '<div class="btn-row"><button type="button" class="btn btn-primary" data-accept="' + id + '">Accept</button>' +
        '<button type="button" class="btn btn-secondary" data-decline="' + id + '">Decline</button></div>';
    }
    if (s.status !== 'CONFIRMED') return '';
    var late = '';
    if (isShiftDay(s)) {
      late = '<details class="staff-action" data-late-box="' + id + '"><summary>Running late</summary>' +
        '<div class="staff-action-body"><label for="late-' + id + '">About how late?</label>' +
        '<select id="late-' + id + '" data-late-minutes>' + LATE_CHOICES.map(function (n) {
          return '<option value="' + n + '">' + (n < 60 ? n + ' minutes' : n === 60 ? '1 hour' : (n / 60) + ' hours') + '</option>';
        }).join('') + '</select>' +
        '<label for="late-note-' + id + '">Anything to add? <span class="label-note">optional</span></label>' +
        '<input type="text" id="late-note-' + id + '" data-late-note maxlength="300" placeholder="e.g. train delayed">' +
        '<button type="button" class="btn btn-primary" data-late="' + id + '">Tell VERGO</button></div></details>';
    }
    return '<div class="staff-actions">' +
      '<div class="btn-row staff-cal">' +
        '<a class="btn btn-quiet" href="' + SHIFTS_API + '/' + id + '/calendar.ics" download>Add to calendar</a>' +
        '<a class="btn btn-quiet" href="' + esc(googleCalendarUrl(s)) + '" target="_blank" rel="noopener">Google Calendar</a>' +
      '</div>' + late +
      '<details class="staff-action" data-swap-box="' + id + '"><summary>Ask to swap</summary>' +
        '<div class="staff-action-body"><p>The office arranges every swap. You stay booked until they agree one.</p>' +
        '<label for="swap-' + id + '">Why do you want to swap?</label>' +
        '<textarea id="swap-' + id + '" data-swap-reason maxlength="500" rows="2"></textarea>' +
        '<label for="swap-who-' + id + '">Someone who could take it? <span class="label-note">optional</span></label>' +
        '<input type="text" id="swap-who-' + id + '" data-swap-colleague maxlength="120" placeholder="Their name">' +
        '<button type="button" class="btn btn-secondary" data-swap="' + id + '">Ask the office</button></div></details>' +
      '<details class="staff-action" data-cant-box="' + id + '"><summary>Can&#39;t make it</summary>' +
        '<div class="staff-action-body"><p>We will need to find cover, so tell us as early as you can.</p>' +
        '<label for="cant-' + id + '">Why can&#39;t you make it?</label>' +
        '<textarea id="cant-' + id + '" data-cant-reason maxlength="500" rows="3"></textarea>' +
        '<button type="button" class="btn btn-secondary" data-cant="' + id + '">Give up this shift</button></div></details>' +
      '</div>';
  }

  function actionStatusId() {
    return document.getElementById('shiftsStatus') ? 'shiftsStatus' : 'overviewStatus';
  }

  function runAction(button, call, done) {
    button.disabled = true;
    call.then(function (r) {
      if (r.status === 200) {
        show(actionStatusId(), done(r.body.data || {}), 'success');
        if (typeof window.VergoStaff.onShiftChange === 'function') window.VergoStaff.onShiftChange();
        loadBell();
        return;
      }
      show(actionStatusId(), r.body.error || 'That did not work. Try again.', 'error');
      button.disabled = false;
    }).catch(function (err) {
      if (err && err.message === 'signed-out') return;
      show(actionStatusId(), 'Could not reach VERGO. Try again, or call us.', 'error');
      button.disabled = false;
    });
  }

  function shiftUrl(id, action) {
    return SHIFTS_API + '/' + encodeURIComponent(id) + '/' + action;
  }

  // ── Timesheet: agree the hours on a worked shift, or say what is wrong ──
  var TIMESHEET_DAYS = 14;
  function timesheetActions(s) {
    if (s.timesheetConfirmedAt) return '<p class="staff-ts-done">' + statusTag('Hours agreed', 'good') + '</p>';
    if (s.timesheetQuery) return '<p class="staff-ts-done">' + statusTag('Hours queried', '') + ' <span class="staff-split">You said: ' + esc(s.timesheetQuery) + '</span></p>';
    var worked = s.status === 'COMPLETED' || s.status === 'CONFIRMED';
    var age = (Date.now() - new Date(String(s.eventDate).slice(0, 10) + 'T12:00:00Z').getTime()) / 86400000;
    if (!worked || age < 0 || age > TIMESHEET_DAYS) return '';
    var hours = s.hoursWorked != null ? s.hoursWorked : s.hoursEstimated;
    var id = esc(s.id);
    return '<div class="staff-ts" data-ts-box="' + id + '">' +
      '<p class="staff-ts-q"><strong>Are these hours right?</strong> ' + (hours != null ? esc(hours) + ' hours' : 'No hours recorded yet') +
        (s.checkedInAt && s.checkedOutAt ? ' (' + esc(clockOf(s.checkedInAt)) + ' to ' + esc(clockOf(s.checkedOutAt)) + ')' : '') + '</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-primary" data-ts-yes="' + id + '">Yes, that\'s right</button></div>' +
      '<details class="staff-action"><summary>Something\'s wrong</summary><div class="staff-action-body">' +
        '<label for="ts-' + id + '">What should they be?</label>' +
        '<textarea id="ts-' + id + '" data-ts-note maxlength="500" rows="3" placeholder="e.g. I finished at 00:30, not 23:30"></textarea>' +
        '<button type="button" class="btn btn-secondary" data-ts-no="' + id + '">Send to the office</button></div></details>' +
      '</div>';
  }
  /** "18:05" in London time, from an ISO timestamp. */
  function clockOf(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  }

  document.addEventListener('click', function (event) {
    var t = event.target;
    if (!t.closest) return;
    var swap = t.closest('[data-swap]');
    if (swap) {
      var sbox = swap.closest('[data-swap-box]');
      var why = sbox.querySelector('[data-swap-reason]').value.trim();
      var who = sbox.querySelector('[data-swap-colleague]').value.trim();
      if (why.length < 3) return show(actionStatusId(), 'Tell us briefly why you want to swap.', 'error');
      return runAction(swap, request('POST', shiftUrl(swap.getAttribute('data-swap'), 'swap-request'), who ? { reason: why, colleague: who } : { reason: why }), function (d) {
        return d.emailed ? 'Sent. The office will arrange it and let you know. You are still booked until then.' : 'The office email did not go. Please call us about the swap.';
      });
    }
    var tsYes = t.closest('[data-ts-yes]');
    var tsNo = t.closest('[data-ts-no]');
    if (tsYes) {
      return runAction(tsYes, request('POST', shiftUrl(tsYes.getAttribute('data-ts-yes'), 'timesheet'), { agree: true }), function () { return 'Thanks. Hours agreed.'; });
    }
    if (tsNo) {
      var tsNote = tsNo.closest('[data-ts-box]').querySelector('[data-ts-note]').value.trim();
      if (tsNote.length < 3) return show(actionStatusId(), 'Tell us what the hours should be.', 'error');
      return runAction(tsNo, request('POST', shiftUrl(tsNo.getAttribute('data-ts-no'), 'timesheet'), { agree: false, note: tsNote }), function (d) {
        return d.emailed ? 'Sent. The office will check the hours and come back to you.' : 'Saved, but the office email did not go. Please call us about it too.';
      });
    }
    var accept = t.closest('[data-accept]');
    var decline = t.closest('[data-decline]');
    var late = t.closest('[data-late]');
    var cant = t.closest('[data-cant]');
    if (accept) {
      var id = accept.getAttribute('data-accept');
      var terms = document.querySelector('[data-terms="' + id + '"]');
      if (!terms || !terms.checked) return show(actionStatusId(), 'Tick the box to say you can work it and accept the shift terms.', 'error');
      return runAction(accept, request('POST', shiftUrl(id, 'confirm'), { acceptedTerms: true }), function () { return 'Shift accepted. See you there.'; });
    }
    if (decline) {
      if (!window.confirm('Decline this shift? We will offer it to someone else.')) return;
      return runAction(decline, request('POST', shiftUrl(decline.getAttribute('data-decline'), 'decline'), {}), function () { return 'Shift declined.'; });
    }
    if (late) {
      var box = late.closest('[data-late-box]');
      var minutes = Number(box.querySelector('[data-late-minutes]').value);
      var note = box.querySelector('[data-late-note]').value.trim();
      return runAction(late, request('POST', shiftUrl(late.getAttribute('data-late'), 'running-late'), note ? { minutes: minutes, note: note } : { minutes: minutes }), function (d) {
        return d.emailed ? 'Thanks. The office knows you are running about ' + minutes + ' minutes late.' : 'We could not email the office just now. Please call us to say you are running late.';
      });
    }
    if (cant) {
      var cbox = cant.closest('[data-cant-box]');
      var reason = cbox.querySelector('[data-cant-reason]').value.trim();
      if (reason.length < 3) return show(actionStatusId(), 'Tell us briefly why, so we can find cover.', 'error');
      return runAction(cant, request('POST', shiftUrl(cant.getAttribute('data-cant'), 'cant-make-it'), { reason: reason }), function (d) {
        return d.emailed ? 'Thanks for telling us. The shift is given up and the office is finding cover.' : 'The shift is given up, but the office email did not go. Please call us as well.';
      });
    }
  });

  window.VergoStaff = { APP_STATUS: APP_STATUS, request: request, show: show, esc: esc, day: day, money: money, statusTag: statusTag, profile: profile, shiftItem: shiftItem, shiftActions: shiftActions, timesheetActions: timesheetActions, countdown: countdown, jobSummary: jobSummary, onShiftChange: null };
})();
