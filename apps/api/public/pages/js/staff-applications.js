/**
 * /staff/applications: every job applied for, newest first, with Withdraw
 * while it is still undecided.
 */
(function () {
  'use strict';
  var S = window.VergoStaff;
  var list = document.getElementById('applicationList');
  var apps = [];
  var CAN_WITHDRAW = { PENDING: true, REVIEWED: true, SHORTLISTED: true };

  function render() {
    list.innerHTML = apps.map(function (a) {
      var st = S.APP_STATUS[a.status] || [a.status, ''];
      var j = a.job || {};
      return '<li class="staff-item">' +
        '<h3>' + S.esc(j.title || 'Job') + S.statusTag(st[0], st[1]) + '</h3>' +
        S.jobSummary(j) +
        '<p>Applied ' + S.esc(S.day(a.createdAt)) + '</p>' +
        (CAN_WITHDRAW[a.status] ? '<div class="btn-row"><button type="button" class="btn btn-secondary" data-withdraw="' + S.esc(a.id) + '">Withdraw</button></div>' : '') +
        '</li>';
    }).join('');
    document.getElementById('applicationsEmpty').hidden = apps.length > 0;
  }

  S.request('GET', '/api/v1/job-applications/mine')
    .then(function (r) {
      apps = r.body.applications || [];
      render();
    })
    .catch(function (err) {
      if (err && err.message === 'signed-out') return;
      S.show('applicationsStatus', 'Could not load your applications. Refresh to try again.', 'error');
    });

  list.addEventListener('click', function (event) {
    var button = event.target.closest('[data-withdraw]');
    if (!button) return;
    var id = button.getAttribute('data-withdraw');
    var app = apps.filter(function (a) { return a.id === id; })[0];
    if (!window.confirm('Withdraw your application for ' + ((app && app.job && app.job.title) || 'this job') + '? You cannot apply for it again.')) return;
    button.disabled = true;
    S.request('POST', '/api/v1/job-applications/' + encodeURIComponent(id) + '/withdraw')
      .then(function (r) {
        if (r.status === 200) {
          if (app) app.status = 'WITHDRAWN';
          S.show('applicationsStatus', 'Application withdrawn.', 'success');
          render();
        } else {
          S.show('applicationsStatus', r.body.error || 'That did not work. Try again.', 'error');
          button.disabled = false;
        }
      })
      .catch(function (err) {
        if (err && err.message === 'signed-out') return;
        S.show('applicationsStatus', 'Could not reach VERGO. Try again.', 'error');
        button.disabled = false;
      });
  });
})();
