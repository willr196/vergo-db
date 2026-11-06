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
        '<h3>' + S.esc(j.title) + '</h3>' +
        (j.role && j.role.name ? '<p>' + S.esc(j.role.name) + (j.companyName ? ' · ' + S.esc(j.companyName) : '') + '</p>' : '') +
        S.jobSummary(j) +
        (j.description ? '<p>' + S.esc(String(j.description).slice(0, 280)) + (String(j.description).length > 280 ? '…' : '') + '</p>' : '') +
        action(j) +
        '</li>';
    }).join('');
    document.getElementById('jobsEmpty').hidden = jobs.length > 0;
  }

  var jobs = [];
  Promise.all([
    S.profile,
    S.request('GET', '/api/v1/jobs?limit=50'),
    S.request('GET', '/api/v1/job-applications/mine')
  ]).then(function (out) {
    (out[2].body.applications || []).forEach(function (a) { applied[a.jobId] = a; });
    jobs = (out[1].body.data && out[1].body.data.jobs) || out[1].body.jobs || [];
    render(jobs);
  }).catch(function (err) {
    if (err && err.message === 'signed-out') return;
    S.show('jobsStatus', 'Could not load the job board. Refresh to try again.', 'error');
  });

  list.addEventListener('click', function (event) {
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
          render(jobs);
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
