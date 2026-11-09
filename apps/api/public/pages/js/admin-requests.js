(function () {
  'use strict';

  // Staff requests: every booking request and question sent from the public
  // site (quote page, hire pages, special events briefs, contact form).
  // Stored as Contact rows; see saveWebsiteRequest in src/routes/quotes.ts.

  var esc   = AdminCore.escapeHtml;
  var get   = AdminCore.fetchJSON;
  var toast = function (m, t) { AdminCore.toast(m, t || 'info'); };

  var requests = [];
  var filters = { type: '', status: '', search: '' };

  var STATUS_LABEL = { NEW: 'New', CONTACTED: 'Contacted', QUOTED: 'Quoted', BOOKED: 'Booked', LOST: 'Lost' };
  var TYPE_LABEL = { STAFF_REQUEST: 'Booking request', GENERAL: 'Question' };

  // The event forms send a brief, not a question, and say so in the event type.
  // Read here rather than when saving, so briefs already in the Inbox read right too.
  function requestLabel(r) {
    if (r.type === 'GENERAL') {
      var kind = String(r.eventType || '');
      var season = kind.match(/(Christmas|New Year's Eve|Seasonal) \(Special Events\)/);
      if (season) return season[1] + ' brief';
      if (/Full event/.test(kind)) return 'Full event brief';
      if (/Special Events/.test(kind)) return 'Special events brief';
    }
    return TYPE_LABEL[r.type] || r.type || 'Request';
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
  }

  function fmtDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function parseRoles(raw) {
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [String(raw)];
    } catch (_) {
      return [String(raw)];
    }
  }

  function summary(req) {
    var bits = [];
    if (req.staffCount) bits.push(req.staffCount + ' staff');
    if (req.eventType) bits.push(req.eventType);
    var roles = parseRoles(req.roles);
    if (roles.length) bits.push(roles.join(', '));
    return bits.length ? bits.join(' · ') : (req.subject || '');
  }

  // ── Load ────────────────────────────────────────────────
  async function load() {
    try {
      requests = await get('/api/v1/contacts') || [];
      updateStats();
      render();
    } catch (e) {
      document.getElementById('requests-body').innerHTML =
        AdminCore.renderEmptyState(6, 'Failed to load requests: ' + e.message);
    }
  }

  function updateStats() {
    var pool = requests.filter(function (r) { return !filters.type || r.type === filters.type; });
    function count(status) { return pool.filter(function (r) { return r.status === status; }).length; }
    document.getElementById('stat-total').textContent = pool.length;
    ['NEW', 'CONTACTED', 'QUOTED', 'BOOKED', 'LOST'].forEach(function (s) {
      document.getElementById('stat-' + s.toLowerCase()).textContent = count(s);
    });
  }

  function visible() {
    var q = filters.search.trim().toLowerCase();
    return requests.filter(function (r) {
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.company, r.eventType, r.message].filter(Boolean)
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    var rows = visible();
    var tbody = document.getElementById('requests-body');
    document.getElementById('request-count').textContent = rows.length + (rows.length === 1 ? ' request' : ' requests');

    if (!rows.length) {
      tbody.innerHTML = AdminCore.renderEmptyState(6, requests.length ? 'No requests match these filters' : 'No requests yet. New ones from the website appear here.');
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var id = esc(r.id);
      var contact = r.email
        ? '<a class="detail-link fs-sm" href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>'
        : (r.phone ? '<a class="detail-link fs-sm" href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : '');
      return '<tr>'
        + '<td><div class="as-stack">'
          + '<span class="as-stack-title">' + esc(r.name) + (r.company ? ' <span class="text-muted fs-sm">· ' + esc(r.company) + '</span>' : '') + '</span>'
          + contact
        + '</div></td>'
        + '<td><div class="as-stack">'
          + '<span class="as-stack-title">' + esc(requestLabel(r)) + '</span>'
          + '<span class="text-muted fs-sm">' + esc(summary(r)) + '</span>'
        + '</div></td>'
        + '<td class="fs-sm">' + (r.eventDate ? esc(eventDates(r)) : '<span class="text-muted">-</span>') + '</td>'
        + '<td>' + statusBadge(r.status) + '</td>'
        + '<td class="text-muted fs-sm">' + esc(fmtDate(r.createdAt)) + '</td>'
        + '<td><div class="as-row-actions">'
          + '<button type="button" class="btn btn-ghost btn-sm" data-action="open-detail" data-id="' + id + '">View</button>'
          + '<button type="button" class="btn btn-secondary btn-sm" data-action="board-form" data-id="' + id + '">'
            + (boardRefs(r).length ? 'On the board' : 'Add to board') + '</button>'
          + '<button type="button" class="btn btn-danger-quiet btn-sm" data-action="delete" data-id="' + id + '">Delete</button>'
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  // ── Detail ──────────────────────────────────────────────
  function find(id) {
    return requests.find(function (r) { return r.id === id; }) || null;
  }

  function row(label, value) {
    return '<div class="detail-row"><span class="detail-label">' + esc(label) + '</span>'
      + '<span class="detail-value">' + value + '</span></div>';
  }

  function openDetail(id) {
    var r = find(id);
    if (!r) return;
    var roles = parseRoles(r.roles);

    document.getElementById('modal-title').textContent = requestLabel(r) + ' from ' + r.name;
    document.getElementById('modal-body').innerHTML =
      '<div class="detail-grid mb-2">'
        + row('Name', esc(r.name))
        + row('Company', r.company ? esc(r.company) : '<span class="text-muted">Not given</span>')
        + row('Email', r.email ? '<a class="detail-link" href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '<span class="text-muted">Not given</span>')
        + row('Phone', r.phone ? '<a class="detail-link" href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : '<span class="text-muted">Not given</span>')
        + row('Event', r.eventType ? esc(r.eventType) : '<span class="text-muted">-</span>')
        + row(lastDay(r) ? 'Event dates' : 'Event date', r.eventDate ? esc(eventDates(r)) : '<span class="text-muted">-</span>')
        + row('Staff', r.staffCount ? esc(String(r.staffCount)) : '<span class="text-muted">-</span>')
        + row('Guests', r.guests ? esc(String(r.guests)) : '<span class="text-muted">-</span>')
        + row('Roles', roles.length ? esc(roles.join(', ')) : '<span class="text-muted">-</span>')
        + row('Received', esc(AdminCore.formatDateTime(r.createdAt)))
      + '</div>'
      + '<div class="detail-row mb-2"><span class="detail-label">Message and details</span>'
        + '<p class="detail-value" style="white-space:pre-wrap">' + esc(r.message || '') + '</p></div>'
      + '<div class="detail-row mb-2">'
        + '<label class="as-label" for="req-status">Status</label>'
        + '<select id="req-status" class="as-input" data-id="' + esc(r.id) + '">'
          + Object.keys(STATUS_LABEL).map(function (s) {
              return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
            }).join('')
        + '</select>'
      + '</div>'
      + '<div class="detail-row">'
        + '<label class="as-label" for="req-notes">Admin notes (internal)</label>'
        + '<textarea id="req-notes" maxlength="2000" placeholder="Who called them back, what was quoted…">' + esc(r.adminNotes || '') + '</textarea>'
        + '<button type="button" class="btn btn-secondary btn-sm mt-1" data-action="save-notes" data-id="' + esc(r.id) + '">Save notes</button>'
      + '</div>';

    document.getElementById('modal-footer').innerHTML =
      '<button type="button" class="btn btn-danger-quiet" data-action="delete" data-from-modal="true" data-id="' + esc(r.id) + '">Delete</button>'
      + '<button type="button" class="btn btn-ghost" data-action="close-detail">Close</button>'
      + '<button type="button" class="btn btn-primary" data-action="board-form" data-id="' + esc(r.id) + '">'
        + (boardRefs(r).length ? 'On the board · add again' : 'Add to board') + '</button>';

    AdminCore.openModal('detail-modal');
  }

  // ── Add to board ────────────────────────────────────────
  // Turns a request into a job on the Scheduling board, through the board's
  // own API (/api/v1/scheduling), so its rules apply and Admin > Jobs follows.
  // The request has no columns for venue or shift times; saveWebsiteRequest
  // writes them into the message as "Label: value" lines, read back here.

  var SCHED = '/api/v1/scheduling';

  function detailLine(message, label) {
    var match = new RegExp('^' + label + ': (.+)$', 'm').exec(message || '');
    return match ? match[1].trim() : '';
  }

  function shiftTimes(message) {
    var match = /^Shift: (\d{1,2}:\d{2})? ?- ?(\d{1,2}:\d{2})?/m.exec(message || '');
    function pad(t) { return t && t.length === 4 ? '0' + t : (t || ''); }
    return match ? { start: pad(match[1]), end: pad(match[2]) } : { start: '', end: '' };
  }

  /** The last day of a multi-day request, yyyy-mm-dd, from the "Last day:" line
   *  the quote page writes into the message. Blank for a one-day request. */
  function lastDay(r) {
    var v = detailLine(r.message, 'Last day');
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  }

  /** "12 Dec 2026" or "12 Dec 2026 to 14 Dec 2026" for a run of days. */
  function eventDates(r) {
    if (!r.eventDate) return '';
    var last = lastDay(r);
    return fmtDate(r.eventDate) + (last ? ' to ' + fmtDate(last) : '');
  }

  function isoDay(value) {
    if (!value) return '';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  /** "Bartender × 3" from the quote page; plain role names from the briefs. */
  function firstRole(roles) {
    return roles.length ? String(roles[0]).replace(/\s*×\s*\d+$/, '') : '';
  }

  function sameText(a, b) {
    return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  /** "The Acme Events Ltd." and "acme events" are one client. */
  function companyKey(name) {
    return String(name || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b(the|ltd|limited|llp|plc|inc|co|company|group|uk)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function phoneKey(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    // 07700 900123 and +44 7700 900123 are the same number.
    return digits.length >= 9 ? digits.slice(-10) : '';
  }

  /**
   * The board client this request most likely belongs to: same email, same
   * phone, or the same company name once "Ltd", "The" and punctuation are
   * ignored. Returns the client and why, or null.
   */
  function matchClient(clients, r) {
    var byEmail = clients.find(function (c) { return sameText(c.contactEmail, r.email); });
    if (byEmail) return { client: byEmail, why: 'same email' };
    var phone = phoneKey(r.phone);
    var byPhone = phone && clients.find(function (c) { return phoneKey(c.contactPhone) === phone; });
    if (byPhone) return { client: byPhone, why: 'same phone number' };
    var key = companyKey(r.company || r.name);
    var byName = key && clients.find(function (c) { return companyKey(c.name) === key; });
    if (byName) return { client: byName, why: 'same name' };
    return null;
  }

  /** The board references a request has already been added as, from its notes. */
  function boardRefs(r) {
    return (r.adminNotes || '').match(/Added to the board as VJ-\d+[^\n]*/g) || [];
  }

  function field(id, label, input, wide) {
    return '<div class="form-group' + (wide ? ' full-width' : '') + '">'
      + '<label class="as-label" for="' + id + '">' + esc(label) + '</label>' + input + '</div>';
  }

  function textInput(id, value, attrs) {
    return '<input id="' + id + '" class="as-input" value="' + esc(value || '') + '" ' + (attrs || 'type="text"') + '>';
  }

  /**
   * Crew for the new job: anyone already on the board, and someone new, who
   * is added to the board's People first. The board's rule holds: no hourly
   * rate, no job, so people without one can't be ticked.
   */
  function crewPicker(people) {
    var rows = people.map(function (p) {
      var name = p.firstName + ' ' + p.lastName;
      return '<label class="as-check bj-person" data-name="' + esc(name.toLowerCase()) + '">'
        + '<input type="checkbox" name="bj-crew" value="' + esc(p.id) + '"' + (p.hourlyRate ? '' : ' disabled') + '>'
        + '<span>' + esc(name)
          + ' <span class="text-muted fs-sm">' + (p.hourlyRate ? '£' + esc(Number(p.hourlyRate).toFixed(2)) + '/hr' : 'no hourly rate, add one on the board first') + '</span>'
        + '</span></label>';
    }).join('');
    return '<div class="form-row"><div class="form-group full-width">'
      + '<label class="as-label" for="bj-crew-search">Crew <span class="text-muted fs-sm">(optional)</span></label>'
      + (people.length
        ? textInput('bj-crew-search', '', 'type="search" placeholder="Find someone on the board"')
          + '<div id="bj-crew-list" class="bj-crew-list">' + rows + '</div>'
        : '<span class="text-muted fs-sm">Nobody on the board yet.</span>')
      + '<div class="bj-new-person">'
        + '<span class="text-muted fs-sm">Someone new (added to the board\'s People too):</span>'
        + '<div class="form-row">'
          + textInput('bj-new-first', '', 'type="text" maxlength="100" placeholder="First name" aria-label="New person first name"')
          + textInput('bj-new-last', '', 'type="text" maxlength="100" placeholder="Last name" aria-label="New person last name"')
          + textInput('bj-new-rate', '', 'type="number" min="0" step="0.01" placeholder="Hourly rate £" aria-label="New person hourly rate"')
          + textInput('bj-new-email', '', 'type="email" maxlength="200" placeholder="Email (optional)" aria-label="New person email"')
        + '</div>'
      + '</div>'
      + '</div></div>';
  }

  /** Puts the ticked people (and anyone new) on the job. Returns what didn't go to plan. */
  async function addCrew(jobIds) {
    var ids = Array.prototype.map.call(
      document.querySelectorAll('input[name="bj-crew"]:checked'),
      function (el) { return el.value; }
    );
    var notes = [];
    var first = val('bj-new-first');
    var last = val('bj-new-last');
    if (first || last) {
      try {
        var person = await get(SCHED + '/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: first,
            lastName: last,
            hourlyRate: val('bj-new-rate') || null,
            email: val('bj-new-email') || null
          })
        });
        ids.push(person.id);
      } catch (e) {
        notes.push((first + ' ' + last).trim() + ' was not added: ' + e.message);
      }
    }
    // Everyone ticked goes on every day of a multi-day run. "added" counts
    // people who made it onto at least one day, not person-days.
    var added = 0;
    for (var i = 0; i < ids.length; i++) {
      var onAny = false;
      for (var d = 0; d < jobIds.length; d++) {
        try {
          var a = await get(SCHED + '/jobs/' + encodeURIComponent(jobIds[d]) + '/crew', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffId: ids[i] })
          });
          onAny = true;
          if (a && a.clash) notes.push(a.clash);
        } catch (e) {
          notes.push(e.message);
        }
      }
      if (onAny) added++;
    }
    // A rate problem fails the same way on every day; say it once.
    return { added: added, notes: notes.filter(function (n, k) { return notes.indexOf(n) === k; }) };
  }

  async function openBoardForm(id) {
    var r = find(id);
    if (!r) return;
    var clients = [];
    var roleNames = [];
    var people = [];
    try {
      var loaded = await Promise.all([
        get(SCHED + '/clients?archived=false'),
        get(SCHED + '/jobs/roles').catch(function () { return []; }),
        get(SCHED + '/staff?status=ACTIVE').catch(function () { return []; })
      ]);
      clients = loaded[0] || [];
      roleNames = (loaded[1] || []).map(function (x) { return typeof x === 'string' ? x : (x && (x.role || x.name)) || ''; }).filter(Boolean);
      people = loaded[2] || [];
    } catch (e) {
      toast('Could not load the board: ' + e.message, 'error');
      return;
    }

    var clientName = r.company || r.name;
    var found = matchClient(clients, r);
    var match = found ? found.client : null;
    var already = boardRefs(r);
    var roles = parseRoles(r.roles);
    var shift = shiftTimes(r.message);
    var venue = [detailLine(r.message, 'Venue'), detailLine(r.message, 'Location'), detailLine(r.message, 'City')]
      .filter(Boolean).join(', ');
    var title = r.eventType ? r.eventType + (r.company ? ' - ' + r.company : '') : clientName;
    var rate = match && match.defaultChargeRate ? String(match.defaultChargeRate) : '';

    var clientOptions = '<option value="new"' + (match ? '' : ' selected') + '>New client: ' + esc(clientName) + '</option>'
      + clients.map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (match && match.id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('')
      + '<option value="">No client</option>';

    var notes = [
      'From a website request, ' + fmtDate(r.createdAt) + '.',
      'Contact: ' + [r.name, r.phone, r.email].filter(Boolean).join(', '),
      r.guests ? 'Guests: ' + r.guests : '',
      roles.length > 1 ? 'Roles asked for: ' + roles.join(', ') : '',
      '',
      r.message || ''
    ].filter(function (line, i) { return line || i === 4; }).join('\n').trim();

    document.getElementById('modal-title').textContent = 'Add to the board';
    document.getElementById('modal-body').innerHTML =
      (already.length
        ? '<div class="alert alert-warning bj-note"><strong>This request is already on the board.</strong> '
          + esc(already.join(' ')) + ' Only add it again if it is a second job.</div>'
        : '')
      + '<p class="text-muted fs-sm mb-2">Filled in from the request. Check it, change anything, then add it. It goes on the board as a job for that day.</p>'
      + '<div class="form-row">' + field('bj-title', 'Job name *', textInput('bj-title', title, 'type="text" maxlength="200" required'), true) + '</div>'
      + '<div class="form-row">'
        + field('bj-client', 'Client', '<select id="bj-client" class="as-input">' + clientOptions + '</select>'
            + '<span class="text-muted fs-sm">' + (found
              ? 'Matched ' + esc(match.name) + ' on the board (' + esc(found.why) + '). Pick another if that is wrong.'
              : 'No client on the board matches. Pick one if they are already there under another name.')
            + '</span>')
        + field('bj-contact', 'Who to contact', textInput('bj-contact', r.name, 'type="text" maxlength="200"'))
      + '</div>'
      + '<div class="form-row">'
        + field('bj-phone', 'Phone', textInput('bj-phone', r.phone, 'type="tel" maxlength="50"'))
        + field('bj-email', 'Email', textInput('bj-email', r.email, 'type="email" maxlength="200"'))
      + '</div>'
      + '<div class="form-row">'
        + field('bj-date', lastDay(r) ? 'First day *' : 'Date *', textInput('bj-date', isoDay(r.eventDate), 'type="date" required'))
        + field('bj-last', 'Last day', textInput('bj-last', lastDay(r), 'type="date"')
            + '<span class="text-muted fs-sm">For more than one day. Each day goes on the board as its own job.</span>')
      + '</div>'
      + '<div class="form-row">' + field('bj-venue', 'Venue', textInput('bj-venue', venue, 'type="text" maxlength="200"'), true) + '</div>'
      + '<div class="form-row">'
        + field('bj-start', 'Start *', textInput('bj-start', shift.start, 'type="time" required'))
        + field('bj-end', 'Finish *', textInput('bj-end', shift.end, 'type="time" required'))
      + '</div>'
      + '<div class="form-row">'
        + field('bj-staff', 'Staff needed', textInput('bj-staff', r.staffCount ? String(r.staffCount) : '', 'type="number" min="0" max="999"'))
        + field('bj-role', 'Role', textInput('bj-role', firstRole(roles), 'type="text" maxlength="100" list="bj-roles"')
            + '<datalist id="bj-roles">' + roleNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>')
      + '</div>'
      + '<div class="form-row">'
        + field('bj-rate', 'Charge rate (£/hr, ex VAT)', textInput('bj-rate', rate, 'type="number" min="0" step="0.01" placeholder="Leave blank if not agreed yet"'))
        + field('bj-status', 'On the board as', '<select id="bj-status" class="as-input">'
            + '<option value="DRAFT">Draft (not confirmed yet)</option>'
            + '<option value="CONFIRMED">Confirmed</option></select>')
      + '</div>'
      + crewPicker(people)
      + '<div class="form-row">' + field('bj-notes', 'Notes', '<textarea id="bj-notes" class="as-input" rows="6" maxlength="5000">' + esc(notes) + '</textarea>', true) + '</div>'
      + '<div id="bj-error" class="alert alert-error d-none" role="alert"></div>';

    document.getElementById('modal-footer').innerHTML =
      '<button type="button" class="btn btn-ghost" data-action="open-detail" data-id="' + esc(r.id) + '">Back</button>'
      + '<button type="button" class="btn btn-primary" data-action="board-add" data-id="' + esc(r.id) + '">'
        + (already.length ? 'Add again' : 'Add to board') + '</button>';
    // Opened straight from a row in the list, the modal isn't showing yet.
    AdminCore.openModal('detail-modal');
    document.getElementById('bj-title').focus();
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // Worth having before a job goes on the board, but it can go on without
  // them. Name, date and times can't be skipped: the board needs them.
  var KEY_DETAILS = [
    ['bj-contact', 'Who to contact'],
    ['bj-phone', 'Phone'],
    ['bj-venue', 'Venue'],
    ['bj-staff', 'Staff needed'],
    ['bj-role', 'Role'],
    ['bj-rate', 'Charge rate']
  ];

  async function addToBoard(id, button, anyway) {
    var r = find(id);
    if (!r) return;
    var errorBox = document.getElementById('bj-error');
    function fail(message) {
      errorBox.className = 'alert alert-error';
      errorBox.textContent = message;
    }
    errorBox.className = 'alert d-none';
    document.querySelectorAll('#modal-body .bj-missing').forEach(function (el) { el.classList.remove('bj-missing'); });

    var title = val('bj-title');
    var date = val('bj-date');
    var start = val('bj-start');
    var end = val('bj-end');
    if (!title) return fail('Give the job a name.');
    if (!date) return fail('Pick the date of the job.');
    var last = val('bj-last');
    if (last === date) last = '';
    if (last && last < date) return fail('The last day is before the first.');
    var runDays = last ? Math.round((Date.parse(last) - Date.parse(date)) / 86400000) + 1 : 1;
    if (runDays > 60) return fail('That is ' + runDays + ' days. Check the last day.');
    if (!start || !end) return fail('Add a start and finish time. Guess if you need to; you can change it on the board.');
    var newFirst = val('bj-new-first');
    var newLast = val('bj-new-last');
    if ((newFirst || newLast) && !(newFirst && newLast)) return fail('Give the new person a first and last name.');
    if (newFirst && !val('bj-new-rate')) return fail('Give ' + newFirst + ' an hourly rate. The board won\'t put anyone on a job without one.');

    var missing = KEY_DETAILS.filter(function (d) { return !val(d[0]); });
    if (missing.length && !anyway) {
      missing.forEach(function (d) { document.getElementById(d[0]).classList.add('bj-missing'); });
      errorBox.className = 'alert alert-warning';
      errorBox.innerHTML = '<strong>Missing from this job:</strong>'
        + '<ul>' + missing.map(function (d) { return '<li>' + esc(d[1]) + '</li>'; }).join('') + '</ul>'
        + '<div class="as-row-actions">'
          + '<button type="button" class="btn btn-secondary btn-sm" data-action="board-fill">Fill them in</button>'
          + '<button type="button" class="btn btn-ghost btn-sm" data-action="board-add-anyway" data-id="' + esc(id) + '">Add without them</button>'
        + '</div>';
      errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    var rate = val('bj-rate');
    var staff = val('bj-staff');
    var contact = val('bj-contact');
    var phone = val('bj-phone');
    var email = val('bj-email');
    var notes = val('bj-notes');
    if (!rate) notes = 'Charge rate needed.\n' + notes;

    button.disabled = true;
    try {
      var clientId = val('bj-client');
      if (clientId === 'new') {
        var client = await get(SCHED + '/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.company || contact || r.name,
            contactName: contact || null,
            contactPhone: phone || null,
            contactEmail: email || null,
            defaultChargeRate: rate || null
          })
        });
        clientId = client.id;
      }

      var job = await get(SCHED + '/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId || null,
          title: title,
          venueName: val('bj-venue') || null,
          date: date,
          endDate: last || null,
          startTime: start,
          endTime: end,
          staffNeeded: staff ? Number(staff) : null,
          roleNeeded: val('bj-role') || null,
          chargeRate: rate || '0',
          status: val('bj-status'),
          notes: notes || null
        })
      });

      // Note it on the request, so nobody adds it twice.
      var run = job.run;
      var stamp = 'Added to the board as ' + job.reference
        + (run ? ' and the next ' + (run.created - 1) + ' days (' + fmtDate(run.from) + ' to ' + fmtDate(run.to) + ').' : ' (' + fmtDate(date) + ').');
      var newNotes = r.adminNotes ? r.adminNotes + '\n' + stamp : stamp;
      await get('/api/v1/contacts/' + encodeURIComponent(id) + '/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes })
      }).then(function () { r.adminNotes = newNotes; }).catch(function () {});
      // The job exists now, so a crew problem is reported, not a reason to stop.
      var crew = await addCrew(run && run.jobIds ? run.jobIds : [job.id]);
      if (val('bj-status') === 'CONFIRMED' && r.status !== 'BOOKED') await setStatus(id, 'BOOKED');

      AdminCore.closeModal('detail-modal');
      toast(job.reference + (run ? ' and ' + (run.created - 1) + ' more days are' : ' is') + ' on the board'
        + (crew.added ? ' with ' + crew.added + (crew.added === 1 ? ' person' : ' people') : ''), 'success');
      crew.notes.forEach(function (n) { toast(n, 'warning'); });
      if (confirm(job.reference + ' is on the board. Open it now?')) {
        window.location.href = '/scheduling/#/jobs/' + encodeURIComponent(job.id);
      }
    } catch (e) {
      fail(e.message);
    } finally {
      button.disabled = false;
    }
  }

  async function setStatus(id, status) {
    try {
      await get('/api/v1/contacts/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
      });
      var r = find(id);
      if (r) r.status = status;
      updateStats();
      render();
      toast('Marked ' + STATUS_LABEL[status].toLowerCase(), 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveNotes(id) {
    var notes = document.getElementById('req-notes').value;
    try {
      await get('/api/v1/contacts/' + encodeURIComponent(id) + '/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });
      var r = find(id);
      if (r) r.adminNotes = notes;
      toast('Notes saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function remove(id, fromModal) {
    var r = find(id);
    if (!r) return;
    if (!confirm('Delete the request from ' + r.name + '? This cannot be undone.')) return;
    try {
      await get('/api/v1/contacts/' + encodeURIComponent(id), { method: 'DELETE' });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }
    if (fromModal) AdminCore.closeModal('detail-modal');
    requests = requests.filter(function (x) { return x.id !== id; });
    updateStats();
    render();
    toast('Request deleted', 'success');
  }

  // ── Events ──────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var id = el.dataset.id;
    var action = el.dataset.action;
    if (action === 'close-detail') return AdminCore.closeModal('detail-modal');
    if (action === 'open-detail')  return id && openDetail(id);
    if (action === 'save-notes')   return id && saveNotes(id);
    if (action === 'board-form')   return id && openBoardForm(id);
    if (action === 'board-add')    return id && addToBoard(id, el);
    if (action === 'board-add-anyway') {
      return id && addToBoard(id, document.querySelector('[data-action="board-add"]'), true);
    }
    if (action === 'board-fill') {
      var first = document.querySelector('#modal-body .bj-missing');
      return first && first.focus();
    }
    if (action === 'delete')       return id && remove(id, el.dataset.fromModal === 'true');
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'bj-crew-search') {
      var q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#bj-crew-list .bj-person').forEach(function (row) {
        row.style.display = !q || row.dataset.name.indexOf(q) !== -1 ? '' : 'none';
      });
      return;
    }
    if (e.target.classList && e.target.value.trim()) e.target.classList.remove('bj-missing');
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'req-status') setStatus(e.target.dataset.id, e.target.value);
  });

  document.getElementById('filter-type').addEventListener('change', function (e) {
    filters.type = e.target.value;
    updateStats();
    render();
  });
  document.getElementById('filter-status').addEventListener('change', function (e) {
    filters.status = e.target.value;
    render();
  });
  document.getElementById('filter-search').addEventListener('input', AdminCore.debounce(function (e) {
    filters.search = e.target.value;
    render();
  }, 250));

  document.querySelectorAll('#stats-row .kpi-card[data-filter]').forEach(function (card) {
    card.addEventListener('click', function () {
      var value = card.dataset.filter === 'all' ? '' : card.dataset.filter;
      document.getElementById('filter-status').value = value;
      filters.status = value;
      render();
    });
  });

  AdminCore.initModalBehavior('detail-modal');

  (async function () {
    var session = await AdminCore.checkAuth();
    if (!session) return;
    await load();
  }());
}());
