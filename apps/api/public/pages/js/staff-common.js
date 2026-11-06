/**
 * Shared by the signed-in staff pages (/staff, /staff/jobs, /staff/shifts,
 * /staff/applications, /staff/profile). Session auth: the browser sends the
 * vergo.sid cookie; a 401 sends them back to /staff/login.
 *
 * window.VergoStaff = { request, show, esc, day, money, statusTag, profile }
 */
(function () {
  'use strict';

  function toLogin(expired) {
    window.location.replace('/staff/login' + (expired ? '?expired=1' : ''));
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

  window.VergoStaff = { APP_STATUS: APP_STATUS, request: request, show: show, esc: esc, day: day, money: money, statusTag: statusTag, profile: profile, shiftItem: shiftItem, jobSummary: jobSummary };
})();
