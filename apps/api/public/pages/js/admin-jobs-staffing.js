/**
 * Per-day staffing for the admin jobs page.
 *
 * Two pieces live here:
 *  - the day-plan editor inside the create/edit job modal, which turns an
 *    event date range into one headcount input per calendar day;
 *  - the staffing modal, opened from a job row, where each day lists the
 *    people rostered on it and who else can be added.
 *
 * Exposed on window.JobStaffing so admin-jobs.js can drive it without either
 * file having to know the other's internals.
 */
(function () {
  'use strict';

  var esc = AdminCore.escapeHtml;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  // ── Date helpers ───────────────────────────────────────
  // Everything is a bare "YYYY-MM-DD" key. Dates only become Date objects for
  // formatting, and always at UTC noon, so no timezone can shift the day.

  function isDayKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function dayKeysBetween(start, end) {
    if (!isDayKey(start)) return [];
    var first = Date.parse(start + 'T00:00:00Z');
    var last = isDayKey(end) ? Date.parse(end + 'T00:00:00Z') : first;
    if (isNaN(first)) return [];
    if (isNaN(last) || last < first) last = first;

    var keys = [];
    for (var t = first; t <= last && keys.length < 366; t += MS_PER_DAY) {
      keys.push(new Date(t).toISOString().slice(0, 10));
    }
    return keys;
  }

  function formatDay(key) {
    if (!isDayKey(key)) return key || '—';
    return new Date(key + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
  }

  function formatDayShort(key) {
    if (!isDayKey(key)) return key || '—';
    return new Date(key + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    });
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Day plan editor (create/edit modal) ────────────────

  function planContainer() {
    return document.getElementById('day-plan');
  }

  /** Current editor state as the API wants it: [{ date, staffNeeded }]. */
  function readDayPlan() {
    var container = planContainer();
    if (!container) return [];
    return Array.prototype.map.call(container.querySelectorAll('[data-day-key]'), function (input) {
      return {
        date: input.dataset.dayKey,
        staffNeeded: Math.max(1, Math.min(100, parseInt(input.value, 10) || 1))
      };
    });
  }

  /**
   * Rebuilds the rows from the form's date range. Counts already on screen
   * survive for dates that are still in range, so nudging an end date out by a
   * day doesn't reset the headcounts you just typed.
   */
  function renderDayPlan(seed) {
    var container = planContainer();
    var form = document.getElementById('job-form');
    if (!container || !form) return;

    var existing = {};
    readDayPlan().forEach(function (day) { existing[day.date] = day.staffNeeded; });
    (seed || []).forEach(function (day) { existing[day.date] = day.staffNeeded; });

    var fallback = Math.max(1, parseInt(form.staffNeeded.value, 10) || 1);
    var keys = dayKeysBetween(form.eventDate.value, form.eventEndDate.value);

    container.innerHTML = keys.map(function (key) {
      var count = existing[key] || fallback;
      return '<div class="day-plan-row">'
        + '<label for="day-' + esc(key) + '">' + esc(formatDayShort(key)) + '</label>'
        + '<input class="as-input" type="number" min="1" max="100" id="day-' + esc(key) + '"'
        + ' data-day-key="' + esc(key) + '" value="' + count + '">'
        + '</div>';
    }).join('');
  }

  /** Pushes the "staff needed" default onto every day at once. */
  function applyDefaultToAllDays() {
    var form = document.getElementById('job-form');
    var container = planContainer();
    if (!form || !container) return;

    var fallback = Math.max(1, parseInt(form.staffNeeded.value, 10) || 1);
    Array.prototype.forEach.call(container.querySelectorAll('[data-day-key]'), function (input) {
      input.value = fallback;
    });
  }

  /** Loads a saved job's day plan into the editor when opening Edit. */
  async function loadDayPlanForJob(jobId) {
    renderDayPlan();
    try {
      var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(jobId) + '/days', { credentials: 'include' });
      if (!res.ok) return;
      var payload = await res.json();
      var days = (payload.data || payload).days || [];
      renderDayPlan(days.map(function (day) {
        return { date: day.date, staffNeeded: day.staffNeeded };
      }));
    } catch (err) {
      console.error('Failed to load day plan:', err);
    }
  }

  // ── Staffing modal ─────────────────────────────────────

  var staffing = { jobId: null, jobTitle: '', days: [], candidates: [], linked: false };

  function staffingAlert(message, type) {
    var box = document.getElementById('staffing-alert');
    if (!box) return;
    box.innerHTML = message
      ? '<div class="alert alert-' + (type || 'error') + '">' + esc(message) + '</div>'
      : '';
  }

  function renderStaffingDays() {
    var host = document.getElementById('staffing-days');
    if (!host) return;

    if (staffing.days.length === 0) {
      host.innerHTML = '<p class="staffing-empty">This job has no dates yet. '
        + 'Add an event date on the job and the days will appear here.</p>';
      return;
    }

    host.innerHTML = staffing.days.map(function (day) {
      var assignedIds = day.assignments.map(function (a) { return a.userId; }).filter(Boolean);

      var crew = day.assignments.length
        ? day.assignments.map(function (person) {
            var remove = staffing.linked
              ? ' data-action="remove-person" data-staff-id="' + esc(person.staffId) + '" data-date="' + esc(day.date) + '"'
              : ' data-action="unassign-day" data-day-id="' + esc(day.id) + '" data-user-id="' + esc(person.userId) + '"';
            var contact = [person.email, person.phone].filter(Boolean).map(esc).join(' · ');
            return '<div class="staffing-crew-row">'
              + '<div class="staffing-crew-name"><strong>' + esc(person.name) + '</strong>'
              + '<span>' + contact + (staffing.linked && !person.userId ? ' <em class="no-account">no app account</em>' : '') + '</span></div>'
              + '<button type="button" class="btn btn-ghost btn-sm"' + remove + '>Remove</button>'
              + '</div>';
          }).join('')
        : '<p class="staffing-empty">Nobody rostered on this day yet.</p>';

      var options = staffing.candidates
        .filter(function (person) { return assignedIds.indexOf(person.userId) === -1; })
        .map(function (person) {
          return '<option value="' + esc(person.userId) + '">' + esc(person.name)
            + ' — ' + esc(person.applicationStatus) + '</option>';
        }).join('');

      var full = day.spotsLeft <= 0;
      var adder = staffing.candidates.length === 0
        ? (staffing.linked ? '' : '<p class="staffing-empty">No applicants to roster yet.</p>')
        : '<div class="staffing-add">'
          + '<select class="as-input" data-day-picker="' + esc(day.id) + '"' + (options ? '' : ' disabled') + '>'
          + (options || '<option value="">Everyone available is already on this day</option>')
          + '</select>'
          + '<button type="button" class="btn btn-primary btn-sm" data-action="assign-day"'
          + ' data-day-id="' + esc(day.id) + '"' + (options && !full ? '' : ' disabled') + '>Add</button>'
          + '</div>';

      return '<div class="staffing-day">'
        + '<div class="staffing-day-head">'
        + '<span class="staffing-day-date">' + esc(formatDay(day.date))
        + (day.reference ? ' <a class="sched-tag" href="/scheduling/#/jobs/' + encodeURIComponent(day.schedJobId) + '">' + esc(day.reference) + '</a>' : '')
        + '</span>'
        + '<span class="staffing-day-count">'
        + '<span class="badge badge-' + (full ? 'success' : 'warning') + '">'
        + day.staffAssigned + ' / ' + day.staffNeeded + ' staffed</span>'
        + '<label for="need-' + esc(day.id) + '">Needed</label>'
        + '<input class="as-input" type="number" min="1" max="100" id="need-' + esc(day.id) + '"'
        + ' data-day-need="' + esc(day.id) + '" value="' + day.staffNeeded + '">'
        + '</span>'
        + '</div>'
        + '<div class="staffing-crew">' + crew + '</div>'
        + adder
        + '</div>';
    }).join('');
  }

  function renderStaffingSummary() {
    var sub = document.getElementById('staffing-sub');
    if (!sub) return;

    var slots = staffing.days.reduce(function (sum, day) { return sum + day.staffNeeded; }, 0);
    var filled = staffing.days.reduce(function (sum, day) { return sum + day.staffAssigned; }, 0);
    var range = staffing.days.length
      ? formatDayShort(staffing.days[0].date) + ' → ' + formatDayShort(staffing.days[staffing.days.length - 1].date)
      : 'No dates set';

    sub.textContent = staffing.jobTitle + ' · ' + range + ' · ' + staffing.days.length + ' day(s) · '
      + filled + ' of ' + slots + ' day-slots filled';
  }

  async function openStaffingModal(jobId) {
    staffing = { jobId: jobId, jobTitle: '', days: [], candidates: [], linked: false };
    document.getElementById('staffing-add-person').classList.add('d-none');
    document.getElementById('staffing-title').textContent = 'Staffing';
    document.getElementById('staffing-sub').textContent = '';
    document.getElementById('staffing-days').innerHTML = '<div class="drawer-loading">Loading days…</div>';
    staffingAlert('');
    AdminCore.openModal('staffing-modal');

    try {
      var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(jobId) + '/days', { credentials: 'include' });
      var payload = await res.json();
      var data = payload.data || payload;
      if (!res.ok) throw new Error(data.error || 'Failed to load staffing');

      staffing.days = data.days || [];
      staffing.candidates = data.candidates || [];
      staffing.jobTitle = data.job.title;
      staffing.linked = Boolean(data.job.schedSynced);
      renderAddPerson();
      document.getElementById('staffing-title').textContent = 'Staffing — ' + data.job.title;
      renderStaffingSummary();
      renderStaffingDays();
    } catch (err) {
      document.getElementById('staffing-days').innerHTML =
        '<p class="staffing-empty">Could not load staffing: ' + esc(err.message) + '</p>';
    }
  }

  function closeStaffingModal() {
    if (!staffing.jobId) return;
    AdminCore.closeModal('staffing-modal');
    staffing = { jobId: null, jobTitle: '', days: [], candidates: [], linked: false };
    if (typeof window.onStaffingClosed === 'function') window.onStaffingClosed();
  }

  /** Applies a server response that carries a fresh day list. */
  function absorbDays(days) {
    staffing.days = days || [];
    renderStaffingDays();
    renderStaffingSummary();
  }

  async function assignToDay(dayId) {
    var picker = document.querySelector('[data-day-picker="' + dayId + '"]');
    if (!picker || !picker.value) return;

    staffingAlert('');
    try {
      var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(staffing.jobId)
        + '/days/' + encodeURIComponent(dayId) + '/assignments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: picker.value })
      });
      var payload = await res.json();
      var data = payload.data || payload;
      if (!res.ok) throw new Error(data.error || 'Failed to add worker');
      absorbDays(data.days);
    } catch (err) {
      staffingAlert(err.message);
    }
  }

  async function unassignFromDay(dayId, userId) {
    staffingAlert('');
    try {
      var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(staffing.jobId)
        + '/days/' + encodeURIComponent(dayId) + '/assignments/' + encodeURIComponent(userId), {
        method: 'DELETE',
        credentials: 'include'
      });
      var payload = await res.json();
      var data = payload.data || payload;
      if (!res.ok) throw new Error(data.error || 'Failed to remove worker');
      absorbDays(data.days);
    } catch (err) {
      staffingAlert(err.message);
    }
  }

  // ── Adding anyone to a Scheduling job ──────────────────

  /** The "which days" choice: every day to come, or one day. */
  function renderAddPerson() {
    var box = document.getElementById('staffing-add-person');
    if (!staffing.linked) { box.classList.add('d-none'); return; }
    var today = todayKey();
    var upcoming = staffing.days.filter(function (d) { return d.date >= today; });
    var select = document.getElementById('add-person-days');
    select.innerHTML = '<option value="">Every day to come (' + upcoming.length + ')</option>'
      + staffing.days.map(function (d) {
          return '<option value="' + esc(d.date) + '">' + esc(formatDayShort(d.date)) + '</option>';
        }).join('');
    document.getElementById('add-person-search').value = '';
    document.getElementById('add-person-results').innerHTML = '';
    document.getElementById('add-person-form').reset();
    box.classList.remove('d-none');
  }

  function chosenDates() {
    var value = document.getElementById('add-person-days').value;
    return value ? [value] : undefined;
  }

  var searchTimer = null;
  var searchSeq = 0;
  function searchPeople(q) {
    clearTimeout(searchTimer);
    var host = document.getElementById('add-person-results');
    if (q.trim().length < 2) { host.innerHTML = ''; return; }
    searchTimer = setTimeout(async function () {
      var seq = ++searchSeq;
      try {
        var res = await fetch('/api/v1/jobs/admin/people/search?q=' + encodeURIComponent(q.trim()), { credentials: 'include' });
        var payload = await res.json();
        if (seq !== searchSeq) return; // a later search owns the box now
        var people = (payload.data || payload).people || [];
        host.innerHTML = people.length
          ? people.map(function (p) {
              var key = p.userId ? 'data-user-id="' + esc(p.userId) + '"' : 'data-staff-id="' + esc(p.staffId) + '"';
              var tag = p.kind === 'worker' ? 'App worker' : 'Scheduling' + (p.hourlyRate ? ' · £' + p.hourlyRate.toFixed(2) + '/hr' : ' · no rate');
              return '<div class="add-person-row"><div><strong>' + esc(p.name) + '</strong>'
                + '<span>' + esc(tag) + (p.email ? ' · ' + esc(p.email) : '') + '</span></div>'
                + '<button type="button" class="btn btn-primary btn-sm" data-action="add-found-person" ' + key + '>Add</button></div>';
            }).join('')
          : '<p class="staffing-empty">Nobody found. Add them by hand below.</p>';
      } catch (err) {
        host.innerHTML = '<p class="staffing-empty">Search failed: ' + esc(err.message) + '</p>';
      }
    }, 250);
  }

  async function addPerson(body) {
    staffingAlert('');
    var dates = chosenDates();
    if (dates) body.dates = dates;
    var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(staffing.jobId) + '/people', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var payload = await res.json();
    var data = payload.data || payload;
    if (!res.ok) {
      // Someone with no rate can be given one right here and tried again.
      if (res.status === 422 && !body.hourlyRate) {
        var rate = prompt((data.error || 'They need an hourly rate.') + '\n\nHourly rate (£):');
        if (rate && Number(rate) > 0) return addPerson(Object.assign({}, body, { hourlyRate: Number(rate) }));
      }
      throw new Error(data.error || 'Could not add them');
    }
    absorbDays(data.days);
    staffingAlert(data.added
      ? data.name + ' added to ' + data.added + ' day(s).'
      : data.name + ' is already on those days.', 'success');
    return data;
  }

  async function removePerson(staffId, date) {
    staffingAlert('');
    try {
      var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(staffing.jobId) + '/people/'
        + encodeURIComponent(staffId) + '?date=' + encodeURIComponent(date), { method: 'DELETE', credentials: 'include' });
      var payload = await res.json();
      var data = payload.data || payload;
      if (!res.ok) throw new Error(data.error || 'Failed to remove');
      absorbDays(data.days);
    } catch (err) {
      staffingAlert(err.message);
    }
  }

  /**
   * Saves every day's headcount in one go. Lowering a day below the number of
   * people already on it is rejected here rather than server-side, because the
   * fix is to remove someone first and the message should say so.
   */
  async function saveHeadcounts() {
    var inputs = document.querySelectorAll('[data-day-need]');
    var days = [];
    var tooLow = null;

    Array.prototype.forEach.call(inputs, function (input) {
      var dayId = input.dataset.dayNeed;
      var day = staffing.days.filter(function (d) { return d.id === dayId; })[0];
      if (!day) return;
      var wanted = Math.max(1, Math.min(100, parseInt(input.value, 10) || 1));
      if (wanted < day.staffAssigned) tooLow = day;
      days.push({ date: day.date, staffNeeded: wanted });
    });

    if (tooLow) {
      staffingAlert(formatDayShort(tooLow.date) + ' already has ' + tooLow.staffAssigned
        + ' people on it. Remove someone before lowering the headcount.');
      renderStaffingDays();
      return;
    }

    staffingAlert('');
    try {
      var res = await fetch('/api/v1/jobs/admin/' + encodeURIComponent(staffing.jobId) + '/days', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: days })
      });
      var payload = await res.json();
      var data = payload.data || payload;
      if (!res.ok) throw new Error(data.error || 'Failed to save headcount');
      absorbDays(data.days);
    } catch (err) {
      staffingAlert(err.message);
    }
  }

  // ── Wiring ─────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'open-staffing') return el.dataset.jobId && openStaffingModal(el.dataset.jobId);
    if (action === 'close-staffing') return closeStaffingModal();
    if (action === 'assign-day') return assignToDay(el.dataset.dayId);
    if (action === 'unassign-day') return unassignFromDay(el.dataset.dayId, el.dataset.userId);
    if (action === 'remove-person') return removePerson(el.dataset.staffId, el.dataset.date);
    if (action === 'add-found-person') {
      var body = el.dataset.userId ? { userId: el.dataset.userId } : { staffId: el.dataset.staffId };
      el.disabled = true;
      return addPerson(body).catch(function (err) { staffingAlert(err.message); }).finally(function () { el.disabled = false; });
    }
  });

  // Headcount edits save on commit (blur or Enter), not on every keystroke.
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-day-need]')) saveHeadcounts();
    if (e.target.matches('#job-form [name="eventDate"], #job-form [name="eventEndDate"]')) renderDayPlan();
    if (e.target.matches('#job-form [name="staffNeeded"]')) applyDefaultToAllDays();
  });

  document.getElementById('add-person-search').addEventListener('input', function (e) { searchPeople(e.target.value); });

  document.getElementById('add-person-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    addPerson({
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim() || null,
      phone: form.phone.value.trim() || null,
      hourlyRate: form.hourlyRate.value ? Number(form.hourlyRate.value) : null
    }).then(function () { form.reset(); }).catch(function (err) { staffingAlert(err.message); });
  });

  document.getElementById('staffing-modal').addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-backdrop')) closeStaffingModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeStaffingModal();
  });

  window.JobStaffing = {
    renderDayPlan: renderDayPlan,
    readDayPlan: readDayPlan,
    loadDayPlanForJob: loadDayPlanForJob,
    openStaffingModal: openStaffingModal,
    formatDay: formatDay,
    formatDayShort: formatDayShort,
    todayKey: todayKey
  };
})();
