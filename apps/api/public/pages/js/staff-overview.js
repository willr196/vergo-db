/**
 * /staff: the overview. A greeting, the ready-to-work checklist,
 * offers waiting for an answer, the next confirmed shift, where applications
 * stand, and a few new jobs.
 */
(function () {
  'use strict';
  var S = window.VergoStaff;

  function link(href, text) {
    return '<p class="staff-empty"><a href="' + href + '">' + S.esc(text) + '</a></p>';
  }

  /** The ready-to-work checklist: what they can do now, and what is with us. */
  function renderReadiness(data) {
    if (!data || !data.isStaff) return;
    var box = document.getElementById('readiness');
    var steps = data.steps || [];
    var todo = steps.filter(function (s) { return s.state === 'todo'; }).length;
    var office = steps.filter(function (s) { return s.state === 'office'; }).length;
    document.getElementById('readinessTitle').textContent = data.ready ? 'You are ready to work' : 'Getting you ready to work';
    document.getElementById('readinessLede').textContent = data.ready
      ? 'Everything is in place, so we can book you onto shifts.'
      : todo
        ? 'We can book you onto shifts once these are done. ' + todo + (todo === 1 ? ' is' : ' are') + ' yours to do now.'
        : 'The rest is with us. We will be in touch about ' + (office === 1 ? 'it' : 'them') + '.';
    document.getElementById('readinessSteps').innerHTML = steps.map(function (s) {
      var mark = s.state === 'done' ? '✓' : s.state === 'todo' ? '!' : '…';
      var label = s.href && s.state === 'todo' ? '<a href="' + S.esc(s.href) + '">' + S.esc(s.label) + '</a>' : S.esc(s.label);
      return '<li data-state="' + s.state + '"><span class="staff-check-mark" aria-hidden="true">' + mark + '</span>' +
        '<span>' + label + '<span class="sr-only"> (' + (s.state === 'done' ? 'done' : s.state === 'todo' ? 'to do' : 'with VERGO') + ')</span>' +
        (s.hint && s.state !== 'done' ? '<span class="staff-check-hint">' + S.esc(s.hint) + '</span>' : '') + '</span></li>';
    }).join('');
    box.dataset.ready = data.ready ? 'yes' : 'no';
    box.hidden = false;
  }

  S.request('GET', '/api/v1/user/readiness')
    .then(function (r) { if (r.status === 200) renderReadiness(r.body.data); })
    .catch(function () {});

  Promise.all([
    S.profile,
    S.request('GET', '/api/v1/user/shifts?view=upcoming&limit=20'),
    S.request('GET', '/api/v1/job-applications/mine'),
    S.request('GET', '/api/v1/jobs?limit=10')
  ]).then(function (out) {
    var p = out[0] || {};
    var shifts = (out[1].body.data && out[1].body.data.shifts) || [];
    var apps = out[2].body.applications || [];
    var jobs = (out[3].body.data && out[3].body.data.jobs) || [];
    // No photo yet: staff-common.js is already taking them to profile setup.
    if (!p.profileImage) return;

    document.getElementById('overviewHeading').textContent = 'Hi ' + (p.firstName || 'there');
    document.getElementById('overviewLede').textContent = /[?&]welcome=1/.test(window.location.search)
      ? 'Your profile is set up. Here are your shifts, applications and the latest work.'
      : 'Your shifts, applications and the latest work, all in one place.';

    var offers = shifts.filter(function (s) { return s.status === 'PENDING'; });
    document.getElementById('offers').innerHTML = offers.length
      ? '<ul class="staff-list">' + offers.map(function (s) { return S.shiftItem(s); }).join('') + '</ul>' + link('/staff/shifts', 'Answer on My shifts')
      : '<p class="staff-empty">Nothing waiting. Offers we send you show here.</p>';

    var next = shifts.filter(function (s) { return s.status === 'CONFIRMED'; })[0];
    document.getElementById('nextShift').innerHTML = next
      ? '<ul class="staff-list">' + S.shiftItem(next) + '</ul>' + link('/staff/shifts', 'All my shifts')
      : '<p class="staff-empty">No confirmed shift yet. Apply on the <a href="/staff/jobs">job board</a>.</p>';

    var open = apps.filter(function (a) { return a.status === 'PENDING' || a.status === 'REVIEWED' || a.status === 'SHORTLISTED'; });
    document.getElementById('applicationsSummary').innerHTML = apps.length
      ? '<p>' + open.length + (open.length === 1 ? ' application' : ' applications') + ' waiting for a decision, ' + apps.length + ' in total.</p>' + link('/staff/applications', 'See my applications')
      : '<p class="staff-empty">You have not applied for anything yet.</p>';

    var appliedTo = {};
    apps.forEach(function (a) { appliedTo[a.jobId] = true; });
    var fresh = jobs.filter(function (j) { return !appliedTo[j.id]; }).slice(0, 3);
    document.getElementById('newJobs').innerHTML = fresh.length
      ? '<ul class="staff-list">' + fresh.map(function (j) {
          return '<li class="staff-item"><h3>' + S.esc(j.title) + '</h3>' + S.jobSummary(j) + '</li>';
        }).join('') + '</ul>' + link('/staff/jobs', 'Open the job board')
      : '<p class="staff-empty">Nothing new right now. We will email you when something comes up.</p>';

    document.getElementById('overviewBody').hidden = false;
  }).catch(function (err) {
    if (err && err.message === 'signed-out') return;
    document.getElementById('overviewLede').textContent = 'Could not load your account. Refresh the page to try again.';
  });
})();
