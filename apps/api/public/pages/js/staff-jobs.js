/**
 * /staff/jobs: open jobs, each with Apply or where their application stands.
 * The photo is asked for once, at profile setup (staff-common.js sends anyone
 * without one there), so applying for a job needs nothing extra.
 */
(function () {
  'use strict';
  var S = window.VergoStaff;
  var list = document.getElementById('jobList');
  var applied = {};

  var APP_STATUS = S.APP_STATUS;

  // ── Saved jobs: kept on this device only, a convenience ──────────────
  var SAVED_KEY = 'vergo.staff.savedJobs';
  var saved = {};
  try { (JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]') || []).forEach(function (id) { saved[id] = true; }); } catch (e) { saved = {}; }
  function storeSaved() {
    try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(Object.keys(saved))); } catch (e) { /* private window: saved for this visit only */ }
  }
  function saveButton(job) {
    var on = !!saved[job.id];
    return '<button type="button" class="staff-save" data-save="' + S.esc(job.id) + '" aria-pressed="' + on + '">' +
      '<span aria-hidden="true">' + (on ? '★' : '☆') + '</span> ' + (on ? 'Saved' : 'Save') + '</button>';
  }

  function action(job) {
    var app = applied[job.id];
    if (app) {
      var st = APP_STATUS[app.status] || [app.status, ''];
      return '<div class="btn-row">' + S.statusTag(st[0], st[1]) + '</div>';
    }
    if (job.spotsLeft != null && job.spotsLeft <= 0) return '<div class="btn-row">' + S.statusTag('Filled', 'bad') + '</div>';
    return '<div class="btn-row"><button type="button" class="btn btn-primary" data-apply="' + S.esc(job.id) + '">Apply</button></div>';
  }

  function render(jobs) {
    list.innerHTML = jobs.map(function (j) {
      return '<li class="staff-item" id="job-' + S.esc(j.id) + '">' +
        '<div class="staff-job-head"><h3>' + S.esc(j.title) + '</h3>' + saveButton(j) + '</div>' +
        (j.role && j.role.name ? '<p>' + S.esc(j.role.name) + (j.companyName ? ' · ' + S.esc(j.companyName) : '') + '</p>' : '') +
        S.jobSummary(j) +
        (j.description ? '<p>' + S.esc(String(j.description).slice(0, 280)) + (String(j.description).length > 280 ? '…' : '') + '</p>' : '') +
        action(j) +
        '</li>';
    }).join('');
    document.getElementById('jobsEmpty').hidden = jobs.length > 0;
  }

  // ── Filters: all in the browser, over the jobs already loaded ──────
  var filterForm = document.getElementById('jobFilters');
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function jobDay(j) { var d = String(j.eventDate || '').slice(0, 10); return d ? new Date(d + 'T12:00:00') : null; }

  function filtered() {
    var q = val('jobSearch').trim().toLowerCase();
    var role = val('jobRole');
    var when = val('jobWhen');
    var hideApplied = document.getElementById('jobHideApplied').checked;
    var savedOnly = document.getElementById('jobSavedOnly').checked;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var out = jobs.filter(function (j) {
      if (hideApplied && applied[j.id]) return false;
      if (savedOnly && !saved[j.id]) return false;
      if (role && !(j.role && j.role.name === role)) return false;
      if (q) {
        var text = [j.title, j.venue, j.location, j.companyName, j.role && j.role.name, j.description].filter(Boolean).join(' ').toLowerCase();
        if (text.indexOf(q) === -1) return false;
      }
      if (when) {
        var d = jobDay(j);
        if (!d) return false;
        var days = (d - now) / 86400000;
        if (when === 'week' && (days < 0 || days > 7)) return false;
        if (when === 'month' && (days < 0 || days > 30)) return false;
        if (when === 'weekend' && d.getDay() !== 0 && d.getDay() !== 6 && d.getDay() !== 5) return false;
      }
      return true;
    });
    var sort = val('jobSort');
    out.sort(function (a, b) {
      if (sort === 'pay') return (b.payRate || 0) - (a.payRate || 0);
      if (sort === 'new') return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
      var da = jobDay(a), db = jobDay(b);
      return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
    });
    return out;
  }

  function refresh() {
    var shown = filtered();
    render(shown);
    var count = document.getElementById('jobCount');
    count.textContent = jobs.length ? (shown.length === jobs.length ? jobs.length + (jobs.length === 1 ? ' open job' : ' open jobs') : 'Showing ' + shown.length + ' of ' + jobs.length + ' jobs') : '';
    if (!shown.length && jobs.length) {
      document.getElementById('jobsEmpty').hidden = true;
      list.innerHTML = '<li class="staff-empty">Nothing matches. <button type="button" class="link-button" id="clearFilters">Clear the filters</button></li>';
    }
  }

  if (filterForm) {
    filterForm.addEventListener('input', refresh);
    filterForm.addEventListener('change', refresh);
    filterForm.addEventListener('submit', function (e) { e.preventDefault(); });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#clearFilters')) return;
    filterForm.reset();
    refresh();
  });

  var jobs = [];
  Promise.all([
    S.profile,
    S.request('GET', '/api/v1/jobs?limit=50'),
    S.request('GET', '/api/v1/job-applications/mine')
  ]).then(function (out) {
    (out[2].body.applications || []).forEach(function (a) { applied[a.jobId] = a; });
    jobs = (out[1].body.data && out[1].body.data.jobs) || out[1].body.jobs || [];
    var roles = {};
    jobs.forEach(function (j) { if (j.role && j.role.name) roles[j.role.name] = true; });
    document.getElementById('jobRole').insertAdjacentHTML('beforeend', Object.keys(roles).sort().map(function (r) {
      return '<option value="' + S.esc(r) + '">' + S.esc(r) + '</option>';
    }).join(''));
    refresh();
  }).catch(function (err) {
    if (err && err.message === 'signed-out') return;
    S.show('jobsStatus', 'Could not load the job board. Refresh to try again.', 'error');
  });

  list.addEventListener('click', function (event) {
    var star = event.target.closest('[data-save]');
    if (star) {
      var sid = star.getAttribute('data-save');
      if (saved[sid]) delete saved[sid]; else saved[sid] = true;
      storeSaved();
      star.outerHTML = saveButton({ id: sid });
      if (document.getElementById('jobSavedOnly').checked) refresh();
      return;
    }
    var button = event.target.closest('[data-apply]');
    if (!button) return;
    var jobId = button.getAttribute('data-apply');
    button.disabled = true;
    button.textContent = 'Applying…';
    S.request('POST', '/api/v1/job-applications', { jobId: jobId })
      .then(function (r) {
        if (r.status === 201) {
          applied[jobId] = { jobId: jobId, status: 'PENDING' };
          S.show('jobsStatus', 'Applied. We will be in touch before anything is booked.', 'success');
          refresh();
          return;
        }
        S.show('jobsStatus', r.body.error || 'That did not go through. Try again.', 'error');
        button.disabled = false;
        button.textContent = 'Apply';
      })
      .catch(function (err) {
        if (err && err.message === 'signed-out') return;
        S.show('jobsStatus', 'Could not reach VERGO. Try again.', 'error');
        button.disabled = false;
        button.textContent = 'Apply';
      });
  });
})();
